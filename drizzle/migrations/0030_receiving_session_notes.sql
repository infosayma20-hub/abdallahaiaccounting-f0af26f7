CREATE OR REPLACE FUNCTION public.get_receiving_session(p_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.procurement_receiving_sessions; r jsonb;
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  SELECT jsonb_build_object('id', s.id, 'status', s.status, 'order_id', s.order_id, 'expected_date', s.expected_date,
    'order_number', o.order_number, 'supplier_name', sp.name, 'order_notes', o.notes,
    'employee_name', (SELECT full_name FROM public.employees WHERE id = s.assigned_employee_id),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'order_item_id', l.order_item_id, 'product_id', l.product_id,
        'item_name', i.item_name, 'unit', i.unit, 'item_notes', i.notes,
        'branch_name', (SELECT b.name FROM public.branches b WHERE b.id = i.branch_id),
        'ordered_qty', i.quantity,
        'received_before', rb.q,
        'target_qty', greatest(i.quantity - rb.q, 0),
        'scanned_qty', l.scanned_qty, 'note', l.note, 'expiry_date', l.expiry_date,
        'barcode', p.barcode, 'extra_barcodes', l.barcodes) ORDER BY i.item_name)
      FROM public.procurement_receiving_lines l
      JOIN public.procurement_order_items i ON i.id = l.order_item_id
      CROSS JOIN LATERAL (SELECT public._procurement_item_received_qty(i.id) AS q) rb
      LEFT JOIN public.products p ON p.id = l.product_id
      WHERE l.session_id = s.id), '[]'::jsonb))
  INTO r
  FROM public.procurement_orders o LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
  WHERE o.id = s.order_id;
  RETURN r;
END $function$;