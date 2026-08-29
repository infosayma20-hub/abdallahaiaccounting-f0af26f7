
CREATE TABLE IF NOT EXISTS public.pos_kitchen_print_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  branch_id UUID,
  terminal_id UUID,
  printer_key TEXT NOT NULL,
  station_label TEXT,
  items_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, printer_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_kitchen_print_log_failed
  ON public.pos_kitchen_print_log (owner_id, created_at DESC)
  WHERE status = 'failed';

GRANT SELECT ON public.pos_kitchen_print_log TO authenticated;
GRANT ALL ON public.pos_kitchen_print_log TO service_role;

ALTER TABLE public.pos_kitchen_print_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view kitchen print log" ON public.pos_kitchen_print_log;
CREATE POLICY "Team can view kitchen print log"
ON public.pos_kitchen_print_log
FOR SELECT
TO authenticated
USING (owner_id = public.resolve_effective_owner_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_pos_kitchen_print(
  p_order_id      UUID,
  p_printer_key   TEXT,
  p_status        TEXT,
  p_station_label TEXT DEFAULT NULL,
  p_items_count   INTEGER DEFAULT 0,
  p_error         TEXT DEFAULT NULL,
  p_branch_id     UUID DEFAULT NULL,
  p_terminal_id   UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_owner UUID;
  v_order_owner  UUID;
BEGIN
  IF p_status NOT IN ('sent','failed') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status USING ERRCODE = '22023';
  END IF;

  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT o.user_id INTO v_order_owner FROM public.pos_orders o WHERE o.id = p_order_id;
  IF v_order_owner IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order_owner <> v_caller_owner THEN
    RAISE EXCEPTION 'forbidden_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pos_kitchen_print_log AS l (
    owner_id, order_id, branch_id, terminal_id, printer_key,
    station_label, items_count, status, last_error
  ) VALUES (
    v_caller_owner, p_order_id, p_branch_id, p_terminal_id, p_printer_key,
    p_station_label, COALESCE(p_items_count, 0), p_status,
    CASE WHEN p_status = 'sent' THEN NULL ELSE p_error END
  )
  ON CONFLICT (order_id, printer_key) DO UPDATE
    SET status        = EXCLUDED.status,
        attempts      = l.attempts + 1,
        station_label = COALESCE(EXCLUDED.station_label, l.station_label),
        items_count   = GREATEST(l.items_count, EXCLUDED.items_count),
        last_error    = EXCLUDED.last_error,
        branch_id     = COALESCE(EXCLUDED.branch_id, l.branch_id),
        terminal_id   = COALESCE(EXCLUDED.terminal_id, l.terminal_id),
        updated_at    = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_kitchen_print(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pos_kitchen_print(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_kitchen_print(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, UUID) TO service_role;

COMMENT ON TABLE public.pos_kitchen_print_log IS
  'Per-station kitchen ticket print outcome. Mirrors receipt_print_status on pos_orders so a silently lost kitchen ticket is visible after the fact.';
