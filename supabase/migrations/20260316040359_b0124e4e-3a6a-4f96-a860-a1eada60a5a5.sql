
ALTER TABLE public.purchase_invoices DROP CONSTRAINT purchase_invoices_supplier_id_fkey;
ALTER TABLE public.purchase_invoices ADD CONSTRAINT purchase_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.pos_suppliers(id);
