CREATE OR REPLACE FUNCTION public.feedback_upsert_customer(p_phone text, p_full_name text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, display_phone text, normalized_phone text, full_name text, last_known_branch_id uuid, do_not_call boolean, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid; v_norm text; v_existing public.feedback_customers%ROWTYPE;
  v_new_name text; v_will_update boolean := false; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_owner := public.get_team_owner_id(auth.uid());
  v_norm  := public.normalize_phone(p_phone);
  IF v_norm IS NULL OR length(v_norm) < 7 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND';
  END IF;

  v_new_name := nullif(trim(p_full_name), '');

  SELECT * INTO v_existing FROM public.feedback_customers fc0
   WHERE fc0.user_id = v_owner AND fc0.normalized_phone = v_norm;

  IF NOT FOUND THEN
    IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','create') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    INSERT INTO public.feedback_customers
      (user_id, display_phone, normalized_phone, full_name, last_known_branch_id)
    VALUES (v_owner, p_phone, v_norm, v_new_name, p_branch_id)
    RETURNING public.feedback_customers.id INTO v_id;

    RETURN QUERY
      SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
             fc.last_known_branch_id, fc.do_not_call, TRUE
      FROM public.feedback_customers fc WHERE fc.id = v_id;
    RETURN;
  END IF;

  v_will_update :=
       (v_new_name IS NOT NULL AND v_new_name IS DISTINCT FROM v_existing.full_name)
    OR (p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_existing.last_known_branch_id);

  IF v_will_update THEN
    IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','edit') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    UPDATE public.feedback_customers fc
       SET full_name = COALESCE(v_new_name, fc.full_name),
           last_known_branch_id = COALESCE(p_branch_id, fc.last_known_branch_id),
           updated_at = now()
     WHERE fc.id = v_existing.id;
  END IF;

  RETURN QUERY
    SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
           fc.last_known_branch_id, fc.do_not_call, FALSE
    FROM public.feedback_customers fc WHERE fc.id = v_existing.id;
END; $function$;