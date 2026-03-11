
CREATE OR REPLACE FUNCTION public.verify_malaki_login(p_username text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM public.malaki_portal_users
  WHERE username = lower(trim(p_username)) AND is_active = true;
  IF v_user IS NULL OR v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  END IF;
  UPDATE public.malaki_portal_users SET last_login = NOW() WHERE id = v_user.id;
  RETURN jsonb_build_object('success', true, 'user', jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'full_name', v_user.full_name,
    'role', v_user.role, 'can_see_sales', v_user.can_see_sales,
    'can_see_liquidity', v_user.can_see_liquidity,
    'can_see_all_branches', v_user.can_see_all_branches,
    'allowed_branch_ids', v_user.allowed_branch_ids
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.malaki_create_user(p_username text, p_password text, p_full_name text, p_role text DEFAULT 'viewer', p_can_see_sales boolean DEFAULT true, p_can_see_liquidity boolean DEFAULT true, p_can_see_all_branches boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.malaki_portal_users (username, password_hash, full_name, role, can_see_sales, can_see_liquidity, can_see_all_branches)
  VALUES (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_full_name, p_role, p_can_see_sales, p_can_see_liquidity, p_can_see_all_branches)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'اسم المستخدم موجود مسبقاً');
END;
$function$;

CREATE OR REPLACE FUNCTION public.malaki_set_password(p_user_id uuid, p_new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE public.malaki_portal_users SET password_hash = crypt(p_new_password, gen_salt('bf')) WHERE id = p_user_id;
  RETURN FOUND;
END;
$function$;

-- Re-hash the admin password now that crypt is accessible
UPDATE public.malaki_portal_users 
SET password_hash = crypt('Malaki2024!', gen_salt('bf'))
WHERE username = 'admin';
