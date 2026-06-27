-- Remove from realtime publication (ignore errors if not present)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.qamar_orders;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.qamar_order_items;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.qamar_order_statuses;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP TABLE IF EXISTS public.qamar_order_items CASCADE;
DROP TABLE IF EXISTS public.qamar_orders CASCADE;
DROP TABLE IF EXISTS public.qamar_order_statuses CASCADE;