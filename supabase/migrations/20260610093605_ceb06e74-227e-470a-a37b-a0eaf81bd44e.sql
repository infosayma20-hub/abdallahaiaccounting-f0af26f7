DROP POLICY IF EXISTS "Team members can read employee-forms" ON storage.objects;

CREATE POLICY "Team members can read employee-forms"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[1] <> 'policies'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);