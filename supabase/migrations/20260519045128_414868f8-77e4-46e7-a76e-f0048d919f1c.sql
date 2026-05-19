
-- Private bucket for cheque images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cheque-images', 'cheque-images', false)
ON CONFLICT (id) DO NOTHING;

-- Path-based ownership: {auth.uid()}/...
CREATE POLICY "cheque_images_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'cheque-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cheque_images_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cheque-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cheque_images_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'cheque-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cheque_images_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cheque-images' AND auth.uid()::text = (storage.foldername(name))[1]);
