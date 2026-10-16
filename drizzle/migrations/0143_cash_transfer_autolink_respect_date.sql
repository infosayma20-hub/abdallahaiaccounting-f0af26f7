CREATE OR REPLACE FUNCTION public.tg_cash_transfers_autolink_pos_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_session_id uuid;
BEGIN
  IF NEW.pos_session_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.from_box_id IS NULL THEN RETURN NEW; END IF;
  -- Only a transfer dated on/after the open shift's business day belongs to it;
  -- back-dated transfers settle an earlier shift and must not reduce this one.
  SELECT id INTO v_session_id FROM public.pos_sessions
   WHERE user_id = NEW.user_id AND cash_box_id = NEW.from_box_id AND state = 'open'
     AND (NEW.transfer_date IS NULL OR business_date IS NULL OR NEW.transfer_date >= business_date)
   ORDER BY opened_at DESC NULLS LAST LIMIT 1;
  IF v_session_id IS NOT NULL THEN NEW.pos_session_id := v_session_id; END IF;
  RETURN NEW;
END; $$;