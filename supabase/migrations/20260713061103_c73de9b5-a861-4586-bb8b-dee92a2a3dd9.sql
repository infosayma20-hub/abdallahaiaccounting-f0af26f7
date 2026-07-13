CREATE OR REPLACE FUNCTION public.cheques_fill_endorsed_to_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.endorsed_to_contact_id IS NOT NULL
     AND (NEW.endorsed_to_name IS NULL OR NEW.endorsed_to_name = '') THEN
    SELECT contact_name INTO NEW.endorsed_to_name
    FROM public.contacts
    WHERE id = NEW.endorsed_to_contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cheques_fill_endorsed_to_name ON public.cheques;
CREATE TRIGGER trg_cheques_fill_endorsed_to_name
BEFORE INSERT OR UPDATE OF endorsed_to_contact_id, endorsed_to_name
ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.cheques_fill_endorsed_to_name();