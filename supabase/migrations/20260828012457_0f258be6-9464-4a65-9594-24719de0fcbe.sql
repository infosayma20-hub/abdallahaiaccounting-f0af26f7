REVOKE EXECUTE ON FUNCTION public.create_contact_offline(uuid, jsonb, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_account_offline(uuid, jsonb, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_employee_offline(uuid, jsonb, text) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_contact_offline(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_account_offline(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_employee_offline(uuid, jsonb, text) TO authenticated, service_role;