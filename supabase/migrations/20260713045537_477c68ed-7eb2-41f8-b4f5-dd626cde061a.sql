-- Phase 4: Performance indexes (safe, additive only)
-- No data changes, no policy changes, no schema breaks.

-- (1) attendance_events: highest impact.
-- Employee screen queries: WHERE employee_id = X AND event_time BETWEEN ... AND status='valid'
-- Currently: 100K seq_scans, 330M rows read on a 5.9K-row table.
CREATE INDEX IF NOT EXISTS idx_attendance_events_emp_time
  ON public.attendance_events (employee_id, event_time DESC)
  WHERE status = 'valid';

-- (2) attendance_events: RLS uses auth_user_id, and employee self-view queries it directly.
CREATE INDEX IF NOT EXISTS idx_attendance_events_auth_user_time
  ON public.attendance_events (auth_user_id, event_time DESC);

-- (3) transactions: matches the app's active-rows filter so idx can serve it.
-- App uses: WHERE (is_deleted = false OR reversed_by_id IS NOT NULL) AND user_id = X ORDER BY transaction_date
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_active
  ON public.transactions (user_id, transaction_date, created_at)
  WHERE is_deleted = false OR reversed_by_id IS NOT NULL;

-- (4) invoice_items: analytic queries that filter by product and sort by created_at
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_created
  ON public.invoice_items (product_id, created_at DESC)
  WHERE product_id IS NOT NULL;