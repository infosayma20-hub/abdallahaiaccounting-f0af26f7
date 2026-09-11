REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.domain_events_outbox FROM anon, authenticated;
REVOKE SELECT ON public.domain_events_outbox FROM anon;
GRANT SELECT ON public.domain_events_outbox TO authenticated;
GRANT ALL ON public.domain_events_outbox TO service_role;

REVOKE ALL ON FUNCTION public.is_command_flag_enabled_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_command_flag_enabled_v1(uuid, text) TO service_role;