CREATE OR REPLACE FUNCTION public.compute_warranty_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS NULL OR NEW.end_date = NEW.start_date THEN
    NEW.end_date := NEW.start_date + (NEW.duration_months || ' months')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$;