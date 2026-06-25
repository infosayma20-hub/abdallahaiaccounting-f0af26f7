-- Performance indexes for POS invoice drawer & POS product list.
-- These columns are queried on every invoice open/reprint and on POS bootstrap
-- but currently have no supporting index, forcing Sequential Scans.

-- pos_order_lines: fetched by order_id whenever any invoice is opened/reprinted.
CREATE INDEX IF NOT EXISTS idx_pos_order_lines_order_id
  ON public.pos_order_lines (order_id);

-- pos_payments: fetched by order_id whenever any invoice is opened/reprinted.
CREATE INDEX IF NOT EXISTS idx_pos_payments_order_id
  ON public.pos_payments (order_id);

-- order_item_modifiers: fetched via IN(order_line_id, ...) for reprint with
-- modifiers (e.g. "+ حار، عادي 6").
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_order_line_id
  ON public.order_item_modifiers (order_line_id);

-- call_center_orders: fetched by pos_order_id to recover customer phone for
-- reprint of transferred call-center orders.
CREATE INDEX IF NOT EXISTS idx_call_center_orders_pos_order_id
  ON public.call_center_orders (pos_order_id)
  WHERE pos_order_id IS NOT NULL;

-- pos_orders: invoice drawer query is "user_id = X AND session_id = Y ORDER BY
-- created_at DESC LIMIT 200". Composite index drives both the filter and the
-- sort.
CREATE INDEX IF NOT EXISTS idx_pos_orders_user_session_created
  ON public.pos_orders (user_id, session_id, created_at DESC);

-- pos_orders: secondary fetch of transferred-out orders by
-- transferred_from_session_id (partial — most orders have NULL here).
CREATE INDEX IF NOT EXISTS idx_pos_orders_transferred_from_session
  ON public.pos_orders (transferred_from_session_id)
  WHERE transferred_from_session_id IS NOT NULL;

-- products: POS bootstrap query "user_id = X ORDER BY pos_sort_order, sort_order, name".
-- Hottest query in pg_stat_statements (8.5k calls, 676s total).
CREATE INDEX IF NOT EXISTS idx_products_user_pos_sort
  ON public.products (user_id, pos_sort_order NULLS LAST, sort_order, name);

-- product_modifier_groups: fetched by group_id = ANY(...). Top-2 slowest query.
CREATE INDEX IF NOT EXISTS idx_pmg_group_id
  ON public.product_modifier_groups (group_id);
