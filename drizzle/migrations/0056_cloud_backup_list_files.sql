CREATE OR REPLACE FUNCTION public.cloud_backup_list_files(_owner uuid)
RETURNS TABLE(bucket_id text, name text, size bigint, mimetype text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage
AS $$
  WITH ids AS (
    SELECT _owner::text AS id
    UNION SELECT e.auth_user_id::text FROM public.employees e WHERE e.user_id = _owner AND e.auth_user_id IS NOT NULL
  )
  SELECT o.bucket_id::text, o.name::text, COALESCE((o.metadata->>'size')::bigint,0), o.metadata->>'mimetype'
  FROM storage.objects o
  WHERE o.bucket_id NOT IN ('backups','kds-audio-cache','database_export_04_09_26')
    AND split_part(o.name,'/',1) IN (SELECT id FROM ids)
$$;
REVOKE ALL ON FUNCTION public.cloud_backup_list_files(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_backup_list_files(uuid) TO service_role;