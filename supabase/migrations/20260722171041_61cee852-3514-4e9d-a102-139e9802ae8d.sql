
CREATE OR REPLACE FUNCTION public._infer_bulk_emp_category(_desc text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _desc ILIKE '%راتب%' OR _desc ILIKE '%رواتب%' THEN NULL
    WHEN _desc ILIKE '%سلفة%' OR _desc ILIKE '%سلف%' THEN 'advance'
    WHEN _desc ILIKE '%أكل%' OR _desc ILIKE '%اكل%' OR _desc ILIKE '%وجبة%' THEN 'food'
    WHEN _desc ILIKE '%مخالف%' OR _desc ILIKE '%غرامة%' THEN 'penalty'
    WHEN _desc ILIKE '%عجز%' THEN 'cash_shortage'
    WHEN _desc ILIKE '%توصيل%' THEN 'transport'
    WHEN _desc ILIKE '%مشتري%' THEN 'purchase'
    ELSE 'other'
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_bulk_voucher_employee_movements(_voucher_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v RECORD; cat text;
BEGIN
  SELECT * INTO v FROM public.vouchers WHERE id=_voucher_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.employee_financial_movements
   WHERE source_type='finance_manual' AND source_id=_voucher_id;

  IF COALESCE(v.subtype,'')<>'bulk' OR COALESCE(v.type,'')<>'payment' THEN RETURN; END IF;
  IF v.status<>'posted' THEN RETURN; END IF;

  cat := public._infer_bulk_emp_category(COALESCE(v.description,''));
  IF cat IS NULL THEN RETURN; END IF;

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
  WHERE vl.voucher_id=v.id AND vl.debit>0 AND vl.account_name ILIKE 'ذمم موظف%';
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bulk_voucher_lines_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.sync_bulk_voucher_employee_movements(COALESCE(NEW.voucher_id, OLD.voucher_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_voucher_lines_sync_bulk_emp ON public.voucher_lines;
CREATE TRIGGER trg_voucher_lines_sync_bulk_emp
AFTER INSERT OR UPDATE OR DELETE ON public.voucher_lines
FOR EACH ROW EXECUTE FUNCTION public.trg_bulk_voucher_lines_sync();

CREATE OR REPLACE FUNCTION public.trg_bulk_voucher_status_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.date IS DISTINCT FROM NEW.date) THEN
    PERFORM public.sync_bulk_voucher_employee_movements(NEW.id);
  ELSIF TG_OP='DELETE' THEN
    DELETE FROM public.employee_financial_movements
     WHERE source_type='finance_manual' AND source_id=OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_vouchers_sync_bulk_emp ON public.vouchers;
CREATE TRIGGER trg_vouchers_sync_bulk_emp
AFTER UPDATE OR DELETE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.trg_bulk_voucher_status_sync();

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT id FROM public.vouchers
           WHERE subtype='bulk' AND type='payment' AND status='posted'
  LOOP PERFORM public.sync_bulk_voucher_employee_movements(r.id);
  END LOOP;
END $$;
