CREATE TABLE public.cloud_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  company_name text,
  folder text NOT NULL,
  backup_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Hebron')::date,
  status text NOT NULL DEFAULT 'running',
  tables_count int NOT NULL DEFAULT 0,
  records_count bigint NOT NULL DEFAULT 0,
  files_count int NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.cloud_backup_runs TO authenticated;
GRANT ALL ON public.cloud_backup_runs TO service_role;
ALTER TABLE public.cloud_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX cloud_backup_runs_owner_idx ON public.cloud_backup_runs(owner_id, started_at DESC);
CREATE POLICY "owner or super admin reads backup runs" ON public.cloud_backup_runs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- Tenant-scoped table catalog used only by the backup function (service role)
CREATE OR REPLACE FUNCTION public.cloud_backup_table_catalog()
RETURNS TABLE(table_name text, filter_column text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.table_name::text,
    CASE WHEN bool_or(c.column_name='user_id') THEN 'user_id'
         WHEN bool_or(c.column_name='company_id') THEN 'company_id'
         WHEN bool_or(c.column_name='owner_id') THEN 'owner_id' END
  FROM information_schema.tables t
  JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name
  WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
    AND t.table_name NOT LIKE '\_%'
    AND t.table_name <> 'cloud_backup_runs'
  GROUP BY t.table_name
  HAVING bool_or(c.column_name IN ('user_id','company_id','owner_id'))
  ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.cloud_backup_table_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_backup_table_catalog() TO service_role;