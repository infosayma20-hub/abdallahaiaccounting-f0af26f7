CREATE OR REPLACE FUNCTION public.purge_diagnostic_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pos_network_diagnostics WHERE created_at < now() - interval '3 days';
  DELETE FROM public.user_security_audit WHERE created_at < now() - interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_diagnostic_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('purge-diagnostic-logs', '20 3 * * *', $$SELECT public.purge_diagnostic_logs();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-diagnostic-logs');