DROP TRIGGER IF EXISTS on_pos_order_table_change ON public.pos_orders;
DROP INDEX IF EXISTS public.idx_tx_user_debit_code;
DROP INDEX IF EXISTS public.idx_tx_user_credit_code;