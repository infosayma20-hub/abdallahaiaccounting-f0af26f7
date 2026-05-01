ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.van_sales_days REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.van_sales_days;