-- Add archived_at column to employee_forms
ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_employee_forms_archived_at ON public.employee_forms(archived_at);

-- Auto-archive: whenever a form transitions to approved or rejected, set archived_at
CREATE OR REPLACE FUNCTION public.auto_archive_employee_form()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved','rejected') AND NEW.archived_at IS NULL THEN
    NEW.archived_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  -- If reverted to pending, un-archive
  IF NEW.status = 'pending' AND OLD.status IN ('approved','rejected') THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_archive_employee_form ON public.employee_forms;
CREATE TRIGGER trg_auto_archive_employee_form
  BEFORE UPDATE ON public.employee_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_archive_employee_form();

-- Backfill existing approved/rejected forms
UPDATE public.employee_forms
   SET archived_at = COALESCE(reviewed_at, updated_at, created_at)
 WHERE status IN ('approved','rejected')
   AND archived_at IS NULL;