
-- Drop the duplicate procurement tables that conflict with existing ones
DROP TABLE IF EXISTS procurement_invoice_items CASCADE;
DROP TABLE IF EXISTS procurement_invoices CASCADE;
DROP TABLE IF EXISTS procurement_supplier_items CASCADE;
DROP TABLE IF EXISTS procurement_payments CASCADE;
DROP TABLE IF EXISTS procurement_suppliers CASCADE;

-- Drop old triggers/functions for dropped tables
DROP FUNCTION IF EXISTS generate_procurement_invoice_number() CASCADE;

-- Alter procurement_orders to reference pos_suppliers instead of procurement_suppliers
-- First drop existing FK if any
ALTER TABLE procurement_orders DROP CONSTRAINT IF EXISTS procurement_orders_supplier_id_fkey;
ALTER TABLE procurement_orders ADD CONSTRAINT procurement_orders_supplier_id_fkey 
  FOREIGN KEY (supplier_id) REFERENCES pos_suppliers(id);

-- Add product_id to procurement_order_items
ALTER TABLE procurement_order_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);

-- Add procurement_order_id to purchase_invoices
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS procurement_order_id uuid REFERENCES procurement_orders(id);
