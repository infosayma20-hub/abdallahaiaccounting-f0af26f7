CREATE OR REPLACE FUNCTION public.close_pos_session_atomic(p_session_id uuid, p_closing_cash numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, state text, closed_at timestamp with time zone, already_closed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM pos_sessions WHERE pos_sessions.id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SHIFT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.state <> 'open' THEN
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, true;
    RETURN;
  END IF;

  UPDATE public.pos_sessions AS s
     SET state        = 'closed',
         closed_at    = now(),
         closing_cash = COALESCE(p_closing_cash, s.closing_cash),
         notes        = COALESCE(p_notes, s.notes),
         updated_at   = now()
   WHERE s.id = p_session_id
     AND s.state = 'open'
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, false;
END;
$function$;