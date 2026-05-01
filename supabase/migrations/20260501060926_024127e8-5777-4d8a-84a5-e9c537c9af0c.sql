ALTER VIEW public.v_drift_tx_no_idempotency SET (security_invoker = true);
ALTER VIEW public.v_drift_tx_no_reference SET (security_invoker = true);
ALTER VIEW public.v_drift_tx_zero_amount SET (security_invoker = true);
ALTER VIEW public.v_drift_tx_same_account SET (security_invoker = true);
ALTER VIEW public.v_drift_invoice_no_link SET (security_invoker = true);
ALTER VIEW public.v_drift_cheque_no_voucher SET (security_invoker = true);
ALTER VIEW public.v_drift_tax_ledger_dup SET (security_invoker = true);
ALTER VIEW public.v_financial_drift_summary SET (security_invoker = true);