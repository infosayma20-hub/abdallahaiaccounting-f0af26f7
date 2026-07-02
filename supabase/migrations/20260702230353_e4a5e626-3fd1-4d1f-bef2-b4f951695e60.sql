
INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, new_value, reason)
SELECT 
  'phase_4_invoice_payment_audit',
  'invoice',
  invoice_id,
  jsonb_build_object('invoice_number', invoice_number, 'status', status, 'paid_amount', paid_amount, 'total_amount', total_amount, 'active_allocations', active_allocations),
  CASE WHEN status = 'cancelled' THEN jsonb_build_object('paid_amount', 0) ELSE jsonb_build_object('paid_amount', paid_amount) END,
  CASE WHEN status = 'cancelled' THEN 'reset_paid_amount_on_cancelled_invoice' ELSE 'legacy_data_kept_for_review' END
FROM public.v_invoices_payment_mismatch;

UPDATE public.invoices
SET paid_amount = 0, updated_at = now()
WHERE id IN (SELECT invoice_id FROM public.v_invoices_payment_mismatch WHERE status = 'cancelled')
  AND paid_amount > 0;
