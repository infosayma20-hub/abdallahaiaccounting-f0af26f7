
-- Step 1: Add workflow columns to employee_leaves (canonical leave table)
ALTER TABLE public.employee_leaves
  ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by  uuid,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Step 2: updated_at trigger (reuse existing helper if present, else create)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
      LANGUAGE plpgsql SET search_path = public
      AS $f$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_employee_leaves_updated_at ON public.employee_leaves;
CREATE TRIGGER trg_employee_leaves_updated_at
  BEFORE UPDATE ON public.employee_leaves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 3: Standardize status on English canonical (table is empty, safe)
-- First confirm no rows, abort otherwise
DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.employee_leaves;
  IF c > 0 THEN
    RAISE EXCEPTION 'employee_leaves has % rows — migration assumed empty. Abort.', c;
  END IF;
END$$;

-- Drop old Arabic CHECK and set English canonical
ALTER TABLE public.employee_leaves DROP CONSTRAINT IF EXISTS employee_leaves_status_check;
ALTER TABLE public.employee_leaves ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.employee_leaves
  ADD CONSTRAINT employee_leaves_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled'));
COMMENT ON COLUMN public.employee_leaves.status IS
  'Backend stores English canonical only (pending/approved/rejected/cancelled). UI translates via formatLeaveStatus helper.';

-- Step 4: Archive deprecated leave_requests table (safety checks first)
DO $$
DECLARE row_count int; fk_count int;
BEGIN
  SELECT count(*) INTO row_count FROM public.leave_requests;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'leave_requests has % rows — archiving aborted. Investigate before rename.', row_count;
  END IF;

  SELECT count(*) INTO fk_count FROM pg_constraint
    WHERE confrelid = 'public.leave_requests'::regclass;
  IF fk_count > 0 THEN
    RAISE EXCEPTION 'leave_requests has % incoming FK(s) — archiving aborted.', fk_count;
  END IF;

  EXECUTE 'ALTER TABLE public.leave_requests RENAME TO _archive_leave_requests_dropped_2026_06_17';
END$$;
