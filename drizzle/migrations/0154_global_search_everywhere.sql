CREATE OR REPLACE FUNCTION public.global_search(p_query text, p_limit integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid := public.get_team_owner_id();
  v_q text := btrim(coalesce(p_query,''));
  v_like text;
  v_num numeric;
  v_lim int := least(greatest(coalesce(p_limit,6),1),20);
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_owner IS NULL OR length(v_q) < 2 THEN RETURN v_out; END IF;
  v_like := '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%';
  IF v_q ~ '^[0-9]+(\.[0-9]+)?$' THEN v_num := v_q::numeric; END IF;

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','invoice','id',i.id,'title',coalesce(i.invoice_number,'فاتورة') || ' — ' || coalesce(i.contact_name,''),
      'subtitle', concat_ws(' • ', i.invoice_date::text, '₪' || coalesce(i.total_amount,0)::text, nullif(left(coalesce(i.notes, i.notes_internal,''),80),'')),
      'invoice_type', i.invoice_type) x
    FROM invoices i WHERE i.user_id = v_owner AND coalesce(i.is_deleted,false) = false
      AND (i.invoice_number ILIKE v_like OR i.contact_name ILIKE v_like OR i.notes ILIKE v_like OR i.notes_internal ILIKE v_like
           OR (v_num IS NOT NULL AND i.total_amount = v_num))
    ORDER BY i.invoice_date DESC NULLS LAST LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','voucher','id',v.id,'title',coalesce(v.ref_number,'سند') || ' — ' || coalesce(nullif(v.description,''),''),
      'subtitle', concat_ws(' • ', v.date::text, '₪' || coalesce(v.amount,0)::text, nullif(left(coalesce(v.notes,''),80),'')),
      'voucher_type', v.type, 'subtype', v.subtype, 'ref', v.ref_number) x
    FROM vouchers v WHERE v.user_id = v_owner AND coalesce(v.status,'') <> 'cancelled'
      AND (v.ref_number ILIKE v_like OR v.description ILIKE v_like OR v.notes ILIKE v_like OR v.cheque_number ILIKE v_like
           OR (v_num IS NOT NULL AND v.amount = v_num))
    ORDER BY v.date DESC NULLS LAST LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','transaction','id',t.id,'title',coalesce(nullif(t.description,''),t.transaction_type,'حركة'),
      'subtitle', concat_ws(' • ', t.transaction_date::text, '₪' || coalesce(t.amount,0)::text, t.reference, nullif(left(coalesce(t.notes,''),80),'')),
      'ref', t.reference, 'tx_type', t.transaction_type) x
    FROM transactions t WHERE t.user_id = v_owner AND t.is_deleted = false
      AND (t.description ILIKE v_like OR t.reference ILIKE v_like OR t.notes ILIKE v_like
           OR (v_num IS NOT NULL AND t.amount = v_num))
    ORDER BY t.transaction_date DESC NULLS LAST LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','contact','id',c.id,'title',c.contact_name,
      'subtitle', concat_ws(' • ', c.contact_type, c.phone, nullif(left(coalesce(c.notes,''),80),''))) x
    FROM contacts c WHERE c.user_id = v_owner AND coalesce(c.is_archived,false) = false
      AND (c.contact_name ILIKE v_like OR c.phone ILIKE v_like OR c.tax_number ILIKE v_like OR c.notes ILIKE v_like)
    ORDER BY c.contact_name LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','product','id',p.id,'title',p.name,
      'subtitle', concat_ws(' • ', p.barcode, nullif(left(coalesce(p.notes, p.description,''),80),''))) x
    FROM products p WHERE p.user_id = v_owner
      AND (p.name ILIKE v_like OR p.barcode ILIKE v_like OR p.notes ILIKE v_like OR p.description ILIKE v_like OR p.name_en ILIKE v_like)
    ORDER BY p.name LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','cheque','id',ch.id,'title','شيك ' || coalesce(ch.cheque_number,'') || ' — ' || coalesce(ch.party_name,''),
      'subtitle', concat_ws(' • ', ch.cheque_date::text, '₪' || coalesce(ch.amount,0)::text, ch.bank_name, ch.status::text, nullif(left(coalesce(ch.notes,''),80),'')),
      'ref', ch.cheque_number) x
    FROM cheques ch WHERE ch.user_id = v_owner
      AND (ch.cheque_number ILIKE v_like OR ch.party_name ILIKE v_like OR ch.notes ILIKE v_like OR ch.bank_name ILIKE v_like
           OR (v_num IS NOT NULL AND ch.amount = v_num))
    ORDER BY ch.cheque_date DESC NULLS LAST LIMIT v_lim) s), '[]'::jsonb);

  v_out := v_out || coalesce((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('type','account','id',a.id,'title',a.account_code || ' - ' || a.account_name,
      'subtitle', concat_ws(' • ', a.account_type, nullif(left(coalesce(a.notes,''),80),'')), 'ref', a.account_name) x
    FROM accounts a WHERE a.user_id = v_owner
      AND (a.account_name ILIKE v_like OR a.account_code ILIKE v_like OR a.notes ILIKE v_like)
    ORDER BY a.account_code LIMIT v_lim) s), '[]'::jsonb);

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.global_search(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.global_search(text, integer) TO authenticated, service_role;