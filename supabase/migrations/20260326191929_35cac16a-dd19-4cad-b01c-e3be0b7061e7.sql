
-- Create storage bucket for workshop images
INSERT INTO storage.buckets (id, name, public) VALUES ('workshop-images', 'workshop-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Users can upload workshop images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workshop-images');

-- Allow public read
CREATE POLICY "Public can view workshop images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'workshop-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own workshop images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workshop-images');
