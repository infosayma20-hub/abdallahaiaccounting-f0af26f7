
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payroll_status' AND e.enumlabel = 'returned'
  ) THEN
    ALTER TYPE payroll_status ADD VALUE 'returned';
  END IF;
END$$;
