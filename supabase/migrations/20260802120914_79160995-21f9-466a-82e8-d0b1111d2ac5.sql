-- =========================================================
-- HR <-> Employee simple chat
-- =========================================================

CREATE TABLE public.hr_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  company_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_type text,
  unread_for_employee integer NOT NULL DEFAULT 0,
  unread_for_hr integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_chat_threads_employee_unique UNIQUE (employee_id)
);

GRANT SELECT, INSERT, UPDATE ON public.hr_chat_threads TO authenticated;
GRANT ALL ON public.hr_chat_threads TO service_role;

ALTER TABLE public.hr_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hr_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.hr_chat_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('employee','hr')),
  sender_user_id uuid,
  sender_name text,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  read_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.hr_chat_messages TO authenticated;
GRANT ALL ON public.hr_chat_messages TO service_role;

ALTER TABLE public.hr_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_hr_chat_messages_thread_created
  ON public.hr_chat_messages (thread_id, created_at DESC);
CREATE INDEX idx_hr_chat_threads_owner_last
  ON public.hr_chat_threads (owner_user_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_hr_chat_threads_employee
  ON public.hr_chat_threads (employee_id);

-- ---------------------------------------------------------
-- Security-definer helpers (avoid recursive policy lookups)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_chat_is_my_thread(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_chat_threads t
    JOIN public.employees e ON e.id = t.employee_id
    WHERE t.id = _thread_id
      AND e.auth_user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.hr_chat_is_hr_thread(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_chat_threads t
    WHERE t.id = _thread_id
      AND public.is_team_member(auth.uid(), t.owner_user_id)
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
        OR public.has_role(auth.uid(), 'hr_manager'::app_role)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.hr_chat_employee_of_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id FROM public.employees e
  WHERE e.auth_user_id = auth.uid()
  ORDER BY e.created_at NULLS LAST
  LIMIT 1
$$;

-- ---------------------------------------------------------
-- RLS: threads
-- ---------------------------------------------------------
CREATE POLICY "employee reads own thread"
  ON public.hr_chat_threads FOR SELECT TO authenticated
  USING (employee_id = public.hr_chat_employee_of_user());

CREATE POLICY "employee updates own thread"
  ON public.hr_chat_threads FOR UPDATE TO authenticated
  USING (employee_id = public.hr_chat_employee_of_user())
  WITH CHECK (employee_id = public.hr_chat_employee_of_user());

CREATE POLICY "hr reads company threads"
  ON public.hr_chat_threads FOR SELECT TO authenticated
  USING (
    public.is_team_member(auth.uid(), owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    )
  );

CREATE POLICY "hr manages company threads"
  ON public.hr_chat_threads FOR UPDATE TO authenticated
  USING (
    public.is_team_member(auth.uid(), owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    )
  )
  WITH CHECK (
    public.is_team_member(auth.uid(), owner_user_id)
  );

CREATE POLICY "hr creates company threads"
  ON public.hr_chat_threads FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_member(auth.uid(), owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    )
  );

-- ---------------------------------------------------------
-- RLS: messages
-- ---------------------------------------------------------
CREATE POLICY "employee reads own messages"
  ON public.hr_chat_messages FOR SELECT TO authenticated
  USING (public.hr_chat_is_my_thread(thread_id));

CREATE POLICY "employee sends own messages"
  ON public.hr_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.hr_chat_is_my_thread(thread_id)
    AND sender_type = 'employee'
    AND sender_user_id = auth.uid()
  );

CREATE POLICY "hr reads company messages"
  ON public.hr_chat_messages FOR SELECT TO authenticated
  USING (public.hr_chat_is_hr_thread(thread_id));

CREATE POLICY "hr sends company messages"
  ON public.hr_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.hr_chat_is_hr_thread(thread_id)
    AND sender_type = 'hr'
    AND sender_user_id = auth.uid()
  );

CREATE POLICY "hr soft deletes company messages"
  ON public.hr_chat_messages FOR UPDATE TO authenticated
  USING (public.hr_chat_is_hr_thread(thread_id))
  WITH CHECK (public.hr_chat_is_hr_thread(thread_id));

-- ---------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_chat_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_chat_threads_updated_at
  BEFORE UPDATE ON public.hr_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.hr_chat_touch_updated_at();

-- ---------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_chat_get_or_create_thread(p_employee_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp record;
  v_thread_id uuid;
  v_is_hr boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_employee_id IS NULL THEN
    SELECT * INTO v_emp FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
    ORDER BY e.created_at NULLS LAST LIMIT 1;
  ELSE
    SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
  END IF;

  IF v_emp.id IS NULL THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;

  v_is_hr := public.is_team_member(auth.uid(), v_emp.user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    );

  IF NOT v_is_hr AND v_emp.auth_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id INTO v_thread_id FROM public.hr_chat_threads WHERE employee_id = v_emp.id;
  IF v_thread_id IS NULL THEN
    INSERT INTO public.hr_chat_threads (employee_id, owner_user_id, company_id)
    VALUES (v_emp.id, v_emp.user_id, v_emp.company_id)
    ON CONFLICT (employee_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_thread_id;
  END IF;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_chat_get_or_create_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_chat_get_or_create_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_chat_send_message(p_thread_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_is_hr boolean;
  v_is_emp boolean;
  v_sender_type text;
  v_name text;
  v_msg_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF length(v_body) > 2000 THEN
    v_body := left(v_body, 2000);
  END IF;

  SELECT t.*, e.auth_user_id AS emp_auth_user_id, e.full_name AS emp_name
  INTO v_thread
  FROM public.hr_chat_threads t
  JOIN public.employees e ON e.id = t.employee_id
  WHERE t.id = p_thread_id;

  IF v_thread.id IS NULL THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  v_is_emp := v_thread.emp_auth_user_id = auth.uid();
  v_is_hr := public.is_team_member(auth.uid(), v_thread.owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    );

  IF v_is_emp THEN
    v_sender_type := 'employee';
    v_name := v_thread.emp_name;
  ELSIF v_is_hr THEN
    v_sender_type := 'hr';
    v_name := 'الموارد البشرية';
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.hr_chat_messages (thread_id, sender_type, sender_user_id, sender_name, body)
  VALUES (p_thread_id, v_sender_type, auth.uid(), v_name, v_body)
  RETURNING id INTO v_msg_id;

  UPDATE public.hr_chat_threads
  SET last_message_at = now(),
      last_message_preview = left(v_body, 140),
      last_sender_type = v_sender_type,
      unread_for_hr = CASE WHEN v_sender_type = 'employee' THEN unread_for_hr + 1 ELSE unread_for_hr END,
      unread_for_employee = CASE WHEN v_sender_type = 'hr' THEN unread_for_employee + 1 ELSE unread_for_employee END,
      is_archived = false,
      updated_at = now()
  WHERE id = p_thread_id;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_chat_send_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_chat_send_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_chat_mark_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_is_hr boolean;
  v_is_emp boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT t.*, e.auth_user_id AS emp_auth_user_id
  INTO v_thread
  FROM public.hr_chat_threads t
  JOIN public.employees e ON e.id = t.employee_id
  WHERE t.id = p_thread_id;

  IF v_thread.id IS NULL THEN
    RETURN;
  END IF;

  v_is_emp := v_thread.emp_auth_user_id = auth.uid();
  v_is_hr := public.is_team_member(auth.uid(), v_thread.owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    );

  IF v_is_emp THEN
    UPDATE public.hr_chat_threads SET unread_for_employee = 0 WHERE id = p_thread_id;
    UPDATE public.hr_chat_messages SET read_at = now()
      WHERE thread_id = p_thread_id AND sender_type = 'hr' AND read_at IS NULL;
  ELSIF v_is_hr THEN
    UPDATE public.hr_chat_threads SET unread_for_hr = 0 WHERE id = p_thread_id;
    UPDATE public.hr_chat_messages SET read_at = now()
      WHERE thread_id = p_thread_id AND sender_type = 'employee' AND read_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_chat_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_chat_mark_read(uuid) TO authenticated;

-- ---------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------
ALTER TABLE public.hr_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.hr_chat_threads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_chat_threads;