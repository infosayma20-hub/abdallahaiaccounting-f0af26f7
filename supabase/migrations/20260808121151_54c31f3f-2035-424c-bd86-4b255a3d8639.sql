CREATE OR REPLACE FUNCTION public.guard_disciplinary_final_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.form_type NOT IN ('disciplinary','disciplinary_action') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('approved','rejected') AND NEW.final_decided_by IS NULL THEN
      RAISE EXCEPTION 'الإجراء العقابي لا يُعتمد إلا بقرار الإدارة النهائي — الموارد البشرية تسجّل توصية فقط'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected')
     AND NEW.final_decided_by IS NULL THEN
    RAISE EXCEPTION 'الإجراء العقابي لا يُعتمد إلا بقرار الإدارة النهائي — الموارد البشرية تسجّل توصية فقط'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_disciplinary_final_decision ON public.employee_forms;
CREATE TRIGGER trg_guard_disciplinary_final_decision
BEFORE INSERT OR UPDATE ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.guard_disciplinary_final_decision();

CREATE OR REPLACE FUNCTION public.guard_penalty_final_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.request_type <> 'penalty' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.final_decision IS NOT NULL AND NEW.final_decided_by IS NULL THEN
      RAISE EXCEPTION 'العقوبة لا تصل الموظف إلا بقرار الإدارة النهائي'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.final_decision IS DISTINCT FROM OLD.final_decision
     AND NEW.final_decision IS NOT NULL
     AND NEW.final_decided_by IS NULL THEN
    RAISE EXCEPTION 'العقوبة لا تصل الموظف إلا بقرار الإدارة النهائي'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_penalty_final_decision ON public.correction_requests;
CREATE TRIGGER trg_guard_penalty_final_decision
BEFORE INSERT OR UPDATE ON public.correction_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_penalty_final_decision();