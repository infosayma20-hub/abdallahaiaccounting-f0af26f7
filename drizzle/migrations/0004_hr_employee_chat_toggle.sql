ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_employee_chat_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.hr_chat_send_message(p_thread_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread record;
  v_is_hr boolean;
  v_is_emp boolean;
  v_sender_type text;
  v_name text;
  v_msg_id uuid;
  v_chat_enabled boolean;
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

  -- Company-level switch: when HR turns the employee chat off, nobody can post
  -- new messages in that tenant (history stays readable).
  SELECT cs.hr_employee_chat_enabled INTO v_chat_enabled
  FROM public.company_settings cs
  WHERE cs.user_id = v_thread.owner_user_id;

  IF v_chat_enabled IS false THEN
    RAISE EXCEPTION 'chat_disabled';
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
$function$;