-- ============================================
-- WARRANTY MODULE: OPT-IN BY DEFAULT
-- ============================================
-- Hide warranty module from all existing users (they can opt-in via Super Admin)
-- New users will also have it hidden by default via the trigger below

-- 1) BACKFILL: Add 'warranty' to hidden_apps for ALL existing company_settings
UPDATE public.company_settings
SET hidden_apps = COALESCE(hidden_apps, ARRAY[]::text[]) || ARRAY['warranty']::text[]
WHERE NOT ('warranty' = ANY(COALESCE(hidden_apps, ARRAY[]::text[])));

-- 2) DEFAULT FOR NEW USERS: Trigger to auto-hide warranty for newly created company_settings
CREATE OR REPLACE FUNCTION public.default_hide_warranty_module()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If hidden_apps is null or doesn't include 'warranty', add it
  IF NEW.hidden_apps IS NULL THEN
    NEW.hidden_apps := ARRAY['warranty']::text[];
  ELSIF NOT ('warranty' = ANY(NEW.hidden_apps)) THEN
    NEW.hidden_apps := NEW.hidden_apps || ARRAY['warranty']::text[];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_hide_warranty ON public.company_settings;
CREATE TRIGGER trg_default_hide_warranty
BEFORE INSERT ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.default_hide_warranty_module();