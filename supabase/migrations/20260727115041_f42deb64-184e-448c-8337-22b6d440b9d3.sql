-- =====================================================================
-- Internal Messages (HR ↔ Accounting ↔ Owner) with reminders
-- =====================================================================

-- 1) Parent messages
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                       -- tenant / dataOwnerId
  sender_id uuid NOT NULL,                     -- auth.users.id of sender
  sender_name text,
  subject text NOT NULL,
  body text NOT NULL,
  context_type text,                            -- 'employee' | 'loan' | 'invoice' | 'contact' | null
  context_id uuid,
  context_label text,
  remind_at date,
  reminder_sent_at timestamptz,
  status text NOT NULL DEFAULT 'open',          -- 'open' | 'done' | 'archived'
  priority text NOT NULL DEFAULT 'normal',      -- 'low' | 'normal' | 'high'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_messages_owner_status ON public.internal_messages(user_id, status, created_at DESC);
CREATE INDEX idx_internal_messages_sender ON public.internal_messages(sender_id, created_at DESC);
CREATE INDEX idx_internal_messages_remind ON public.internal_messages(remind_at) WHERE remind_at IS NOT NULL AND reminder_sent_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_messages TO authenticated;
GRANT ALL ON public.internal_messages TO service_role;

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- 2) Recipients (one row per recipient / role broadcast)
CREATE TABLE public.internal_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,                       -- tenant / dataOwnerId (denormalized)
  recipient_user_id uuid,                      -- specific user (nullable when role-based)
  recipient_role text,                          -- app_role value (nullable when user-specific)
  cc boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipient_target_present CHECK (recipient_user_id IS NOT NULL OR recipient_role IS NOT NULL)
);

CREATE INDEX idx_imr_message ON public.internal_message_recipients(message_id);
CREATE INDEX idx_imr_recipient_user ON public.internal_message_recipients(recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX idx_imr_role ON public.internal_message_recipients(user_id, recipient_role) WHERE recipient_role IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_message_recipients TO authenticated;
GRANT ALL ON public.internal_message_recipients TO service_role;

ALTER TABLE public.internal_message_recipients ENABLE ROW LEVEL SECURITY;

-- 3) Replies (thread)
CREATE TABLE public.internal_message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,                       -- tenant
  sender_id uuid NOT NULL,
  sender_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_imrp_message ON public.internal_message_replies(message_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.internal_message_replies TO authenticated;
GRANT ALL ON public.internal_message_replies TO service_role;

ALTER TABLE public.internal_message_replies ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Visibility helper: does auth.uid() have visibility to this message?
-- SECURITY DEFINER to avoid RLS recursion when RLS checks recipients.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.can_view_internal_message(_message_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE m.id = _message_id
      AND (
        m.sender_id = _uid
        OR public.is_team_member(_uid, m.user_id) AND (
          public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'super_admin'::public.app_role)
        )
        OR EXISTS (
          SELECT 1 FROM public.internal_message_recipients r
          WHERE r.message_id = m.id
            AND (
              r.recipient_user_id = _uid
              OR (r.recipient_role IS NOT NULL
                  AND public.has_role(_uid, r.recipient_role::public.app_role))
            )
        )
      )
  );
$$;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- internal_messages
CREATE POLICY "im_select_visible"
ON public.internal_messages FOR SELECT TO authenticated
USING (public.can_view_internal_message(id, auth.uid()));

CREATE POLICY "im_insert_by_team_member"
ON public.internal_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_team_member(auth.uid(), user_id)
);

CREATE POLICY "im_update_sender_or_admin"
ON public.internal_messages FOR UPDATE TO authenticated
USING (
  sender_id = auth.uid()
  OR (public.is_team_member(auth.uid(), user_id)
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
)
WITH CHECK (
  sender_id = auth.uid()
  OR (public.is_team_member(auth.uid(), user_id)
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
);

CREATE POLICY "im_delete_sender_or_admin"
ON public.internal_messages FOR DELETE TO authenticated
USING (
  sender_id = auth.uid()
  OR (public.is_team_member(auth.uid(), user_id)
      AND public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- internal_message_recipients
CREATE POLICY "imr_select_visible"
ON public.internal_message_recipients FOR SELECT TO authenticated
USING (public.can_view_internal_message(message_id, auth.uid()));

CREATE POLICY "imr_insert_sender_or_team_admin"
ON public.internal_message_recipients FOR INSERT TO authenticated
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  )
);

CREATE POLICY "imr_update_recipient_or_sender"
ON public.internal_message_recipients FOR UPDATE TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND public.has_role(auth.uid(), recipient_role::public.app_role))
  OR EXISTS (SELECT 1 FROM public.internal_messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
)
WITH CHECK (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND public.has_role(auth.uid(), recipient_role::public.app_role))
  OR EXISTS (SELECT 1 FROM public.internal_messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
);

CREATE POLICY "imr_delete_sender"
ON public.internal_message_recipients FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.internal_messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
);

-- internal_message_replies
CREATE POLICY "imrp_select_visible"
ON public.internal_message_replies FOR SELECT TO authenticated
USING (public.can_view_internal_message(message_id, auth.uid()));

CREATE POLICY "imrp_insert_visible"
ON public.internal_message_replies FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_team_member(auth.uid(), user_id)
  AND public.can_view_internal_message(message_id, auth.uid())
);

CREATE POLICY "imrp_delete_sender"
ON public.internal_message_replies FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- =====================================================================
-- updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_internal_messages_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_internal_messages_touch
BEFORE UPDATE ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_internal_messages_touch();

-- =====================================================================
-- Realtime
-- =====================================================================
ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;
ALTER TABLE public.internal_message_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.internal_message_replies REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_message_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_message_replies;

-- =====================================================================
-- send_internal_message RPC
-- Accepts a JSONB array of recipients:
--   [{"user_id":"uuid"},{"role":"accountant_senior"},{"role":"admin","cc":true}]
-- =====================================================================
CREATE OR REPLACE FUNCTION public.send_internal_message(
  _subject text,
  _body text,
  _recipients jsonb,
  _remind_at date DEFAULT NULL,
  _context_type text DEFAULT NULL,
  _context_id uuid DEFAULT NULL,
  _context_label text DEFAULT NULL,
  _priority text DEFAULT 'normal'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _msg_id uuid;
  _rec jsonb;
  _sender_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _subject IS NULL OR length(trim(_subject)) = 0 THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 THEN
    RAISE EXCEPTION 'body required';
  END IF;
  IF _recipients IS NULL OR jsonb_array_length(_recipients) = 0 THEN
    RAISE EXCEPTION 'at least one recipient required';
  END IF;

  _owner := public.get_team_owner_id(_uid);

  -- best-effort sender display name
  SELECT COALESCE(e.full_name, p.full_name, au.email)
    INTO _sender_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.employees e ON e.auth_user_id = au.id AND COALESCE(e.is_active, true)
  WHERE au.id = _uid
  LIMIT 1;

  INSERT INTO public.internal_messages (
    user_id, sender_id, sender_name, subject, body,
    context_type, context_id, context_label,
    remind_at, priority
  ) VALUES (
    _owner, _uid, _sender_name, trim(_subject), _body,
    NULLIF(_context_type,''), _context_id, NULLIF(_context_label,''),
    _remind_at, COALESCE(NULLIF(_priority,''), 'normal')
  ) RETURNING id INTO _msg_id;

  FOR _rec IN SELECT * FROM jsonb_array_elements(_recipients)
  LOOP
    INSERT INTO public.internal_message_recipients (
      message_id, user_id, recipient_user_id, recipient_role, cc
    ) VALUES (
      _msg_id,
      _owner,
      NULLIF(_rec->>'user_id','')::uuid,
      NULLIF(_rec->>'role',''),
      COALESCE((_rec->>'cc')::boolean, false)
    );
  END LOOP;

  RETURN _msg_id;
END $$;

GRANT EXECUTE ON FUNCTION public.send_internal_message(text, text, jsonb, date, text, uuid, text, text) TO authenticated;

-- =====================================================================
-- Recipient status helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mark_internal_message_read(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE public.internal_message_recipients
     SET read_at = COALESCE(read_at, now())
   WHERE message_id = _message_id
     AND (recipient_user_id = _uid
          OR (recipient_role IS NOT NULL
              AND public.has_role(_uid, recipient_role::public.app_role)));
END $$;
GRANT EXECUTE ON FUNCTION public.mark_internal_message_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_internal_message_done(_message_id uuid, _done boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  -- update recipient stamp
  UPDATE public.internal_message_recipients
     SET done_at = CASE WHEN _done THEN COALESCE(done_at, now()) ELSE NULL END,
         read_at = COALESCE(read_at, now())
   WHERE message_id = _message_id
     AND (recipient_user_id = _uid
          OR (recipient_role IS NOT NULL
              AND public.has_role(_uid, recipient_role::public.app_role)));
  -- if everyone is done, close the parent
  IF _done THEN
    UPDATE public.internal_messages m
       SET status = 'done'
     WHERE m.id = _message_id
       AND NOT EXISTS (
         SELECT 1 FROM public.internal_message_recipients r
         WHERE r.message_id = m.id AND r.done_at IS NULL
       );
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_internal_message_done(uuid, boolean) TO authenticated;

-- =====================================================================
-- Reminder dispatcher — pushes due reminders into notification_queue.
-- Runs safely idempotent via reminder_sent_at.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dispatch_internal_message_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _m record;
  _r record;
BEGIN
  FOR _m IN
    SELECT * FROM public.internal_messages
     WHERE remind_at IS NOT NULL
       AND reminder_sent_at IS NULL
       AND status = 'open'
       AND remind_at <= (now() AT TIME ZONE 'Asia/Jerusalem')::date
  LOOP
    -- enqueue one notification per resolved recipient user
    FOR _r IN
      SELECT DISTINCT COALESCE(rc.recipient_user_id, ur.user_id) AS uid
      FROM public.internal_message_recipients rc
      LEFT JOIN public.user_roles ur
        ON rc.recipient_role IS NOT NULL
       AND ur.role::text = rc.recipient_role
       AND public.get_team_owner_id(ur.user_id) = _m.user_id
      WHERE rc.message_id = _m.id
    LOOP
      IF _r.uid IS NULL THEN CONTINUE; END IF;
      BEGIN
        INSERT INTO public.notification_queue (
          owner_id, recipient_user_id, event_type, sensitivity,
          title, body, data, path, priority, dedup_key,
          scheduled_for, source_created_at, status
        ) VALUES (
          _m.user_id, _r.uid, 'internal_message_reminder', 'normal',
          'تذكير: ' || _m.subject,
          COALESCE(_m.body, ''),
          jsonb_build_object('message_id', _m.id, 'remind_at', _m.remind_at),
          '/internal-messages?open=' || _m.id::text,
          5,
          'im_remind:' || _m.id::text || ':' || _r.uid::text,
          now(), now(), 'pending'
        );
        _count := _count + 1;
      EXCEPTION WHEN unique_violation THEN
        -- already enqueued for this recipient
        NULL;
      END;
    END LOOP;

    UPDATE public.internal_messages
       SET reminder_sent_at = now()
     WHERE id = _m.id;
  END LOOP;

  RETURN _count;
END $$;

GRANT EXECUTE ON FUNCTION public.dispatch_internal_message_reminders() TO service_role;