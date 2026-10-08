CREATE OR REPLACE FUNCTION public.set_employee_hr_manager(_employee_id uuid, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_email text;
  v_tpl jsonb;
  v_rec public.hr_manager_permissions;
BEGIN
  SELECT id, user_id, auth_user_id, full_name INTO e FROM public.employees WHERE id = _employee_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'الموظف غير موجود'; END IF;
  -- المالك فقط (أو السوبر أدمن) يسند صفة مدير الموارد
  IF NOT (v_uid = e.user_id OR public.has_role(v_uid, 'super_admin')) THEN
    RAISE EXCEPTION 'صلاحية إسناد مدير الموارد للمالك فقط';
  END IF;
  IF e.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'الموظف ليس له حساب دخول — فعّل حسابه أولاً';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = e.auth_user_id;

  IF _enabled THEN
    UPDATE public.employees SET is_hr_manager = true WHERE id = e.id;
    INSERT INTO public.user_roles(user_id, role) VALUES (e.auth_user_id, 'hr_manager')
      ON CONFLICT DO NOTHING;
    IF EXISTS (SELECT 1 FROM public.hr_manager_permissions WHERE hr_auth_id = e.auth_user_id AND user_id = e.user_id) THEN
      UPDATE public.hr_manager_permissions SET is_active = true, updated_at = now()
       WHERE hr_auth_id = e.auth_user_id AND user_id = e.user_id;
    ELSE
      -- نسخ صلاحيات أحدث مدير موارد فعّال لنفس الشركة، وإلا صلاحيات كاملة عدا شكاوى الإدارة العليا
      SELECT to_jsonb(h) INTO v_tpl FROM public.hr_manager_permissions h
       WHERE h.user_id = e.user_id AND h.is_active ORDER BY h.updated_at DESC LIMIT 1;
      IF v_tpl IS NULL THEN
        SELECT jsonb_object_agg(column_name, column_name <> 'can_view_executive_complaints') INTO v_tpl
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='hr_manager_permissions' AND column_name LIKE 'can\_%';
      END IF;
      v_tpl := v_tpl || jsonb_build_object('id', gen_random_uuid(), 'user_id', e.user_id, 'hr_auth_id', e.auth_user_id,
        'full_name', e.full_name, 'email', v_email, 'is_active', true, 'created_at', now(), 'updated_at', now());
      v_rec := jsonb_populate_record(NULL::public.hr_manager_permissions, v_tpl);
      INSERT INTO public.hr_manager_permissions SELECT v_rec.*;
    END IF;
  ELSE
    UPDATE public.employees SET is_hr_manager = false WHERE id = e.id;
    DELETE FROM public.user_roles WHERE user_id = e.auth_user_id AND role = 'hr_manager';
    UPDATE public.hr_manager_permissions SET is_active = false, updated_at = now()
     WHERE hr_auth_id = e.auth_user_id AND user_id = e.user_id;
  END IF;

  INSERT INTO public.activity_log(user_id, actor_id, action, entity_type, entity_id, entity_label, details)
  VALUES (e.user_id, v_uid, CASE WHEN _enabled THEN 'hr_manager_granted' ELSE 'hr_manager_revoked' END,
          'employee', e.id::text, e.full_name, jsonb_build_object('auth_user_id', e.auth_user_id, 'email', v_email));
  RETURN jsonb_build_object('ok', true, 'enabled', _enabled);
END $$;
REVOKE ALL ON FUNCTION public.set_employee_hr_manager(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_hr_manager(uuid, boolean) TO authenticated;