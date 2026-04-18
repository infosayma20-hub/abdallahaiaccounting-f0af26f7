-- ============================================================
-- P0 FIX: Concurrent-safe invoice numbering
-- ============================================================

-- STEP 0: Fix existing duplicate (INV-2026-0004 appears twice for one user).
-- Bump the LATER created one to the next available number for that (user, type, year).
WITH duplicates AS (
  SELECT
    id,
    user_id,
    invoice_type,
    invoice_number,
    EXTRACT(YEAR FROM created_at)::INT AS yr,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, invoice_type, invoice_number
      ORDER BY created_at ASC
    ) AS rn
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
),
to_fix AS (
  SELECT id, user_id, invoice_type, yr
  FROM duplicates
  WHERE rn > 1
),
max_per_group AS (
  SELECT
    i.user_id,
    i.invoice_type,
    EXTRACT(YEAR FROM i.created_at)::INT AS yr,
    MAX(
      CASE WHEN i.invoice_number ~ '-(\d+)$'
        THEN (regexp_match(i.invoice_number, '-(\d+)$'))[1]::INT
        ELSE 0
      END
    ) AS max_no
  FROM public.invoices i
  WHERE i.invoice_number IS NOT NULL
  GROUP BY i.user_id, i.invoice_type, EXTRACT(YEAR FROM i.created_at)
)
UPDATE public.invoices inv
SET invoice_number = (
  CASE inv.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    ELSE 'DOC'
  END
) || '-' || mpg.yr::TEXT || '-' || LPAD((mpg.max_no + 1)::TEXT, 4, '0')
FROM to_fix tf
JOIN max_per_group mpg
  ON mpg.user_id = tf.user_id
 AND mpg.invoice_type = tf.invoice_type
 AND mpg.yr = tf.yr
WHERE inv.id = tf.id;

-- STEP 1: Tracking table per (user, type, year)
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  user_id UUID NOT NULL,
  invoice_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, invoice_type, year)
);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sequences" ON public.invoice_sequences;
CREATE POLICY "Users read own sequences"
  ON public.invoice_sequences FOR SELECT
  USING (auth.uid() = user_id);

-- STEP 2: Backfill from existing invoices (after dedup above)
INSERT INTO public.invoice_sequences (user_id, invoice_type, year, last_number)
SELECT
  user_id,
  invoice_type,
  EXTRACT(YEAR FROM created_at)::INT AS yr,
  COALESCE(
    MAX(
      CASE WHEN invoice_number ~ '-(\d+)$'
        THEN (regexp_match(invoice_number, '-(\d+)$'))[1]::INT
        ELSE 0
      END
    ), 0
  ) AS last_no
FROM public.invoices
WHERE invoice_number IS NOT NULL
  AND user_id IS NOT NULL
  AND invoice_type IS NOT NULL
GROUP BY user_id, invoice_type, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, invoice_type, year)
DO UPDATE SET last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number);

-- STEP 3: Replace numbering function with atomic UPSERT logic
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_year INTEGER;
  v_offset INTEGER;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    ELSE 'DOC'
  END;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::INT;

  SELECT COALESCE(invoice_number_offset, 0) INTO v_offset
  FROM public.companies
  WHERE owner_id = NEW.user_id
  LIMIT 1;
  v_offset := COALESCE(v_offset, 0);

  -- Atomic increment via UPSERT (PK lock guarantees no race)
  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, last_number)
  VALUES (NEW.user_id, NEW.invoice_type, v_year, v_offset + 1)
  ON CONFLICT (user_id, invoice_type, year)
  DO UPDATE SET
    last_number = invoice_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next;

  -- If backfilled value lower than offset, jump
  IF v_next <= v_offset THEN
    UPDATE public.invoice_sequences
       SET last_number = v_offset + 1, updated_at = now()
     WHERE user_id = NEW.user_id
       AND invoice_type = NEW.invoice_type
       AND year = v_year
    RETURNING last_number INTO v_next;
  END IF;

  NEW.invoice_number := v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

-- STEP 4: Final safety net - DB-level uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_number_per_user_type
  ON public.invoices (user_id, invoice_type, invoice_number)
  WHERE invoice_number IS NOT NULL;