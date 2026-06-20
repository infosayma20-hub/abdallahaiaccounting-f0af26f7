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

  -- Auto-heal: if cash box has no branch, inherit from terminal
  IF _cash_box_branch_id IS NULL AND _terminal_branch_id IS NOT NULL THEN
    UPDATE public.cash_boxes
       SET branch_id = _terminal_branch_id
     WHERE id = NEW.cash_box_id;
    RETURN NEW;
  END IF;

  -- Auto-heal: if terminal has no branch, inherit from cash box
  IF _terminal_branch_id IS NULL AND _cash_box_branch_id IS NOT NULL THEN
    UPDATE public.pos_terminals
       SET branch_id = _cash_box_branch_id
     WHERE id = NEW.terminal_id;
    RETURN NEW;
  END IF;

  -- Both null → allow (legacy data, will be configured later)
  IF _terminal_branch_id IS NULL AND _cash_box_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Both set and differ → still block (real data integrity issue)
  IF _terminal_branch_id <> _cash_box_branch_id THEN
    RAISE EXCEPTION 'Branch mismatch: cash box branch (%) does not match POS terminal branch (%)',
      _cash_box_branch_id, _terminal_branch_id;
  END IF;

  RETURN NEW;
END;
$$;