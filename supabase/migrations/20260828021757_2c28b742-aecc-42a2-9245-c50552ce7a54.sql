
CREATE TABLE IF NOT EXISTS public.external_api_rate_limits (
  key_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  bucket text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, bucket, window_start)
);

GRANT ALL ON public.external_api_rate_limits TO service_role;
ALTER TABLE public.external_api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only rate limits" ON public.external_api_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_external_api_quota(
  _key_id uuid,
  _bucket text,
  _limit integer,
  _window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win timestamptz := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  _count integer;
BEGIN
  INSERT INTO public.external_api_rate_limits AS r (key_id, bucket, window_start, request_count)
  VALUES (_key_id, _bucket, _win, 1)
  ON CONFLICT (key_id, bucket, window_start)
  DO UPDATE SET request_count = r.request_count + 1, updated_at = now()
  RETURNING request_count INTO _count;

  DELETE FROM public.external_api_rate_limits
  WHERE window_start < now() - interval '1 hour';

  RETURN jsonb_build_object(
    'allowed', _count <= _limit,
    'count', _count,
    'limit', _limit,
    'reset_at', _win + make_interval(secs => _window_seconds)
  );
END;
$$;
