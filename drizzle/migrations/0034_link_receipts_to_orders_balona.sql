-- Link historical receipts of "معرض بلونا" to their sales orders (audited, reversible).
-- Match rule: same contact + exact order_number token or "طلبية <manual_ref>" in description.
-- Order ORD-MRTOR0S7 (#4) excluded: its receipts (47,500) exceed the order total (38,300) and need manual review.
DO $$
DECLARE
  v_owner uuid := '1042ca69-b091-4dc4-8722-34b326fdc9cb';
  r record;
BEGIN
  FOR r IN
    WITH o AS (SELECT * FROM public.orders WHERE user_id = v_owner AND status IS DISTINCT FROM 'ملغي' AND order_number <> 'ORD-MRTOR0S7'),
    t AS (SELECT * FROM public.transactions WHERE user_id = v_owner AND transaction_type = 'receipt' AND is_deleted = false AND order_id IS NULL),
    cand AS (
      SELECT t.id tid, o.id oid FROM t JOIN o ON t.contact_id = o.contact_id
       AND (t.description ~ ('(^|[^A-Z0-9])' || o.order_number || '([^A-Z0-9]|$)')
            OR (o.manual_ref IS NOT NULL AND t.description ~ ('طلبية\s+' || o.manual_ref || '(\s|$)')))
    )
    SELECT c.tid, c.oid FROM cand c
    WHERE c.tid IN (SELECT tid FROM cand GROUP BY tid HAVING count(*) = 1)
  LOOP
    INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
    VALUES ('link_receipts_to_orders_balona_20260929', 'transaction', r.tid,
            jsonb_build_object('order_id', NULL), jsonb_build_object('order_id', r.oid),
            'Historical receipt linked to its sales order (contact + order ref match)', now());
    UPDATE public.transactions SET order_id = r.oid WHERE id = r.tid;
  END LOOP;
END $$;