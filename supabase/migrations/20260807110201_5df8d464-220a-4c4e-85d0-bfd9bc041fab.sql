
-- 1) Manual journal trigger: never duplicate a movement already written by the voucher UI
CREATE OR REPLACE FUNCTION public.sync_manual_journal_employee_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_id uuid;
  v_is_debit boolean;
  v_category text;
  v_desc text;
  v_voucher_id uuid;
BEGIN
  IF COALESCE(NEW.transaction_type, '') <> 'manual_journal' THEN
    RETURN NEW;
  END IF;

  v_desc := COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.reference, '');

  IF v_desc ILIKE '%صرف راتب%' OR v_desc ILIKE '%صرف رواتب%' OR v_desc ILIKE '%دفع راتب%'
     OR v_desc ILIKE '%دفع رواتب%' OR v_desc ILIKE '%سداد راتب%' OR v_desc ILIKE '%تسديد راتب%'
     OR v_desc ILIKE '%مسير رواتب%' OR v_desc ILIKE '%رواتب شهر%'
     OR v_desc ILIKE '%PAYROLL%' OR v_desc ILIKE '%PV-PAY%'
  THEN
    DELETE FROM public.employee_financial_movements WHERE source_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT e.id, (a.account_code = NEW.debit_account_code)
    INTO v_emp_id, v_is_debit
  FROM public.accounts a
  JOIN public.employees e
    ON e.full_name = trim(replace(a.account_name, 'ذمم موظف - ', ''))
  WHERE a.parent_code = '2180'
    AND a.account_code IN (NEW.debit_account_code, NEW.credit_account_code)
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_deleted, false) THEN
    DELETE FROM public.employee_financial_movements WHERE source_id = NEW.id;
    RETURN NEW;
  END IF;

  v_category := CASE
    WHEN NEW.description ILIKE '%عجز%' THEN 'cash_shortage'
    WHEN NEW.description ILIKE '%فائض%' THEN 'cash_surplus'
    WHEN NEW.description ILIKE '%سلف%' OR NEW.description ILIKE '%راتب%' THEN 'advance'
    WHEN NEW.description ILIKE '%اكل%' OR NEW.description ILIKE '%أكل%' OR NEW.description ILIKE '%وجب%' THEN 'food'
    WHEN NEW.description ILIKE '%خصم%' OR NEW.description ILIKE '%تنبيه%' OR NEW.description ILIKE '%عقاب%' THEN 'penalty'
    ELSE 'purchase'
  END;

  UPDATE public.employee_financial_movements
     SET amount = NEW.amount,
         original_full_amount = NEW.amount,
         description = COALESCE(NULLIF(trim(NEW.description), ''), 'قيد يدوي'),
         movement_type = CASE WHEN v_is_debit THEN 'debit' ELSE 'credit' END,
         movement_date = NEW.transaction_date,
         salary_month = CASE WHEN salary_month_locked THEN salary_month
                             ELSE EXTRACT(MONTH FROM NEW.transaction_date)::int END,
         salary_year  = CASE WHEN salary_month_locked THEN salary_year
                             ELSE EXTRACT(YEAR FROM NEW.transaction_date)::int END,
         category = v_category,
         source_reference = NEW.reference,
         updated_at = now()
   WHERE source_id = NEW.id;

  IF NOT FOUND THEN
    -- Anti-duplication guard: the voucher UI may have already mirrored this line.
    v_voucher_id := substring(COALESCE(NEW.idempotency_key,'') from 'VOUCHER-([0-9a-f-]{36})')::uuid;
    IF v_voucher_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employee_financial_movements m
       WHERE m.source_id = v_voucher_id
         AND m.employee_id = v_emp_id
         AND m.amount = NEW.amount
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.employee_financial_movements
      (user_id, employee_id, source_type, source_id, source_reference, description, amount,
       movement_type, status, movement_date, salary_month, salary_year, created_by,
       journal_entry_id, notes, category, original_full_amount)
    VALUES
      (NEW.user_id, v_emp_id, 'finance_manual', NEW.id, NEW.reference,
       COALESCE(NULLIF(trim(NEW.description), ''), 'قيد يدوي'), NEW.amount,
       CASE WHEN v_is_debit THEN 'debit' ELSE 'credit' END,
       'approved', NEW.transaction_date,
       EXTRACT(MONTH FROM NEW.transaction_date)::int,
       EXTRACT(YEAR FROM NEW.transaction_date)::int,
       NEW.user_id, NEW.id,
       'تم إنشاؤها تلقائياً من سند قيد يدوي', v_category, NEW.amount);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Bulk voucher sync: fill gaps only, never duplicate the UI-written rows
CREATE OR REPLACE FUNCTION public.sync_bulk_voucher_employee_movements(_voucher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v RECORD; cat text;
BEGIN
  SELECT * INTO v FROM public.vouchers WHERE id=_voucher_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v.subtype,'')<>'bulk' OR COALESCE(v.type,'')<>'payment' OR v.status<>'posted' THEN
    DELETE FROM public.employee_financial_movements
     WHERE source_type='finance_manual' AND source_id=_voucher_id;
    RETURN;
  END IF;

  cat := public._infer_bulk_emp_category(COALESCE(v.description,''));
  IF cat IS NULL THEN
    DELETE FROM public.employee_financial_movements
     WHERE source_type='finance_manual' AND source_id=_voucher_id;
    RETURN;
  END IF;

  -- Insert only lines that have no mirror yet (the voucher UI writes its own,
  -- including the manually pinned deduction month).
  INSERT INTO public.employee_financial_movements (
    user_id, employee_id, source_type, source_id, source_reference,
    reference_number, category, description, amount, movement_type,
    status, movement_date, salary_month, salary_year, created_by, notes
  )
  SELECT v.user_id, e.id, 'finance_manual', v.id, v.ref_number,
         v.ref_number, cat,
         COALESCE(NULLIF(vl.description,''), v.description, 'سند صرف جماعي') || ' - ' || e.full_name,
         vl.debit, 'debit', 'approved', v.date,
         EXTRACT(MONTH FROM v.date)::int, EXTRACT(YEAR FROM v.date)::int,
         COALESCE(v.posted_by, v.user_id), v.notes
  FROM public.voucher_lines vl
  JOIN public.employees e
    ON e.user_id=v.user_id
   AND e.full_name = regexp_replace(vl.account_name, '^ذمم موظف - ', '')
  WHERE vl.voucher_id=v.id AND vl.debit>0 AND vl.account_name ILIKE 'ذمم موظف%'
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_financial_movements m
       WHERE m.source_id = v.id AND m.employee_id = e.id AND m.amount = vl.debit
    );
END; $function$;

-- 3) Clean up existing duplicates ---------------------------------------------
-- 3a) journal-voucher duplicates: drop the trigger-created copy (source = transaction)
WITH txm AS (
  SELECT m.id, m.employee_id, m.amount,
         substring(t.idempotency_key from 'VOUCHER-([0-9a-f-]{36})')::uuid AS v_id
  FROM public.employee_financial_movements m
  JOIN public.transactions t ON t.id = m.source_id
  WHERE t.idempotency_key ~ '^VOUCHER-[0-9a-f-]{36}-L'
)
DELETE FROM public.employee_financial_movements d
USING txm
WHERE d.id = txm.id
  AND EXISTS (
    SELECT 1 FROM public.employee_financial_movements m2
     WHERE m2.source_id = txm.v_id
       AND m2.employee_id = txm.employee_id
       AND m2.amount = txm.amount
  );

-- 3b) bulk-voucher duplicates: keep the newest row per (voucher, employee, amount)
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY source_id, employee_id, amount
           ORDER BY salary_month_locked DESC, created_at DESC
         ) rn
  FROM public.employee_financial_movements
)
DELETE FROM public.employee_financial_movements d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;
