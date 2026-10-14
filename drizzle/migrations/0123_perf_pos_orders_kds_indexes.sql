CREATE INDEX IF NOT EXISTS idx_pos_orders_return_of_order_id ON public.pos_orders (return_of_order_id) WHERE return_of_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_orders_user_order_number ON public.pos_orders (user_id, order_number);
CREATE INDEX IF NOT EXISTS idx_pos_orders_user_branch_created ON public.pos_orders (user_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_audit_log_order_id ON public.pos_audit_log (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_surveys_order_id ON public.customer_surveys (order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_user_created ON public.kitchen_tickets (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_active_created ON public.kitchen_tickets (created_at) WHERE status IN ('pending','preparing','ready');