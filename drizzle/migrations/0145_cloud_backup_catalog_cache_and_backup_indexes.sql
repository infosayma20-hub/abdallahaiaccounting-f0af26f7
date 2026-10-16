CREATE TABLE IF NOT EXISTS public.cloud_backup_catalog_cache (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  computed_on date NOT NULL,
  catalog jsonb NOT NULL
);
GRANT ALL ON public.cloud_backup_catalog_cache TO service_role;
ALTER TABLE public.cloud_backup_catalog_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cloud_backup_table_catalog_cached()
RETURNS TABLE(table_name text, filter_column text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Hebron')::date; v_cat jsonb;
BEGIN
  SELECT catalog INTO v_cat FROM public.cloud_backup_catalog_cache WHERE id = 1 AND computed_on = v_today;
  IF v_cat IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('table_name', c.table_name, 'filter_column', c.filter_column)), '[]'::jsonb)
      INTO v_cat FROM public.cloud_backup_table_catalog() c;
    INSERT INTO public.cloud_backup_catalog_cache(id, computed_on, catalog) VALUES (1, v_today, v_cat)
      ON CONFLICT (id) DO UPDATE SET computed_on = EXCLUDED.computed_on, catalog = EXCLUDED.catalog;
  END IF;
  RETURN QUERY SELECT e->>'table_name', e->>'filter_column' FROM jsonb_array_elements(v_cat) e;
END $$;
REVOKE ALL ON FUNCTION public.cloud_backup_table_catalog_cached() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_backup_table_catalog_cached() TO service_role;

CREATE INDEX IF NOT EXISTS idx_pos_order_lines_user_id_id ON public.pos_order_lines (user_id, id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_user_id_id ON public.kitchen_tickets (user_id, id);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_print_log_owner_id_id ON public.pos_kitchen_print_log (owner_id, id);
CREATE INDEX IF NOT EXISTS idx_call_center_orders_user_created ON public.call_center_orders (user_id, created_at DESC);