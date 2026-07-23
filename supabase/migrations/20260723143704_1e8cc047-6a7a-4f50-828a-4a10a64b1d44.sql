-- Hard DB-level guard: only ONE pos_meal_subsidy per pos_order per tenant, ever.
-- Prevents any future code path from re-introducing the meal duplication bug.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pos_meal_subsidy_per_order
ON public.transactions (user_id, pos_order_id)
WHERE transaction_type = 'pos_meal_subsidy'
  AND is_deleted = false
  AND pos_order_id IS NOT NULL;