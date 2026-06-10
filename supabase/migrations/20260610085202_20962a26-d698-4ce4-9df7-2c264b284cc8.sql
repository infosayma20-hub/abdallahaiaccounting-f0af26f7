CREATE POLICY "Team members can read employee policy files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND EXISTS (
    SELECT 1 FROM public.employee_policy_documents epd
    WHERE epd.is_active = true
      AND epd.file_url LIKE '%/' || storage.objects.name
      AND public.is_team_member(auth.uid(), epd.user_id)
  )
);