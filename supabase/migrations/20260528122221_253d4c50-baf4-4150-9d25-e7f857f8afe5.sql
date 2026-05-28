-- 1) Create extensions schema and move pg_trgm out of public (best-effort)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  EXCEPTION WHEN OTHERS THEN
    -- ignore if extension is not movable or insufficient privilege
    RAISE NOTICE 'Could not move pg_trgm: %', SQLERRM;
  END;
END$$;

-- 2) Add team-read SELECT policies on storage.objects for shared private buckets
--    Pattern: first folder segment is the data-owner uuid; team members of that owner can read.
DO $$
DECLARE
  b text;
  pol_name text;
BEGIN
  FOR b IN SELECT unnest(ARRAY[
    'invoice-attachments',
    'voucher-attachments',
    'journal-attachments',
    'loan-attachments',
    'purchase-invoices',
    'employee-forms',
    'passport-documents',
    'travel-documents',
    'cheque-images'
  ]) LOOP
    pol_name := 'Team members can read ' || b;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      pol_name
    );
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = %L
        AND (storage.foldername(name))[1] IS NOT NULL
        AND public.is_team_member(
          auth.uid(),
          ((storage.foldername(name))[1])::uuid
        )
      )
    $f$, pol_name, b);
  END LOOP;
EXCEPTION WHEN invalid_text_representation THEN
  -- if a folder name isn't a valid uuid, the row is just skipped at query time
  NULL;
END$$;