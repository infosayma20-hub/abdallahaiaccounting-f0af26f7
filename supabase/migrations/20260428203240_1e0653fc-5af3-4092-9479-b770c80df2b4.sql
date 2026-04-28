
DROP FUNCTION IF EXISTS public.payroll_reject_employee(uuid, uuid, text);

CREATE FUNCTION public.payroll_reject_employee(
  _payroll_id uuid,
  _approver uuid,
  _reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status payroll_status;
BEGIN
  SELECT status INTO v_status FROM employee_payroll WHERE id = _payroll_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'سجل الراتب غير موجود';
  END IF;

  IF v_status NOT IN ('submitted','approved') THEN
    RAISE EXCEPTION 'لا يمكن إرجاع راتب بحالة %', v_status;
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'سبب الإرجاع مطلوب';
  END IF;

  UPDATE employee_payroll
  SET status = 'returned'::payroll_status,
      rejection_reason = _reason,
      approved_by = NULL,
      approved_at = NULL,
      batch_id = NULL
  WHERE id = _payroll_id;

  RETURN json_build_object('ok', true, 'status', 'returned', 'reason', _reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_employee_payroll_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved','paid')
     AND NEW.status IN ('returned','cancelled','submitted') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved','paid') THEN
    IF (NEW.base_salary IS DISTINCT FROM OLD.base_salary
        OR NEW.net_salary IS DISTINCT FROM OLD.net_salary
        OR NEW.total_allowances IS DISTINCT FROM OLD.total_allowances
        OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
        OR NEW.total_overtime IS DISTINCT FROM OLD.total_overtime) THEN
      RAISE EXCEPTION 'لا يمكن تعديل قيم الراتب بعد الاعتماد. أعد فتحه أولاً (إرجاع للمراجعة).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
