ALTER TABLE public.pos_display_devices ADD COLUMN IF NOT EXISTS short_code text;

CREATE OR REPLACE FUNCTION public.kds_gen_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  i int;
  tries int := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..5 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.pos_display_devices WHERE short_code = candidate);
    tries := tries + 1;
    IF tries > 50 THEN
      candidate := candidate || floor(random() * 90 + 10)::text;
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE public.pos_display_devices
SET short_code = public.kds_gen_short_code()
WHERE short_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_display_devices_short_code_key
  ON public.pos_display_devices (short_code) WHERE short_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pos_display_devices_set_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.short_code IS NULL OR btrim(NEW.short_code) = '' THEN
    NEW.short_code := public.kds_gen_short_code();
  ELSE
    NEW.short_code := lower(btrim(NEW.short_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_display_devices_short_code ON public.pos_display_devices;
CREATE TRIGGER trg_pos_display_devices_short_code
BEFORE INSERT OR UPDATE OF short_code ON public.pos_display_devices
FOR EACH ROW EXECUTE FUNCTION public.pos_display_devices_set_short_code();

-- Public resolver: short code -> device token (used by TV screens, no login)
CREATE OR REPLACE FUNCTION public.kds_resolve_display_code(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT token
  FROM public.pos_display_devices
  WHERE short_code = lower(btrim(_code))
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.kds_resolve_display_code(text) TO anon, authenticated, service_role;