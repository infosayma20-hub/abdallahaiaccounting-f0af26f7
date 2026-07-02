
INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, reason)
SELECT 
  'phase_5_cash_transfers_orphan_audit',
  'cash_transfer',
  id,
  jsonb_build_object('transfer_date', transfer_date, 'amount', amount, 'currency', currency, 'description', description, 'transfer_type', transfer_type),
  'legacy_transfer_without_gl_kept_for_manual_review'
FROM public.v_cash_transfers_missing_gl;
