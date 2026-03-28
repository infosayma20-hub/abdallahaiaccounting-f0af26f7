
-- Add attachments and auto_allocate to receipt_vouchers
ALTER TABLE receipt_vouchers
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS auto_allocate BOOLEAN DEFAULT false;

-- Add employee_id and attachments to vouchers
ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create storage bucket for voucher attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('voucher-attachments', 'voucher-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for voucher attachments bucket
CREATE POLICY "Users can upload voucher attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voucher-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own voucher attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'voucher-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own voucher attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'voucher-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
