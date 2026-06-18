
CREATE OR REPLACE FUNCTION public.increment_device_token_failures(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.device_tokens
     SET fail_count = COALESCE(fail_count, 0) + 1,
         last_seen_at = COALESCE(last_seen_at, now())
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.increment_device_token_failures(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_device_token_failures(uuid) TO service_role;
