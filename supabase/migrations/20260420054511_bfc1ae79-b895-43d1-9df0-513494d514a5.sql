-- Add share token columns
ALTER TABLE public.custom_dashboards
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

-- Function to auto-generate a share token when is_shared becomes true
CREATE OR REPLACE FUNCTION public.generate_dashboard_share_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_shared = true AND (NEW.share_token IS NULL OR NEW.share_token = '') THEN
    NEW.share_token := encode(gen_random_bytes(18), 'hex');
    NEW.shared_at := now();
  ELSIF NEW.is_shared = false THEN
    NEW.share_token := NULL;
    NEW.shared_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_dashboard_share_token ON public.custom_dashboards;
CREATE TRIGGER trg_generate_dashboard_share_token
BEFORE INSERT OR UPDATE OF is_shared ON public.custom_dashboards
FOR EACH ROW EXECUTE FUNCTION public.generate_dashboard_share_token();

-- Public read policy: anyone (anon) can read a shared dashboard
DROP POLICY IF EXISTS "Public can view shared dashboards" ON public.custom_dashboards;
CREATE POLICY "Public can view shared dashboards"
ON public.custom_dashboards
FOR SELECT
TO anon, authenticated
USING (is_shared = true AND share_token IS NOT NULL);

-- Public read policy on widgets of a shared dashboard
DROP POLICY IF EXISTS "Public can view widgets of shared dashboards" ON public.dashboard_widgets;
CREATE POLICY "Public can view widgets of shared dashboards"
ON public.dashboard_widgets
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.custom_dashboards d
    WHERE d.id = dashboard_widgets.dashboard_id
      AND d.is_shared = true
      AND d.share_token IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_share_token ON public.custom_dashboards(share_token) WHERE share_token IS NOT NULL;