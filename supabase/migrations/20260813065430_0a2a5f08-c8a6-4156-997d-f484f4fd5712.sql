CREATE OR REPLACE FUNCTION public.auto_archive_employee_form()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Auto-archive ONLY on the actual transition into approved/rejected.
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('approved','rejected')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.archived_at IS NULL
     AND OLD.archived_at IS NULL THEN
    NEW.archived_at := COALESCE(NEW.reviewed_at, now());
  END IF;

  -- If reverted to pending, un-archive
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'pending'
     AND OLD.status IN ('approved','rejected') THEN
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;