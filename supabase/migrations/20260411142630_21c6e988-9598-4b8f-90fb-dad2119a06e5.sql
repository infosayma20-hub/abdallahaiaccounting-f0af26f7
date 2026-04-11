ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS endorsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS endorsement_voucher_id uuid,
  ADD COLUMN IF NOT EXISTS endorsement_notes text;