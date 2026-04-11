-- 1. TENANT ISOLATION: attendance_audit_logs
DROP POLICY IF EXISTS "HR managers can view audit logs" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "hr_admin_select_audit_logs" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "Tenant-scoped audit log read" ON public.attendance_audit_logs;

CREATE POLICY "Tenant-scoped audit log read"
ON public.attendance_audit_logs FOR SELECT
TO authenticated
USING (
  changed_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_audit_logs.record_id::uuid
    AND e.user_id = public.get_team_owner_id(auth.uid())
  )
);

-- 2. TENANT ISOLATION: sensitive_data_audit
DROP POLICY IF EXISTS "Admins can view sensitive data audit" ON public.sensitive_data_audit;
DROP POLICY IF EXISTS "admin_select_sensitive_audit" ON public.sensitive_data_audit;
DROP POLICY IF EXISTS "Tenant-scoped sensitive audit read" ON public.sensitive_data_audit;

CREATE POLICY "Tenant-scoped sensitive audit read"
ON public.sensitive_data_audit FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR user_id = public.get_team_owner_id(auth.uid())
);

-- 3. STORAGE: travel-documents — remove broad policies
DROP POLICY IF EXISTS "travel_docs_read_v2" ON storage.objects;
DROP POLICY IF EXISTS "travel_docs_upload_v2" ON storage.objects;
DROP POLICY IF EXISTS "travel_docs_delete_v2" ON storage.objects;

-- 4. STORAGE: employee-forms — remove broad SELECT
DROP POLICY IF EXISTS "Anyone can view form attachments" ON storage.objects;

-- 5. CUSTOMER SURVEYS: require token
DROP POLICY IF EXISTS "Anyone can complete survey by token" ON public.customer_surveys;
DROP POLICY IF EXISTS "Complete survey requires matching token" ON public.customer_surveys;

CREATE POLICY "Complete survey requires matching token"
ON public.customer_surveys FOR UPDATE
USING (
  status IN ('sent', 'opened')
  AND survey_token IS NOT NULL
  AND survey_token = current_setting('request.headers', true)::json->>'x-survey-token'
)
WITH CHECK (
  status IN ('sent', 'opened')
  AND survey_token IS NOT NULL
  AND survey_token = current_setting('request.headers', true)::json->>'x-survey-token'
);

-- 6-9. CREDENTIAL HIDING
REVOKE SELECT (password_hash) ON public.task_users FROM anon, authenticated;
REVOKE SELECT (password_hash) ON public.malaki_portal_users FROM anon, authenticated;
REVOKE SELECT (secret_key) ON public.branches FROM anon, authenticated;
REVOKE SELECT (pin_hash) ON public.pos_users FROM anon, authenticated;

-- 10. STORAGE: loan-attachments ownership
DROP POLICY IF EXISTS "Authenticated users can upload loan attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their loan attachments" ON storage.objects;

CREATE POLICY "Owner upload loan attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'loan-attachments' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Owner delete loan attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'loan-attachments' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 11. STORAGE: purchase-invoices ownership
DROP POLICY IF EXISTS "Auth users can upload purchase invoices" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete own purchase invoices" ON storage.objects;

CREATE POLICY "Owner upload purchase invoices"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'purchase-invoices' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Owner delete purchase invoices"
ON storage.objects FOR DELETE
USING (bucket_id = 'purchase-invoices' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 12. STORAGE: workshop-images ownership on DELETE
DROP POLICY IF EXISTS "Users can delete own workshop images" ON storage.objects;

CREATE POLICY "Owner delete workshop images"
ON storage.objects FOR DELETE
USING (bucket_id = 'workshop-images' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = (auth.uid())::text);