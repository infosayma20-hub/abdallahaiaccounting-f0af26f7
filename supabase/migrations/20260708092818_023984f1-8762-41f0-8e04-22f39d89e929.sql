CREATE OR REPLACE FUNCTION public.validate_product_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow NULL (legacy) plus the extended set used across Inventory + ProductEdit pages.
  IF NEW.product_type IS NOT NULL
     AND NEW.product_type NOT IN ('product', 'service', 'raw', 'sub_assembly', 'wip', 'finished') THEN
    RAISE EXCEPTION 'product_type must be one of: product, service, raw, sub_assembly, wip, finished';
  END IF;

  IF NEW.product_type = 'service'
     AND NEW.service_direction IS NOT NULL
     AND NEW.service_direction NOT IN ('provided', 'received') THEN
    RAISE EXCEPTION 'service_direction must be provided or received';
  END IF;

  -- Only clear service_direction when it's definitely not a service row.
  IF NEW.product_type IS NOT NULL AND NEW.product_type <> 'service' THEN
    NEW.service_direction := NULL;
  END IF;

  RETURN NEW;
END;
$function$;