REVOKE EXECUTE ON FUNCTION public.create_receipt_voucher_offline(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_payment_voucher_offline(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_cheque_offline(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_cash_transfer_offline(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_receipt_voucher_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_voucher_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cheque_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_transfer_offline(uuid, jsonb, text) TO authenticated;