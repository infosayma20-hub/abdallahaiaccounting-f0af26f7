GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_customers TO authenticated;
GRANT ALL ON public.sparta_customers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_invoices TO authenticated;
GRANT ALL ON public.sparta_invoices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_invoice_items TO authenticated;
GRANT ALL ON public.sparta_invoice_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_payments TO authenticated;
GRANT ALL ON public.sparta_payments TO service_role;