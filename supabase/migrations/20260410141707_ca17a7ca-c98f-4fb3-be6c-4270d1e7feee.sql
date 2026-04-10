-- Fix passport-documents: remove overly broad SELECT and DELETE policies, keep only owner-scoped ones

-- Drop the unscoped SELECT policy that allows any authenticated user to read all passport docs
DROP POLICY IF EXISTS "Users can read passport documents" ON storage.objects;

-- Drop the unscoped DELETE policy (same issue)
DROP POLICY IF EXISTS "Users can delete passport documents" ON storage.objects;

-- Create properly scoped DELETE policy
CREATE POLICY "Users can delete own passport documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'passport-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);