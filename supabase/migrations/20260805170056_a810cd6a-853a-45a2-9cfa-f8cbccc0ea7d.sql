CREATE TABLE IF NOT EXISTS public._rls_perf_backup_20260805 (
  id bigserial primary key,
  tablename text not null,
  policyname text not null,
  old_qual text not null,
  created_at timestamptz not null default now()
);
ALTER TABLE public._rls_perf_backup_20260805 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public._rls_perf_backup_20260805 TO service_role;

DO $do$
DECLARE r record; new_qual text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname='public' AND cmd='SELECT'
      AND qual LIKE '%auth.uid()%'
      AND qual NOT LIKE '%SELECT auth.uid()%'
  LOOP
    new_qual := replace(r.qual, 'auth.uid()', '( SELECT auth.uid() )');
    INSERT INTO public._rls_perf_backup_20260805(tablename, policyname, old_qual)
    VALUES (r.tablename, r.policyname, r.qual);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, new_qual);
  END LOOP;
END
$do$;