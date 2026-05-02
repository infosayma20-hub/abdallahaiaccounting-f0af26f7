-- =====================================================================
-- Cheque integrity hardening (defense-in-depth)
-- Companion to the frontend hardening in VoucherFormPage + voucher-cheques-sync.
-- Read-only audit confirmed only safe data exists; this trigger only blocks
-- FUTURE invalid mutations. It does not touch any existing rows.
-- =====================================================================

-- Allowed source statuses for endorsement (must be physically in-hand & active).
CREATE OR REPLACE FUNCTION public.validate_cheque_endorsement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_status cheque_status;
BEGIN
  -- Endorsement requires a target party.
  IF NEW.status = 'مظهر'
     AND NEW.endorsed_to_contact_id IS NULL
     AND (NEW.endorsed_to_name IS NULL OR NEW.endorsed_to_name = '') THEN
    RAISE EXCEPTION 'لا يمكن تظهير الشيك بدون تحديد جهة التظهير';
  END IF;

  -- On UPDATE: block transitions INTO "مظهر" from non-endorseable states.
  IF TG_OP = 'UPDATE' AND NEW.status = 'مظهر' AND OLD.status IS DISTINCT FROM 'مظهر' THEN
    v_old_status := OLD.status;
    IF v_old_status NOT IN ('مسجل','آجل','مستحق') THEN
      RAISE EXCEPTION
        'لا يمكن تجيير الشيك رقم % لأن حالته الحالية (%) لا تسمح بالتجيير. الحالات المسموح تجييرها: مسجل، آجل، مستحق.',
        COALESCE(NEW.cheque_number, '—'), v_old_status;
    END IF;
  END IF;

  -- On INSERT: a cheque can only be born as "مسجل" or "آجل". Anything else
  -- means a code path is trying to skip the natural lifecycle.
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('مسجل','آجل') THEN
    RAISE EXCEPTION
      'حالة الشيك عند الإنشاء يجب أن تكون مسجل أو آجل، وليس %.', NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger fires on the right columns. The original trigger only
-- watched (status, endorsed_to_contact_id, endorsed_to_name) on UPDATE; we
-- need it on INSERT too for the new INSERT-time guard.
DROP TRIGGER IF EXISTS trg_validate_cheque_endorsement ON public.cheques;
CREATE TRIGGER trg_validate_cheque_endorsement
BEFORE INSERT OR UPDATE OF status, endorsed_to_contact_id, endorsed_to_name
ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.validate_cheque_endorsement();

-- Make cheque_date NOT NULL semantically — it already is, but enforce a date
-- lower-bound check (no zero/epoch dates from broken parsing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cheques_cheque_date_sane'
      AND conrelid = 'public.cheques'::regclass
  ) THEN
    ALTER TABLE public.cheques
      ADD CONSTRAINT cheques_cheque_date_sane
      CHECK (cheque_date >= DATE '2000-01-01' AND cheque_date <= DATE '2100-01-01');
  END IF;
END$$;
