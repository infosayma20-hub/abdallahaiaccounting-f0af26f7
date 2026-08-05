CREATE TABLE IF NOT EXISTS public._rls_perf_backup_all_20260805 (
  id bigserial PRIMARY KEY,
  tablename text NOT NULL,
  policyname text NOT NULL,
  permissive text,
  roles text,
  old_qual text,
  old_with_check text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public._rls_perf_backup_all_20260805 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public._rls_perf_backup_all_20260805_id_seq TO service_role;
ALTER TABLE public._rls_perf_backup_all_20260805 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access" ON public._rls_perf_backup_all_20260805 FOR SELECT USING (false);

DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  roles_txt text;
  sql_txt text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()', '( SELECT auth.uid() )');
      new_qual := replace(new_qual, '( SELECT ( SELECT auth.uid() ) )', '( SELECT auth.uid() )');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'auth.uid()', '( SELECT auth.uid() )');
      new_check := replace(new_check, '( SELECT ( SELECT auth.uid() ) )', '( SELECT auth.uid() )');
    END IF;

    IF new_qual IS NOT DISTINCT FROM r.qual AND new_check IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(x), ', ') INTO roles_txt FROM unnest(r.roles) AS x;

    INSERT INTO public._rls_perf_backup_all_20260805 (tablename, policyname, permissive, roles, old_qual, old_with_check)
    VALUES (r.tablename, r.policyname, r.permissive, coalesce(roles_txt,'public'), r.qual, r.with_check);

    EXECUTE format('DROP POLICY %I ON public.%I;', r.policyname, r.tablename);

    sql_txt := format('CREATE POLICY %I ON public.%I AS %s FOR ALL TO %s',
      r.policyname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      coalesce(roles_txt, 'public'));

    IF new_qual IS NOT NULL THEN
      sql_txt := sql_txt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      sql_txt := sql_txt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE sql_txt || ';';
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Optimized % ALL policies', n;
END $$;