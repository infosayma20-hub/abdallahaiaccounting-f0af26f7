DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(u.id) INTO v_ids
  FROM auth.users u
  WHERE u.email ~ '^malakybroast([1-9]|[1-4][0-9]|50)@gmail\.com$'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id AND ur.role IN ('admin','super_admin')
    );

  IF v_ids IS NULL OR array_length(v_ids,1) = 0 THEN
    RAISE NOTICE 'No matching users to delete';
    RETURN;
  END IF;

  -- App data cleanup
  DELETE FROM public.pos_users                  WHERE auth_user_id = ANY(v_ids);
  UPDATE public.pos_sessions SET cashier_auth_user_id = NULL WHERE cashier_auth_user_id = ANY(v_ids);
  UPDATE public.employees    SET auth_user_id        = NULL WHERE auth_user_id        = ANY(v_ids);
  UPDATE public.item_categories       SET user_id = NULL WHERE user_id = ANY(v_ids);
  UPDATE public.procurement_items     SET user_id = NULL WHERE user_id = ANY(v_ids);
  UPDATE public.procurement_requests  SET approved_by = NULL WHERE approved_by = ANY(v_ids);
  UPDATE public.procurement_requests  SET worker_id   = NULL WHERE worker_id   = ANY(v_ids);
  UPDATE public.tax_submissions       SET created_by  = NULL WHERE created_by  = ANY(v_ids);

  DELETE FROM public.user_roles                 WHERE user_id        = ANY(v_ids);
  DELETE FROM public.user_app_access_overrides  WHERE target_user_id = ANY(v_ids);
  DELETE FROM public.user_feature_permissions   WHERE target_user_id = ANY(v_ids);
  DELETE FROM public.profiles                   WHERE user_id        = ANY(v_ids);
  DELETE FROM auth.users                        WHERE id             = ANY(v_ids);

  RAISE NOTICE 'Deleted % trial users', array_length(v_ids,1);
END $$;