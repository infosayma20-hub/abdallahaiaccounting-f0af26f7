-- Ensure RLS policies for company-logos bucket
-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload company logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own logos
CREATE POLICY "Users can update company logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own logos
CREATE POLICY "Users can delete company logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to company logos
CREATE POLICY "Public read access for company logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-logos');
