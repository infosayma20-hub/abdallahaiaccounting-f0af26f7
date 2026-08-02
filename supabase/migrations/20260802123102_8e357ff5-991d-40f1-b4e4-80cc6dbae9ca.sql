ALTER TABLE public.hr_chat_threads
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hr_chat_threads_pinned ON public.hr_chat_threads (is_pinned, last_message_at DESC);

CREATE OR REPLACE FUNCTION public.hr_chat_set_pinned(p_thread_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  v_is_emp := v_thread.emp_auth_user_id = auth.uid();
  v_is_hr := public.is_team_member(auth.uid(), v_thread.owner_user_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    );

  IF NOT (v_is_emp OR v_is_hr) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.hr_chat_threads
  SET is_pinned = coalesce(p_pinned, false),
      pinned_at = CASE WHEN coalesce(p_pinned, false) THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_thread_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_chat_mark_unread(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    UPDATE public.hr_chat_threads
    SET unread_for_employee = GREATEST(1, coalesce(unread_for_employee, 0)), updated_at = now()
    WHERE id = p_thread_id;
  ELSIF v_is_hr THEN
    UPDATE public.hr_chat_threads
    SET unread_for_hr = GREATEST(1, coalesce(unread_for_hr, 0)), updated_at = now()
    WHERE id = p_thread_id;
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_chat_set_pinned(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_chat_mark_unread(uuid) TO authenticated;