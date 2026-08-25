REVOKE ALL ON FUNCTION public.recompute_order_payment_from_transactions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_order_payment_on_transaction_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_linked_receipt_transaction() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_order_payment_from_transactions(uuid) TO service_role;