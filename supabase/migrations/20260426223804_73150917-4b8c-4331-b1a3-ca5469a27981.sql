CREATE OR REPLACE FUNCTION public.enforce_pos_session_branch_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal_branch_id uuid;
  _cash_box_branch_id uuid;
BEGIN
  IF NEW.cash_box_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id INTO _terminal_branch_id
  FROM public.pos_terminals
  WHERE id = NEW.terminal_id;

  SELECT branch_id INTO _cash_box_branch_id
  FROM public.cash_boxes
  WHERE id = NEW.cash_box_id;

  IF _terminal_branch_id IS NULL THEN
    RAISE EXCEPTION 'POS terminal must be linked to a branch before opening a shift';
  END IF;

  IF _cash_box_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cash box must be linked to a branch before opening a shift';
  END IF;

  IF _terminal_branch_id <> _cash_box_branch_id THEN
    RAISE EXCEPTION 'Branch mismatch: cash box branch does not match POS terminal branch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pos_session_branch_match ON public.pos_sessions;

CREATE TRIGGER trg_enforce_pos_session_branch_match
BEFORE INSERT OR UPDATE OF terminal_id, cash_box_id
ON public.pos_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pos_session_branch_match();