
-- Public-scope functions
ALTER FUNCTION public.change_pos_payment_method(uuid, text, text, uuid, uuid, integer, text, numeric, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.enforce_voucher_lines_balanced() SET search_path = public;
ALTER FUNCTION public.feedback_calls_validate_driver_rating() SET search_path = public;
ALTER FUNCTION public.guard_rep_invoice_must_be_posted() SET search_path = public;
ALTER FUNCTION public.notification_is_stale(timestamp with time zone, text, integer) SET search_path = public;
ALTER FUNCTION public.qr_menu_orders_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.sparta_bank_txn_balance_trg() SET search_path = public;
ALTER FUNCTION public.sparta_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_pos_shift_audits_touch() SET search_path = public;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public;

-- pgmq-scope functions (preserve pgmq access)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;
