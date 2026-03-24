
-- Add "مصروف" status for outgoing cheques (cashed by bank)
ALTER TYPE public.cheque_status ADD VALUE IF NOT EXISTS 'مصروف';

-- Add source bank account for outgoing cheques
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS source_bank_account_id UUID REFERENCES public.bank_accounts(id);

-- Add cashed_date for outgoing cheques
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS cashed_date TEXT;

-- Add contact_id to cheques for proper accounting linkage
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id);
