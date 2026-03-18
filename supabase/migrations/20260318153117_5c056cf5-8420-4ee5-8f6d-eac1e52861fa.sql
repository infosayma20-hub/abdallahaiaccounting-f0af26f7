
-- Function to create task user with hashed password
CREATE OR REPLACE FUNCTION public.create_task_user(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_password text,
  p_role text DEFAULT 'staff',
  p_avatar_color text DEFAULT '#1B3A5C'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.task_users (user_id, full_name, username, password_hash, role, avatar_color)
  VALUES (p_user_id, p_full_name, p_username, crypt(p_password, gen_salt('bf')), p_role, p_avatar_color)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'اسم المستخدم موجود مسبقاً');
END;
$$;

-- Function to verify task user password
CREATE OR REPLACE FUNCTION public.verify_task_password(p_user_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.task_users WHERE id = p_user_id AND is_active = true;
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;

-- Function to set task user password
CREATE OR REPLACE FUNCTION public.set_task_user_password(p_task_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE public.task_users SET password_hash = crypt(p_new_password, gen_salt('bf')) WHERE id = p_task_user_id;
  RETURN FOUND;
END;
$$;
