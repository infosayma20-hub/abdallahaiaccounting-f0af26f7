
CREATE OR REPLACE FUNCTION public.add_holding_member_by_email(
  p_holding_id uuid,
  p_email      text,
  p_role       text DEFAULT 'holding_viewer'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.holding_members hm
            WHERE hm.holding_id = p_holding_id
              AND hm.auth_user_id = auth.uid()
              AND hm.role = 'holding_admin')
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: لا يوجد حساب بهذا الإيميل %', p_email
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.add_holding_member(p_holding_id, v_uid, p_role);
  RETURN v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_holding_member_by_email(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_companies()
RETURNS TABLE (owner_id uuid, company_id uuid, name text, tax_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.owner_id, c.id, c.name, c.tax_number
    FROM public.companies c
    WHERE COALESCE(c.is_active, true) = true
    ORDER BY c.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_companies() TO authenticated;
