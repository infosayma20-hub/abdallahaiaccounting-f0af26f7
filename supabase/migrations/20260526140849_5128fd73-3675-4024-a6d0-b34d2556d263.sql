DO $$
DECLARE
  u uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
BEGIN
  DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id=u);
  DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE user_id=u);
  DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE user_id=u);

  -- POS children first
  DELETE FROM pos_audit_log WHERE user_id=u;
  DELETE FROM pos_order_lines WHERE order_id IN (SELECT id FROM pos_orders WHERE user_id=u);
  DELETE FROM pos_payments WHERE order_id IN (SELECT id FROM pos_orders WHERE user_id=u);
  DELETE FROM pos_inventory_movements WHERE user_id=u;
  DELETE FROM pos_expenses WHERE user_id=u;
  DELETE FROM pos_purchases WHERE user_id=u;
  DELETE FROM pos_orders WHERE user_id=u;
  DELETE FROM pos_sessions WHERE user_id=u;

  DELETE FROM invoices WHERE user_id=u;
  DELETE FROM vouchers WHERE user_id=u;
  DELETE FROM cheques WHERE user_id=u;
  DELETE FROM returns WHERE user_id=u;
  DELETE FROM delivery_notes WHERE user_id=u;
  DELETE FROM recurring_invoices WHERE user_id=u;
  DELETE FROM tax_ledger WHERE user_id=u;
  DELETE FROM opening_balance_entries WHERE batch_id IN (SELECT id FROM opening_balance_batches WHERE user_id=u);
  DELETE FROM opening_balance_batches WHERE user_id=u;
  DELETE FROM stock_movements WHERE user_id=u;
  DELETE FROM stock_transfers WHERE user_id=u;

  DELETE FROM transactions
   WHERE user_id=u
     AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'LOAN-%');
END $$;