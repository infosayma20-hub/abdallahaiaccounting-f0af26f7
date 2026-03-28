ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_invoice_terms TEXT;

-- Create storage bucket for invoice attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-attachments', 'invoice-attachments', false) ON CONFLICT (id) DO NOTHING;

-- RLS policies for invoice-attachments bucket
CREATE POLICY "Users can upload invoice attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view own invoice attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoice-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own invoice attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoice-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);