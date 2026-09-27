-- purchase_invoices.supplier_id may hold a pos_suppliers id (procurement flow) while products.default_supplier_id references contacts.
-- Resolve to a contacts id (direct id, or same-owner supplier contact by name); skip if none — never block the invoice.
CREATE OR REPLACE FUNCTION public.set_product_default_supplier_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_supplier_id uuid; v_owner uuid; v_name text; v_contact uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT supplier_id, user_id, supplier_name INTO v_supplier_id, v_owner, v_name
  FROM public.purchase_invoices WHERE id = NEW.invoice_id;
  IF v_supplier_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_contact FROM public.contacts WHERE id = v_supplier_id;
  IF v_contact IS NULL THEN
    IF v_name IS NULL THEN SELECT name INTO v_name FROM public.pos_suppliers WHERE id = v_supplier_id; END IF;
    IF v_name IS NOT NULL THEN
      SELECT id INTO v_contact FROM public.contacts
       WHERE user_id = v_owner AND contact_type = 'مورد' AND contact_name = v_name AND is_active
       ORDER BY created_at LIMIT 1;
    END IF;
  END IF;
  IF v_contact IS NULL THEN RETURN NEW; END IF;

  UPDATE public.products SET default_supplier_id = v_contact, updated_at = now()
   WHERE id = NEW.product_id AND default_supplier_id IS NULL;
  RETURN NEW;
END;
$function$;