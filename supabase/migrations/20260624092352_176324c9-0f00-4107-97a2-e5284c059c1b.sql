-- ============================================================
-- Per-shift invoice sequence (session_seq) for pos_orders
-- Non-breaking: order_number (global per-day) stays untouched.
-- session_seq is the cashier-facing in-shift counter (1..N).
-- ============================================================

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS session_seq INTEGER;

-- Backfill existing rows: per session, ordered by created_at, then id (tiebreaker)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY session_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.pos_orders
  WHERE session_id IS NOT NULL
)
UPDATE public.pos_orders po
SET session_seq = r.rn
FROM ranked r
WHERE po.id = r.id
  AND (po.session_seq IS NULL OR po.session_seq <> r.rn);

-- Unique seq per session (allows nulls for orphan rows without session_id)
CREATE UNIQUE INDEX IF NOT EXISTS pos_orders_session_seq_unique
  ON public.pos_orders (session_id, session_seq)
  WHERE session_id IS NOT NULL AND session_seq IS NOT NULL;

-- Trigger function: assign next seq atomically per session
CREATE OR REPLACE FUNCTION public.assign_pos_session_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.session_seq IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the session row to serialize concurrent inserts for the same shift.
  PERFORM 1 FROM public.pos_sessions WHERE id = NEW.session_id FOR UPDATE;

  SELECT COALESCE(MAX(session_seq), 0) + 1
    INTO v_next
  FROM public.pos_orders
  WHERE session_id = NEW.session_id;

  NEW.session_seq := v_next;
  RETURN NEW;
END;
$$;

-- Run BEFORE the existing order_number trigger order doesn't matter
-- (they touch different columns). Use a distinct name.
DROP TRIGGER IF EXISTS trg_assign_pos_session_seq ON public.pos_orders;
CREATE TRIGGER trg_assign_pos_session_seq
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_pos_session_seq();
