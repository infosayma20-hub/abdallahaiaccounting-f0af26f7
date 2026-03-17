ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS contact_id UUID NULL;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS contact_name TEXT NULL;