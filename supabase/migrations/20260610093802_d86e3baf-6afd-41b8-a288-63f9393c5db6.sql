DROP POLICY IF EXISTS "Admins can manage policies" ON public.employee_policy_documents;

CREATE POLICY "Admins and HR can insert employee policies"
ON public.employee_policy_documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);

CREATE POLICY "Admins and HR can update employee policies"
ON public.employee_policy_documents
FOR UPDATE
TO authenticated
USING (
  public.is_team_member(auth.uid(), user_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
)
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);

CREATE POLICY "Admins and HR can delete employee policies"
ON public.employee_policy_documents
FOR DELETE
TO authenticated
USING (
  public.is_team_member(auth.uid(), user_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins and HR can upload employee policy files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and HR can update employee policy files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and HR can delete employee policy files" ON storage.objects;

CREATE POLICY "Admins and HR can upload employee policy files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);

CREATE POLICY "Admins and HR can update employee policy files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);

CREATE POLICY "Admins and HR can delete employee policy files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  )
);