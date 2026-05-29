CREATE POLICY "Employees can upload to their own folder in employee-forms"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Employees can update their own files in employee-forms"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Employees can read their own files in employee-forms"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = auth.uid()::text
);