ALTER TABLE public.hr_chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.hr_chat_edit_message(p_message_id uuid, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_msg record;
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

  SELECT * INTO v_msg FROM public.hr_chat_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;
  IF v_msg.sender_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_msg.is_deleted THEN
    RAISE EXCEPTION 'message_deleted';
  END IF;

  UPDATE public.hr_chat_messages
  SET body = v_body, edited_at = now()
  WHERE id = p_message_id;

  UPDATE public.hr_chat_threads t
  SET last_message_preview = left(v_body, 140), updated_at = now()
  WHERE t.id = v_msg.thread_id
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_chat_messages m2
      WHERE m2.thread_id = v_msg.thread_id
        AND m2.is_deleted = false
        AND m2.created_at > v_msg.created_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_chat_delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.hr_chat_edit_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_chat_delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_chat_edit_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_chat_delete_message(uuid) TO authenticated;