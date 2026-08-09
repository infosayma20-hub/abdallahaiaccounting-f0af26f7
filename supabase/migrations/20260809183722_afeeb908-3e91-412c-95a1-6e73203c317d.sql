CREATE OR REPLACE FUNCTION public.coalesce_employee_movement_voucher_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
  v_existing_id uuid;
BEGIN
  IF NEW.source_type <> 'finance_manual' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.linked_transaction_id
    INTO v_transaction_id
  FROM public.vouchers v
  WHERE v.id = NEW.source_id
    AND v.user_id = NEW.user_id
    AND v.linked_transaction_id IS NOT NULL;

  IF v_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.id
    INTO v_existing_id
  FROM public.employee_financial_movements m
  WHERE m.user_id = NEW.user_id
    AND m.employee_id = NEW.employee_id
    AND m.source_id = v_transaction_id
    AND m.movement_type = NEW.movement_type
    AND m.amount = NEW.amount
    AND m.movement_date = NEW.movement_date
  ORDER BY m.created_at ASC
  LIMIT 1;

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
         salary_month_locked = COALESCE(NEW.salary_month_locked, salary_month_locked),
         meal_discount_type = COALESCE(NEW.meal_discount_type, meal_discount_type),
         meal_discount_pct = COALESCE(NEW.meal_discount_pct, meal_discount_pct),
         original_full_amount = COALESCE(NEW.original_full_amount, original_full_amount),
         updated_at = now()
   WHERE id = v_existing_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_coalesce_employee_movement_voucher_mirror
ON public.employee_financial_movements;

CREATE TRIGGER trg_coalesce_employee_movement_voucher_mirror
BEFORE INSERT ON public.employee_financial_movements
FOR EACH ROW
EXECUTE FUNCTION public.coalesce_employee_movement_voucher_mirror();