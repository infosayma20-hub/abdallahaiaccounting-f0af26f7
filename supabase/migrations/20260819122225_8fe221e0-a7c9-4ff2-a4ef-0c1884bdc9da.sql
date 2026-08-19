REVOKE EXECUTE ON FUNCTION public.get_form_catalog(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_form_audience(text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_form_access(text, text, boolean, uuid[], text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_form_admin_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_form_catalog(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_form_audience(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_form_access(text, text, boolean, uuid[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_form_admin_owner() TO authenticated;