-- قراءة مسارات مرفقات نماذج التشييك المؤقتة (مجلد t90) الأقدم من 3 شهور.
-- للاستخدام من وظيفة التنظيف الدورية فقط (service_role).
CREATE OR REPLACE FUNCTION public.list_expired_form_attachments(p_days integer DEFAULT 90, p_limit integer DEFAULT 500)
RETURNS TABLE(object_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'employee-forms'
    AND o.name LIKE '%/t90/%'
    AND o.created_at < now() - make_interval(days => p_days)
  ORDER BY o.created_at
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.list_expired_form_attachments(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_form_attachments(integer, integer) TO service_role;