CREATE OR REPLACE FUNCTION public.hr_chat_delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg record;
  v_last record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_msg FROM public.hr_chat_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RETURN;
  END IF;
  IF v_msg.sender_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_msg.sender_type = 'employee' THEN
    RAISE EXCEPTION 'delete_not_allowed_for_employee';
  END IF;

  UPDATE public.hr_chat_messages
  SET is_deleted = true, deleted_at = now()
  WHERE id = p_message_id;

  SELECT m.* INTO v_last
  FROM public.hr_chat_messages m
  WHERE m.thread_id = v_msg.thread_id AND m.is_deleted = false
  ORDER BY m.created_at DESC
  LIMIT 1;

  UPDATE public.hr_chat_threads
  SET last_message_at = v_last.created_at,
      last_message_preview = left(coalesce(v_last.body, ''), 140),
      last_sender_type = v_last.sender_type,
      updated_at = now()
  WHERE id = v_msg.thread_id;
END;
$$;