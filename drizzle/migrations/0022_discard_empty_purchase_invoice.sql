CREATE OR REPLACE FUNCTION public.discard_empty_purchase_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.purchase_invoices WHERE id = p_invoice_id;
  IF r.id IS NULL THEN RETURN; END IF;
  IF NOT public.is_team_member(auth.uid(), r.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF r.created_by IS DISTINCT FROM auth.uid() OR r.created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'لا يمكن حذف هذه الفاتورة';
  END IF;
  IF r.linked_transaction_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.purchase_invoice_items WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'الفاتورة فيها بنود أو قيد — لا تُحذف';
  END IF;
  DELETE FROM public.purchase_invoices WHERE id = p_invoice_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.discard_empty_purchase_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_empty_purchase_invoice(uuid) TO authenticated;

-- approval now happens on purchase invoice insert; the order-status trigger is redundant
DROP TRIGGER IF EXISTS procurement_order_approve_receiving ON public.procurement_orders;