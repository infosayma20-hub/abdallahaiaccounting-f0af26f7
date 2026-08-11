ALTER TABLE public.employee_financial_movements
  ADD COLUMN IF NOT EXISTS canonical_source_id uuid;

COMMENT ON COLUMN public.employee_financial_movements.canonical_source_id IS
  'Stable idempotency identity: a voucher and its linked transaction resolve to the same UUID.';

-- Backfill a stable identity. A voucher mirror and the journal transaction generated
-- from that voucher must share the transaction UUID; standalone sources keep source_id.
UPDATE public.employee_financial_movements m
SET canonical_source_id = COALESCE(v.linked_transaction_id, m.source_id)
FROM public.vouchers v
WHERE m.source_id = v.id
  AND m.user_id = v.user_id
  AND m.source_type IN ('finance_manual', 'salary_deduction')
  AND m.canonical_source_id IS DISTINCT FROM COALESCE(v.linked_transaction_id, m.source_id);

UPDATE public.employee_financial_movements
SET canonical_source_id = source_id
WHERE canonical_source_id IS NULL
  AND source_id IS NOT NULL;

-- Consolidate any historical exact duplicates before enforcing the invariant.
-- Financially different lines (amount/date/direction) are deliberately untouched.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY user_id, employee_id, canonical_source_id,
                        movement_type, amount, movement_date
           ORDER BY created_at, id
         ) AS keeper_id,
         row_number() OVER (
           PARTITION BY user_id, employee_id, canonical_source_id,
                        movement_type, amount, movement_date
           ORDER BY created_at, id
         ) AS rn
  FROM public.employee_financial_movements
  WHERE canonical_source_id IS NOT NULL
    AND source_type IN ('finance_manual', 'salary_deduction')
), merged AS (
  UPDATE public.employee_financial_movements keep
  SET source_reference = COALESCE(dup.source_reference, keep.source_reference),
      reference_number = COALESCE(dup.reference_number, keep.reference_number),
      description = COALESCE(NULLIF(dup.description, ''), keep.description),
      category = COALESCE(dup.category, keep.category),
      notes = COALESCE(dup.notes, keep.notes),
      salary_month = COALESCE(dup.salary_month, keep.salary_month),
      salary_year = COALESCE(dup.salary_year, keep.salary_year),
      salary_month_locked = keep.salary_month_locked OR dup.salary_month_locked,
      meal_discount_type = COALESCE(dup.meal_discount_type, keep.meal_discount_type),
      meal_discount_pct = COALESCE(dup.meal_discount_pct, keep.meal_discount_pct),
      original_full_amount = COALESCE(dup.original_full_amount, keep.original_full_amount),
      updated_at = now()
  FROM ranked r
  JOIN public.employee_financial_movements dup ON dup.id = r.id
  WHERE r.rn > 1 AND keep.id = r.keeper_id
  RETURNING dup.id
)
DELETE FROM public.employee_financial_movements d
USING merged
WHERE d.id = merged.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_efm_canonical_financial_event
ON public.employee_financial_movements
  (user_id, employee_id, canonical_source_id, movement_type, amount, movement_date)
WHERE canonical_source_id IS NOT NULL
  AND source_type IN ('finance_manual', 'salary_deduction');

CREATE INDEX IF NOT EXISTS idx_efm_canonical_source
ON public.employee_financial_movements (canonical_source_id)
WHERE canonical_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.coalesce_employee_movement_voucher_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_existing_id uuid;
  v_lock_key text;
BEGIN
  IF NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve every voucher to its linked journal transaction. This assignment is
  -- also applied to non-finance sources so every row receives a stable identity.
  SELECT v.linked_transaction_id
    INTO v_transaction_id
  FROM public.vouchers v
  WHERE v.id = NEW.source_id
    AND v.user_id = NEW.user_id;

  NEW.canonical_source_id := COALESCE(v_transaction_id, NEW.source_id);

  IF NEW.source_type NOT IN ('finance_manual', 'salary_deduction') THEN
    RETURN NEW;
  END IF;

  -- Serialize equal logical events. Unlike an application-side existence check,
  -- this closes the race where two writers both observe no row and both insert.
  v_lock_key := concat_ws('|', NEW.user_id::text, NEW.employee_id::text,
    NEW.canonical_source_id::text, NEW.movement_type, NEW.amount::text,
    NEW.movement_date::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT m.id
    INTO v_existing_id
  FROM public.employee_financial_movements m
  WHERE m.user_id = NEW.user_id
    AND m.employee_id = NEW.employee_id
    AND m.canonical_source_id = NEW.canonical_source_id
    AND m.source_type IN ('finance_manual', 'salary_deduction')
    AND m.movement_type = NEW.movement_type
    AND m.amount = NEW.amount
    AND m.movement_date = NEW.movement_date
  ORDER BY m.created_at, m.id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.employee_financial_movements
  SET source_reference = COALESCE(NEW.source_reference, source_reference),
      reference_number = COALESCE(NEW.reference_number, reference_number),
      description = COALESCE(NULLIF(NEW.description, ''), description),
      category = COALESCE(NEW.category, category),
      notes = COALESCE(NEW.notes, notes),
      salary_month = COALESCE(NEW.salary_month, salary_month),
      salary_year = COALESCE(NEW.salary_year, salary_year),
      salary_month_locked = salary_month_locked OR NEW.salary_month_locked,
      meal_discount_type = COALESCE(NEW.meal_discount_type, meal_discount_type),
      meal_discount_pct = COALESCE(NEW.meal_discount_pct, meal_discount_pct),
      original_full_amount = COALESCE(NEW.original_full_amount, original_full_amount),
      updated_at = now()
  WHERE id = v_existing_id;

  RETURN NULL;
END;
$function$;

-- Ensure updates that relink a source also preserve the canonical identity.
CREATE OR REPLACE FUNCTION public.refresh_efm_canonical_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
BEGIN
  IF NEW.source_id IS NULL THEN
    NEW.canonical_source_id := NULL;
    RETURN NEW;
  END IF;

  SELECT v.linked_transaction_id INTO v_transaction_id
  FROM public.vouchers v
  WHERE v.id = NEW.source_id AND v.user_id = NEW.user_id;

  NEW.canonical_source_id := COALESCE(v_transaction_id, NEW.source_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_efm_canonical_source
ON public.employee_financial_movements;

CREATE TRIGGER trg_refresh_efm_canonical_source
BEFORE UPDATE OF source_id, user_id ON public.employee_financial_movements
FOR EACH ROW
EXECUTE FUNCTION public.refresh_efm_canonical_source();