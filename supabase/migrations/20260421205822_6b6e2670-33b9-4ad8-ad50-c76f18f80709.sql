-- 1) Reverse-link column from cheque to its originating voucher
ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cheques.voucher_id IS 'Reverse link to the voucher (transaction) that originated the cheque (PV/RV)';

-- 2) Convert cashed_date from text to date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cheques'
    AND column_name='cashed_date' AND data_type='text'
  ) THEN
    UPDATE public.cheques
    SET notes = COALESCE(notes,'') || E'\n[cashed_date legacy: ' || cashed_date || ']'
    WHERE cashed_date IS NOT NULL
      AND cashed_date !~ '^\d{4}-\d{2}-\d{2}$';

    ALTER TABLE public.cheques
      ALTER COLUMN cashed_date TYPE date
      USING (
        CASE
          WHEN cashed_date ~ '^\d{4}-\d{2}-\d{2}$' THEN cashed_date::date
          ELSE NULL
        END
      );
  END IF;
END $$;

-- 3) Normalize legacy currency labels
UPDATE public.cheques SET currency = 'ILS' WHERE currency = 'شيكل';

-- 4) CHECK constraints
ALTER TABLE public.cheques DROP CONSTRAINT IF EXISTS cheques_currency_check;
ALTER TABLE public.cheques
  ADD CONSTRAINT cheques_currency_check
  CHECK (currency IN ('ILS','USD','JOD','EUR','EGP'));

ALTER TABLE public.cheques DROP CONSTRAINT IF EXISTS cheques_amount_positive;
ALTER TABLE public.cheques
  ADD CONSTRAINT cheques_amount_positive CHECK (amount > 0);

-- 5) Performance indexes
CREATE INDEX IF NOT EXISTS idx_cheques_user_status      ON public.cheques(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cheques_contact_id       ON public.cheques(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_receipt_voucher  ON public.cheques(receipt_voucher_id) WHERE receipt_voucher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_voucher_id       ON public.cheques(voucher_id) WHERE voucher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_due_date         ON public.cheques(user_id, cheque_date) WHERE status IN ('مسجل','آجل','مستحق','مودع');
CREATE INDEX IF NOT EXISTS idx_cheques_bank_number      ON public.cheques(user_id, bank_name, cheque_number);

-- 6) Unique partial index — prevent duplicate cheques
DROP INDEX IF EXISTS uniq_cheques_user_bank_number_type;
CREATE UNIQUE INDEX uniq_cheques_user_bank_number_type
  ON public.cheques(user_id, bank_name, cheque_number, cheque_type)
  WHERE cheque_number IS NOT NULL
    AND cheque_number <> ''
    AND bank_name IS NOT NULL
    AND status <> 'ملغي';

-- 7) Endorsement validation trigger
CREATE OR REPLACE FUNCTION public.validate_cheque_endorsement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'مظهر'
     AND NEW.endorsed_to_contact_id IS NULL
     AND (NEW.endorsed_to_name IS NULL OR NEW.endorsed_to_name = '') THEN
    RAISE EXCEPTION 'لا يمكن تظهير الشيك بدون تحديد جهة التظهير';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cheque_endorsement ON public.cheques;
CREATE TRIGGER trg_validate_cheque_endorsement
  BEFORE INSERT OR UPDATE OF status, endorsed_to_contact_id, endorsed_to_name
  ON public.cheques
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_cheque_endorsement();

-- 8) Backfill orphan incoming cheques to their contacts via name matching
UPDATE public.cheques c
SET contact_id = ct.id
FROM public.contacts ct
WHERE c.contact_id IS NULL
  AND c.cheque_type = 'وارد'
  AND c.user_id = ct.user_id
  AND TRIM(LOWER(c.party_name)) = TRIM(LOWER(ct.contact_name));

-- 9) Auto-update timestamp
DROP TRIGGER IF EXISTS trg_cheques_updated_at ON public.cheques;
CREATE TRIGGER trg_cheques_updated_at
  BEFORE UPDATE ON public.cheques
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();