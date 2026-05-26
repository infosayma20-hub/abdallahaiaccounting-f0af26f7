
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  IF v = '' OR v IS NULL THEN RETURN NULL; END IF;

  -- Strip international prefixes (Palestine: 970, Israel-routed: 972; both used)
  IF v LIKE '+970%'  THEN v := '0' || substring(v from 5); END IF;
  IF v LIKE '+972%'  THEN v := '0' || substring(v from 5); END IF;
  IF v LIKE '00970%' THEN v := '0' || substring(v from 6); END IF;
  IF v LIKE '00972%' THEN v := '0' || substring(v from 6); END IF;
  IF v LIKE '970%' AND length(v) >= 11 THEN v := '0' || substring(v from 4); END IF;
  IF v LIKE '972%' AND length(v) >= 11 THEN v := '0' || substring(v from 4); END IF;

  v := regexp_replace(v, '\+', '', 'g');
  RETURN v;
END;
$$;
