ALTER TABLE public.pos_purchases DROP CONSTRAINT IF EXISTS pos_purchases_supplier_id_fkey;
ALTER TABLE public.pos_purchases ADD CONSTRAINT pos_purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.contacts(id);
COMMENT ON COLUMN public.pos_purchases.supplier_id IS 'Supplier contact (contacts.id, contact_type مورد) — validated by pos_record_purchase_v1';