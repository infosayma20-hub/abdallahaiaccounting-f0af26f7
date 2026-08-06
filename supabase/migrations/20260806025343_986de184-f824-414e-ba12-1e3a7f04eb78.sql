DO $$
DECLARE u uuid[] := ARRAY['6fb346d9-f8a6-44a7-a99c-fd2b440f6060','567e1d96-8b2f-4bfa-adec-aa1d4972e569','a0e3475b-91cb-439d-96ad-e9bb9f06fe15','1049e65d-3cbb-4c45-948b-d4dca5ebc47f']::uuid[];
BEGIN
  DELETE FROM public.warranty_claims WHERE replacement_invoice_id IN (SELECT id FROM public.invoices WHERE user_id = ANY(u));
  DELETE FROM public.warranty_cards WHERE invoice_id IN (SELECT id FROM public.invoices WHERE user_id = ANY(u)) OR product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u)) OR contact_id IN (SELECT id FROM public.contacts WHERE user_id = ANY(u));
  DELETE FROM public.warranty_policies WHERE product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u)) OR supplier_id IN (SELECT id FROM public.contacts WHERE user_id = ANY(u));
  DELETE FROM public.rep_edit_requests WHERE invoice_id IN (SELECT id FROM public.invoices WHERE user_id = ANY(u));
  DELETE FROM public.payment_invoice_links WHERE user_id = ANY(u) OR invoice_id IN (SELECT id FROM public.invoices WHERE user_id = ANY(u));
  DELETE FROM public.delivery_note_items WHERE product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.delivery_notes WHERE user_id = ANY(u);
  DELETE FROM public.returns WHERE user_id = ANY(u);
  DELETE FROM public.recurring_invoices WHERE user_id = ANY(u);
  DELETE FROM public.invoice_activity_log WHERE user_id = ANY(u);
  DELETE FROM public.invoice_items WHERE invoice_id IN (SELECT id FROM public.invoices WHERE user_id = ANY(u));
  DELETE FROM public.invoices WHERE user_id = ANY(u);
  DELETE FROM public.purchase_invoices WHERE user_id = ANY(u);

  DELETE FROM public.smart_accountant_drafts WHERE user_id = ANY(u);
  DELETE FROM public.receipt_vouchers WHERE user_id = ANY(u);
  DELETE FROM public.voucher_lines WHERE voucher_id IN (SELECT id FROM public.vouchers WHERE user_id = ANY(u));
  DELETE FROM public.vouchers WHERE user_id = ANY(u);
  DELETE FROM public.cheques WHERE user_id = ANY(u);
  DELETE FROM public.tax_ledger WHERE user_id = ANY(u);
  DELETE FROM public.transactions WHERE user_id = ANY(u);
  DELETE FROM public.opening_balance_entries WHERE user_id = ANY(u);
  DELETE FROM public.opening_balance_batches WHERE user_id = ANY(u);

  DELETE FROM public.stock_movements WHERE user_id = ANY(u) OR product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.product_batches WHERE product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.stock_transfer_items WHERE product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.stock_transfers WHERE user_id = ANY(u);
  DELETE FROM public.stock_alerts WHERE user_id = ANY(u);
  DELETE FROM public.stockout_alerts WHERE user_id = ANY(u);
  DELETE FROM public.order_items WHERE user_id = ANY(u) OR product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.orders WHERE user_id = ANY(u);
  DELETE FROM public.return_items WHERE product_id IN (SELECT id FROM public.products WHERE user_id = ANY(u));
  DELETE FROM public.products WHERE user_id = ANY(u);
  DELETE FROM public.item_categories WHERE user_id = ANY(u);
  DELETE FROM public.van_sales_days WHERE user_id = ANY(u);
  DELETE FROM public.warehouses WHERE user_id = ANY(u);

  DELETE FROM public.contact_alerts WHERE user_id = ANY(u);
  DELETE FROM public.sales_representatives WHERE user_id = ANY(u);
  DELETE FROM public.print_documents WHERE user_id = ANY(u);
  DELETE FROM public.subledger_integrity_corrections WHERE user_id = ANY(u);
  DELETE FROM public.contacts WHERE user_id = ANY(u);
  DELETE FROM public.account_watchlist WHERE user_id = ANY(u);
  DELETE FROM public.accounts WHERE user_id = ANY(u);

  DELETE FROM public.employees WHERE user_id = ANY(u) OR company_id = ANY(u);

  DELETE FROM public.assets WHERE user_id = ANY(u);
  DELETE FROM public.asset_categories WHERE user_id = ANY(u);
  DELETE FROM public.cash_boxes WHERE user_id = ANY(u);
  DELETE FROM public.journal_book_sequences WHERE book_id IN (SELECT id FROM public.journal_books WHERE user_id = ANY(u));
  DELETE FROM public.journal_books WHERE user_id = ANY(u);
  DELETE FROM public.invoice_sequences WHERE user_id = ANY(u);
  DELETE FROM public.document_sequences WHERE user_id = ANY(u);
  DELETE FROM public.document_edit_history WHERE user_id = ANY(u);
  DELETE FROM public.fiscal_periods WHERE user_id = ANY(u);
  DELETE FROM public.pos_terminals WHERE user_id = ANY(u);
  DELETE FROM public.pos_companies WHERE user_id = ANY(u);
  DELETE FROM public.ai_conversations WHERE user_id = ANY(u);
  DELETE FROM public.activity_log WHERE user_id = ANY(u);
  DELETE FROM public.admin_notifications WHERE user_id = ANY(u);
  DELETE FROM public.notification_log WHERE user_id = ANY(u);
END $$;