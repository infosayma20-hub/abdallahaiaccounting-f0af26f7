
-- 1) Create public-safe view (excludes exit_pin, visa_terminal_id, visa_bank_account_id)
CREATE OR REPLACE VIEW public.kiosk_settings_public
WITH (security_invoker = true)
AS
SELECT
  id, user_id, branch_id, is_active,
  default_language, welcome_image_url, logo_url, primary_color,
  idle_timeout_seconds, receipt_printer_id,
  require_phone, require_name,
  created_at, updated_at
FROM public.kiosk_settings
WHERE is_active = true;

-- 2) Grant SELECT on view to anon/authenticated
GRANT SELECT ON public.kiosk_settings_public TO anon, authenticated;

-- 3) Server-side exit PIN verification (SECURITY DEFINER so anon can verify without reading pin)
CREATE OR REPLACE FUNCTION public.verify_kiosk_exit_pin(p_branch_id uuid, p_pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiosk_settings
    WHERE branch_id = p_branch_id
      AND is_active = true
      AND exit_pin = p_pin
  );
$$;

REVOKE ALL ON FUNCTION public.verify_kiosk_exit_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_kiosk_exit_pin(uuid, text) TO anon, authenticated;

-- 4) Also allow the view to expose active kiosks — but we need the row even if we want to select a specific branch.
-- Since the view already filters is_active=true, and we grant SELECT on it, it works.

-- 5) Now REMOVE the dangerous anon policy on the base table
DROP POLICY IF EXISTS "Kiosk settings readable by anon for active kiosks" ON public.kiosk_settings;

-- 6) Ensure authenticated management policy still exists (unchanged)
-- (Policy "Owner or POS team can manage kiosk settings" is already in place)
