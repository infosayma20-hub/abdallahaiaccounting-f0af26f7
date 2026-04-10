
-- =============================================
-- FIX 1: Remove privilege escalation in user_can_access
-- Remove the "OR NOT EXISTS" fallback that grants full access to users without roles
-- =============================================
CREATE OR REPLACE FUNCTION public.user_can_access(_user_id uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      ur.role IN ('super_admin', 'admin', 'accountant_senior')
      OR (ur.role = 'accountant_sales' AND _module IN ('sales', 'contacts', 'invoices', 'orders', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'accountant_purchases' AND _module IN ('purchases', 'contacts', 'inventory', 'products', 'stock', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'cashier' AND _module IN ('pos', 'products', 'contacts'))
      OR (ur.role = 'employee' AND _module IN ('employee_self'))
      OR (ur.role = 'hr_manager' AND _module IN ('hr', 'employees', 'attendance', 'payroll', 'leaves'))
      OR (ur.role::text = 'store_tracker' AND _module IN ('orders', 'order_reports'))
    )
  )
$$;

-- =============================================
-- FIX 2: Storage - passport-documents (restrict SELECT + INSERT to owner path)
-- =============================================
DROP POLICY IF EXISTS "Users can view passport documents" ON storage.objects;
CREATE POLICY "Users can view own passport documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'passport-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload passport documents" ON storage.objects;
CREATE POLICY "Users can upload own passport documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'passport-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- FIX 3: Storage - employee-forms (restrict SELECT to owner path)
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view employee forms" ON storage.objects;
CREATE POLICY "Users can view own employee forms"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'employee-forms'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can upload employee forms" ON storage.objects;
CREATE POLICY "Users can upload own employee forms"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'employee-forms'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- FIX 4: Storage - loan-attachments (make private, restrict access)
-- =============================================
UPDATE storage.buckets SET public = false WHERE id = 'loan-attachments';

DROP POLICY IF EXISTS "Anyone can view loan attachments" ON storage.objects;
CREATE POLICY "Users can view own loan attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'loan-attachments'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload loan attachments" ON storage.objects;
CREATE POLICY "Users can upload own loan attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'loan-attachments'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- FIX 5: Storage - purchase-invoices (make private, restrict access)
-- =============================================
UPDATE storage.buckets SET public = false WHERE id = 'purchase-invoices';

DROP POLICY IF EXISTS "Anyone can view purchase invoices" ON storage.objects;
CREATE POLICY "Users can view own purchase invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'purchase-invoices'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload purchase invoices" ON storage.objects;
CREATE POLICY "Users can upload own purchase invoices"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'purchase-invoices'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- FIX 6: Storage - travel-documents (restrict SELECT/DELETE to owner path)
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view travel documents" ON storage.objects;
CREATE POLICY "Users can view own travel documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'travel-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can upload travel documents" ON storage.objects;
CREATE POLICY "Users can upload own travel documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'travel-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can delete travel documents" ON storage.objects;
CREATE POLICY "Users can delete own travel documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'travel-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- FIX 7: Restrict unauthenticated INSERT on pbx_call_events
-- =============================================
DROP POLICY IF EXISTS "Service can insert call events" ON public.pbx_call_events;
CREATE POLICY "Authenticated users can insert own call events"
ON public.pbx_call_events FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- =============================================
-- FIX 8: Restrict unauthenticated INSERT on qamar_orders and qamar_order_items
-- =============================================
DROP POLICY IF EXISTS "Service role can insert qamar orders" ON public.qamar_orders;
CREATE POLICY "Authenticated users can insert own qamar orders"
ON public.qamar_orders FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert qamar order items" ON public.qamar_order_items;
CREATE POLICY "Authenticated users can insert qamar order items"
ON public.qamar_order_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.qamar_orders qo
    WHERE qo.id = order_id AND qo.user_id = auth.uid()
  )
);

-- =============================================
-- FIX 9: Restrict unauthenticated INSERT on sync_audit_log
-- =============================================
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.sync_audit_log;
CREATE POLICY "Authenticated users can insert own audit logs"
ON public.sync_audit_log FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- =============================================
-- FIX 10: Restrict attendance_audit_logs INSERT to enforce changed_by = auth.uid()
-- =============================================
DROP POLICY IF EXISTS "System can insert audit logs" ON public.attendance_audit_logs;
CREATE POLICY "Users can insert own audit logs"
ON public.attendance_audit_logs FOR INSERT
TO authenticated
WITH CHECK (changed_by = auth.uid());

-- =============================================
-- FIX 11: task_users - hide password_hash from direct SELECT
-- Create a safe view excluding password_hash
-- =============================================
DROP POLICY IF EXISTS "team_task_users" ON public.task_users;
CREATE POLICY "team_task_users_select"
ON public.task_users FOR SELECT
TO authenticated
USING (
  public.is_team_member(auth.uid(), user_id)
);

-- Restrict which columns are visible by revoking direct column access
-- and using the existing verify_task_password function for auth
REVOKE SELECT (password_hash) ON public.task_users FROM anon, authenticated;
