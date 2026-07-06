
-- 1. kiosk_settings table
CREATE TABLE IF NOT EXISTS public.kiosk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  exit_pin text NOT NULL DEFAULT '1234',
  default_language text NOT NULL DEFAULT 'ar',
  welcome_image_url text,
  logo_url text,
  primary_color text DEFAULT '#E53935',
  idle_timeout_seconds integer NOT NULL DEFAULT 60,
  receipt_printer_id uuid,
  visa_terminal_id text,
  require_phone boolean NOT NULL DEFAULT true,
  require_name boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

GRANT SELECT ON public.kiosk_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_settings TO authenticated;
GRANT ALL ON public.kiosk_settings TO service_role;

ALTER TABLE public.kiosk_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kiosk settings readable by anon for active kiosks"
  ON public.kiosk_settings FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "Users manage own kiosk settings"
  ON public.kiosk_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_kiosk_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_kiosk_settings_updated_at
  BEFORE UPDATE ON public.kiosk_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_kiosk_settings_updated_at();

-- 2. pos_orders: source + kiosk customer info
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS kiosk_customer_name text,
  ADD COLUMN IF NOT EXISTS kiosk_customer_phone text;

CREATE INDEX IF NOT EXISTS idx_pos_orders_source ON public.pos_orders(source);
