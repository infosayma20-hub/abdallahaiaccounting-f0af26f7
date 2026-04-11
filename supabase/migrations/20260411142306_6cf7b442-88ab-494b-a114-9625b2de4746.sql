-- Make travel-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'travel-documents';

-- Make employee-forms bucket private
UPDATE storage.buckets SET public = false WHERE id = 'employee-forms';

-- Fix employee-forms INSERT policy: add path ownership
DROP POLICY IF EXISTS "Anyone can upload form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload employee forms" ON storage.objects;

CREATE POLICY "Owner upload employee forms"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'employee-forms'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Fix workshop-images INSERT policy: add path ownership
DROP POLICY IF EXISTS "Users can upload workshop images" ON storage.objects;

CREATE POLICY "Owner upload workshop images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'workshop-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);