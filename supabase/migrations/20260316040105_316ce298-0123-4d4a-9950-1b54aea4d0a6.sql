
-- Drop the incorrect FK that points to products table
ALTER TABLE public.procurement_order_items DROP CONSTRAINT procurement_order_items_product_id_fkey;

-- Add correct FK that points to procurement_items table
ALTER TABLE public.procurement_order_items 
ADD CONSTRAINT procurement_order_items_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES public.procurement_items(id);
