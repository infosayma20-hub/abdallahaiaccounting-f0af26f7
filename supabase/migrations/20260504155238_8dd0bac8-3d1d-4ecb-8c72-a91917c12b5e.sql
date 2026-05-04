-- Backfill legacy invoice_type='sales' (plural) to canonical 'sale' (singular).
-- Caused by an early version of create_rep_sale_atomic that briefly used 'sales'.
UPDATE public.invoices SET invoice_type = 'sale' WHERE invoice_type = 'sales';