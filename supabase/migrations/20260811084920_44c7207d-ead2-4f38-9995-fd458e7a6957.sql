-- One POS order can create at most one employee meal charge.
CREATE UNIQUE INDEX IF NOT EXISTS uq_efm_pos_meal_order_employee
ON public.employee_financial_movements (user_id, employee_id, source_id)
WHERE source_type = 'pos_meal' AND source_id IS NOT NULL;

-- Serialize POS meal retries and turn a duplicate retry into a no-op rather than
-- an error. The unique index remains the final hard guarantee.
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

  SELECT v.linked_transaction_id
    INTO v_transaction_id
  FROM public.vouchers v
  WHERE v.id = NEW.source_id
    AND v.user_id = NEW.user_id;

  NEW.canonical_source_id := COALESCE(v_transaction_id, NEW.source_id);

  IF NEW.source_type = 'pos_meal' THEN
    v_lock_key := concat_ws('|', 'pos_meal', NEW.user_id::text,
      NEW.employee_id::text, NEW.source_id::text);
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

    SELECT m.id INTO v_existing_id
    FROM public.employee_financial_movements m
    WHERE m.user_id = NEW.user_id
      AND m.employee_id = NEW.employee_id
      AND m.source_type = 'pos_meal'
      AND m.source_id = NEW.source_id
    ORDER BY m.created_at, m.id
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source_type NOT IN ('finance_manual', 'salary_deduction') THEN
    RETURN NEW;
  END IF;

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