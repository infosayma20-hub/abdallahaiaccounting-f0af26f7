-- POS performance: missing composite indexes surfaced by pg_stat_statements
-- (top slow queries filtered by user_id + created_at with no supporting index).

CREATE INDEX IF NOT EXISTS idx_pos_order_lines_user_created
  ON public.pos_order_lines (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_payments_user_created
  ON public.pos_payments (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_payments_user_order
  ON public.pos_payments (user_id, order_id);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_user_opened
  ON public.pos_sessions (user_id, opened_at DESC)
  WHERE is_deleted = false;
