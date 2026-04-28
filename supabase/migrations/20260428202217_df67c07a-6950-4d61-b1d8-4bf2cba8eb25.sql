
-- ============================================================================
-- B3.6 — Payroll Approval Workflow (3-stage)
-- preview (no row) → submitted (soft lock) → approved (hard lock) → paid (B3.7)
-- ============================================================================

-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.payroll_status AS ENUM ('submitted','approved','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add workflow columns to employee_payroll
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS status public.payroll_status NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_employee_payroll_status
  ON public.employee_payroll(user_id, period_year, period_month, status);

-- 3. Batch table for monthly batch approvals
CREATE TABLE IF NOT EXISTS public.payroll_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  status public.payroll_status NOT NULL DEFAULT 'submitted',
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  total_employees integer NOT NULL DEFAULT 0,
  total_net_salary numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_year, period_month)
);

ALTER TABLE public.payroll_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_payroll_batches"
  ON public.payroll_batches FOR SELECT
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "tenant_insert_payroll_batches"
  ON public.payroll_batches FOR INSERT
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "tenant_update_payroll_batches"
  ON public.payroll_batches FOR UPDATE
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "tenant_delete_payroll_batches"
  ON public.payroll_batches FOR DELETE
  USING (user_id = public.get_team_owner_id(auth.uid()) AND status = 'submitted');

-- 4. Lock guard: once a payroll row is `approved` or `paid`,
--    block edits to its core financial fields (status transitions still allowed).
CREATE OR REPLACE FUNCTION public.guard_employee_payroll_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard when current row is locked (approved/paid)
  IF OLD.status IN ('approved','paid') THEN
    -- Allow status transitions and audit-only field changes
    IF (NEW.base_salary IS DISTINCT FROM OLD.base_salary
        OR NEW.total_allowances IS DISTINCT FROM OLD.total_allowances
        OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
        OR NEW.total_overtime IS DISTINCT FROM OLD.total_overtime
        OR NEW.net_salary IS DISTINCT FROM OLD.net_salary
        OR NEW.attendance_salary IS DISTINCT FROM OLD.attendance_salary)
    THEN
      RAISE EXCEPTION 'لا يمكن تعديل قيم الراتب بعد الاعتماد. أعد فتحه أولاً (إرجاع للمراجعة).'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Block reverse transition from paid -> anything except cancelled by admin
    IF OLD.status = 'paid' AND NEW.status NOT IN ('paid','cancelled') THEN
      RAISE EXCEPTION 'لا يمكن إرجاع راتب مدفوع. استخدم سند صرف عكسي.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_payroll_locked ON public.employee_payroll;
CREATE TRIGGER trg_guard_employee_payroll_locked
  BEFORE UPDATE ON public.employee_payroll
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employee_payroll_locked();

-- 5. Block delete on approved/paid rows
CREATE OR REPLACE FUNCTION public.guard_employee_payroll_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved','paid') THEN
    RAISE EXCEPTION 'لا يمكن حذف راتب معتمد أو مدفوع. ألغِ الاعتماد أولاً.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_payroll_delete ON public.employee_payroll;
CREATE TRIGGER trg_guard_employee_payroll_delete
  BEFORE DELETE ON public.employee_payroll
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employee_payroll_delete();

-- 6. Atomic approve / reject helpers (return JSON)
CREATE OR REPLACE FUNCTION public.payroll_approve_employee(
  _payroll_id uuid,
  _approver uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employee_payroll%ROWTYPE;
  _owner uuid;
BEGIN
  SELECT * INTO _row FROM public.employee_payroll WHERE id = _payroll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الراتب غير موجود.'; END IF;

  _owner := public.get_team_owner_id(_approver);
  IF _row.user_id <> _owner THEN
    RAISE EXCEPTION 'غير مصرح لك باعتماد هذا الراتب.';
  END IF;

  IF _row.status <> 'submitted' THEN
    RAISE EXCEPTION 'الراتب ليس في حالة "قيد الاعتماد" (الحالة: %).', _row.status;
  END IF;

  UPDATE public.employee_payroll
    SET status = 'approved',
        approved_by = _approver,
        approved_at = now()
    WHERE id = _payroll_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payroll_id', _payroll_id,
    'status', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_reject_employee(
  _payroll_id uuid,
  _approver uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employee_payroll%ROWTYPE;
  _owner uuid;
BEGIN
  SELECT * INTO _row FROM public.employee_payroll WHERE id = _payroll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الراتب غير موجود.'; END IF;

  _owner := public.get_team_owner_id(_approver);
  IF _row.user_id <> _owner THEN
    RAISE EXCEPTION 'غير مصرح لك بإرجاع هذا الراتب.';
  END IF;

  IF _row.status NOT IN ('submitted','approved') THEN
    RAISE EXCEPTION 'لا يمكن إرجاع راتب بحالة %.', _row.status;
  END IF;

  IF _row.status = 'approved' THEN
    -- bypass guard via SECURITY DEFINER context: temporarily unset status, then update
    UPDATE public.employee_payroll
      SET status = 'submitted',
          approved_by = NULL,
          approved_at = NULL,
          rejection_reason = COALESCE(_reason, 'إرجاع للمراجعة')
      WHERE id = _payroll_id;
  ELSE
    -- Was submitted → mark cancelled with reason
    UPDATE public.employee_payroll
      SET status = 'cancelled',
          rejection_reason = COALESCE(_reason, 'مرفوض')
      WHERE id = _payroll_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payroll_id', _payroll_id,
    'status', CASE WHEN _row.status = 'approved' THEN 'submitted' ELSE 'cancelled' END
  );
END;
$$;

-- 7. Batch approve helper — approves every `submitted` row of the month
CREATE OR REPLACE FUNCTION public.payroll_approve_batch(
  _user_id uuid,
  _month integer,
  _year integer,
  _approver uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _approved_count integer := 0;
  _total_net numeric := 0;
  _batch_id uuid;
BEGIN
  _owner := public.get_team_owner_id(_approver);
  IF _user_id <> _owner THEN
    RAISE EXCEPTION 'غير مصرح لك باعتماد رواتب هذه الشركة.';
  END IF;

  -- Snapshot totals from submitted rows
  SELECT COUNT(*), COALESCE(SUM(net_salary),0)
    INTO _approved_count, _total_net
    FROM public.employee_payroll
    WHERE user_id = _user_id
      AND period_month = _month
      AND period_year = _year
      AND status = 'submitted';

  IF _approved_count = 0 THEN
    RAISE EXCEPTION 'لا توجد رواتب قيد الاعتماد لهذا الشهر.';
  END IF;

  -- Upsert batch row
  INSERT INTO public.payroll_batches
    (user_id, period_month, period_year, status,
     submitted_by, submitted_at, approved_by, approved_at,
     total_employees, total_net_salary)
  VALUES (_user_id, _month, _year, 'approved',
          _approver, now(), _approver, now(),
          _approved_count, _total_net)
  ON CONFLICT (user_id, period_year, period_month) DO UPDATE
    SET status = 'approved',
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        total_employees = EXCLUDED.total_employees,
        total_net_salary = EXCLUDED.total_net_salary
  RETURNING id INTO _batch_id;

  -- Approve each submitted row
  UPDATE public.employee_payroll
    SET status = 'approved',
        approved_by = _approver,
        approved_at = now(),
        batch_id = _batch_id
    WHERE user_id = _user_id
      AND period_month = _month
      AND period_year = _year
      AND status = 'submitted';

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', _batch_id,
    'approved_count', _approved_count,
    'total_net_salary', _total_net
  );
END;
$$;

-- 8. Submit (snapshot a freshly-computed payroll preview into a `submitted` row)
--    The frontend builds the payload; this just enforces the upsert and locks status.
CREATE OR REPLACE FUNCTION public.payroll_submit_employee(
  _payload jsonb,
  _submitter uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _user_id uuid;
  _employee_id uuid;
  _month integer;
  _year integer;
  _existing public.employee_payroll%ROWTYPE;
  _new_id uuid;
BEGIN
  _user_id    := (_payload->>'user_id')::uuid;
  _employee_id := (_payload->>'employee_id')::uuid;
  _month      := (_payload->>'period_month')::int;
  _year       := (_payload->>'period_year')::int;

  _owner := public.get_team_owner_id(_submitter);
  IF _user_id <> _owner THEN
    RAISE EXCEPTION 'غير مصرح لك بحفظ راتب لهذه الشركة.';
  END IF;

  -- Block if a row already exists in approved/paid state
  SELECT * INTO _existing
    FROM public.employee_payroll
    WHERE user_id = _user_id
      AND employee_id = _employee_id
      AND period_month = _month
      AND period_year = _year
    FOR UPDATE;

  IF FOUND AND _existing.status IN ('approved','paid') THEN
    RAISE EXCEPTION 'يوجد راتب معتمد/مدفوع لهذا الموظف لهذا الشهر. لا يمكن إعادة الحفظ.';
  END IF;

  IF FOUND THEN
    -- Update the existing submitted/cancelled row
    UPDATE public.employee_payroll SET
      base_salary = COALESCE((_payload->>'base_salary')::numeric, base_salary),
      total_allowances = COALESCE((_payload->>'total_allowances')::numeric, total_allowances),
      total_deductions = COALESCE((_payload->>'total_deductions')::numeric, total_deductions),
      total_overtime = COALESCE((_payload->>'total_overtime')::numeric, total_overtime),
      net_salary = COALESCE((_payload->>'net_salary')::numeric, net_salary),
      attendance_salary = COALESCE((_payload->>'attendance_salary')::numeric, attendance_salary),
      notes = COALESCE(_payload->>'notes', notes),
      status = 'submitted',
      submitted_by = _submitter,
      submitted_at = now(),
      rejection_reason = NULL
    WHERE id = _existing.id
    RETURNING id INTO _new_id;
  ELSE
    INSERT INTO public.employee_payroll (
      user_id, employee_id, period_month, period_year,
      base_salary, total_allowances, total_deductions, total_overtime,
      net_salary, attendance_salary, notes,
      status, submitted_by, submitted_at, is_paid
    ) VALUES (
      _user_id, _employee_id, _month, _year,
      COALESCE((_payload->>'base_salary')::numeric, 0),
      COALESCE((_payload->>'total_allowances')::numeric, 0),
      COALESCE((_payload->>'total_deductions')::numeric, 0),
      COALESCE((_payload->>'total_overtime')::numeric, 0),
      COALESCE((_payload->>'net_salary')::numeric, 0),
      COALESCE((_payload->>'attendance_salary')::numeric, 0),
      _payload->>'notes',
      'submitted', _submitter, now(), false
    ) RETURNING id INTO _new_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payroll_id', _new_id, 'status', 'submitted');
END;
$$;

-- 9. Backfill: any pre-existing rows are treated as `paid` (legacy lock)
UPDATE public.employee_payroll
  SET status = CASE WHEN is_paid THEN 'paid'::payroll_status ELSE 'approved'::payroll_status END
  WHERE status = 'submitted'
    AND (created_at < now() - interval '1 minute');
