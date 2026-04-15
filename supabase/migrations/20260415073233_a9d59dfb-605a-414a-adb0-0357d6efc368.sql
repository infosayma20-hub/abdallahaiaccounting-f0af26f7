
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_company_assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'company-assets');

CREATE POLICY "auth_upload_company_assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-assets');
