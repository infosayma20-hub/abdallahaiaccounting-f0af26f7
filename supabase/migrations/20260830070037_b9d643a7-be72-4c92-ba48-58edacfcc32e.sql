REVOKE EXECUTE ON FUNCTION public.is_own_employee_row(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_employee_documents(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_employee_doc_object(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_own_employee_row(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_documents(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee_doc_object(uuid, text) TO authenticated;