
ALTER TABLE voucher_lines
  ADD COLUMN IF NOT EXISTS line_comment TEXT;

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS line_sort_order TEXT DEFAULT 'debit_first';

-- Create storage bucket for journal attachments (vouchers already has attachments column)
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-attachments', 'journal-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload journal attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own journal attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own journal attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
