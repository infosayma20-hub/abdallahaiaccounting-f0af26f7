
-- Add passport_expiry and passport_image_url columns to travel_booking_passengers
ALTER TABLE public.travel_booking_passengers
ADD COLUMN IF NOT EXISTS passport_expiry DATE,
ADD COLUMN IF NOT EXISTS passport_image_url TEXT;

-- Create passport-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('passport-documents', 'passport-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: allow authenticated users to upload passport documents
CREATE POLICY "Users can upload passport documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'passport-documents');

-- RLS: allow authenticated users to read their passport documents
CREATE POLICY "Users can read passport documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'passport-documents');

-- RLS: allow authenticated users to delete their passport documents
CREATE POLICY "Users can delete passport documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'passport-documents');
