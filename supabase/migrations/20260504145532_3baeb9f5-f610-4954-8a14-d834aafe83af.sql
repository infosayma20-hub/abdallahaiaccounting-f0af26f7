-- Phase A: Generalization Hard Stop
-- Adds opt-in settings for POS mode + call center, and per-printer image mode override.
-- No data changes; no behavior change without explicit opt-in.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_mode text NOT NULL DEFAULT 'restaurant'
    CHECK (pos_mode IN ('restaurant', 'retail', 'service')),
  ADD COLUMN IF NOT EXISTS pos_call_center_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.pos_printers
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_settings.pos_mode IS
  'POS UX mode: restaurant (tables+kitchen+dine-in), retail (cart only), service. Default restaurant for back-compat with existing tenants.';
COMMENT ON COLUMN public.company_settings.pos_call_center_enabled IS
  'When true, the POS shift dialog shows the Call Center cash box option.';
COMMENT ON COLUMN public.pos_printers.settings IS
  'Per-printer overrides. Recognized keys: image_mode ("unified_kitchen" merges kitchen/grill/pizza into one printer).';
