CREATE OR REPLACE FUNCTION public.holding_company_emails(p_holding_id uuid)
RETURNS TABLE (owner_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_holding_member(p_holding_id, auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT hc.owner_id, u.email::text
    FROM public.holding_companies hc
    JOIN auth.users u ON u.id = hc.owner_id
    WHERE hc.holding_id = p_holding_id AND hc.is_active;
END;
$$;
GRANT EXECUTE ON FUNCTION public.holding_company_emails(uuid) TO authenticated;