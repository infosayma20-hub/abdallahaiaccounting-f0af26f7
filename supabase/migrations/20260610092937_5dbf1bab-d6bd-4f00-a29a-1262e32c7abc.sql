-- Fix: employees can't open policy files in employee-forms bucket
-- Root cause: storage SELECT policy used an EXISTS subquery over employee_policy_documents,
-- which can fail intermittently. Replace with a SECURITY DEFINER helper that bypasses RLS
-- entirely for the existence check.

CREATE OR REPLACE FUNCTION public.is_employee_policy_file(_object_name text, _auth_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_policy_documents epd
    WHERE epd.is_active = true
      AND epd.file_url LIKE '%/' || _object_name
      AND public.is_team_member(_auth_uid, epd.user_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_employee_policy_file(text, uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Team members can read employee policy files" ON storage.objects;

CREATE POLICY "Team members can read employee policy files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = 'policies'
  AND public.is_employee_policy_file(name, auth.uid())
);