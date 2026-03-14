
-- Add new status 'مظهر' (endorsed) to the cheque_status enum
ALTER TYPE cheque_status ADD VALUE IF NOT EXISTS 'مظهر';

-- Add new columns to cheques table for enhanced lifecycle
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS endorsed_to_name TEXT;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS endorsed_to_contact_id UUID;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS deposit_bank_account_id UUID;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS deposit_date DATE;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS collection_date DATE;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS bounce_date DATE;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS bounce_reason TEXT;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS bank_fees NUMERIC DEFAULT 0;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS receipt_voucher_id UUID;

-- Add columns to cheque_status_history for richer timeline
ALTER TABLE public.cheque_status_history ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.cheque_status_history ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;
ALTER TABLE public.cheque_status_history ADD COLUMN IF NOT EXISTS details JSONB;
