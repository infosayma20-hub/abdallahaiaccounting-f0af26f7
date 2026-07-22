
CREATE TABLE IF NOT EXISTS public.trial_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  business_name text,
  email text NOT NULL,
  country_code text NOT NULL DEFAULT '+970',
  phone_local text NOT NULL,
  phone_e164 text NOT NULL,
  business_type text,
  employees_count text,
  source text DEFAULT 'signup_form',
  notes text,
  status text NOT NULL DEFAULT 'new',
  linked_user_id uuid,
  user_agent text,
  ip_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_signups_created ON public.trial_signups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_signups_email ON public.trial_signups(email);
CREATE INDEX IF NOT EXISTS idx_trial_signups_status ON public.trial_signups(status);

GRANT SELECT, INSERT ON public.trial_signups TO authenticated;
GRANT SELECT, INSERT ON public.trial_signups TO anon;
GRANT ALL ON public.trial_signups TO service_role;

ALTER TABLE public.trial_signups ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon or authenticated) to insert their signup details
DROP POLICY IF EXISTS "Anyone can submit trial signup" ON public.trial_signups;
CREATE POLICY "Anyone can submit trial signup"
  ON public.trial_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Super admins can view all
DROP POLICY IF EXISTS "Super admins view trial signups" ON public.trial_signups;
CREATE POLICY "Super admins view trial signups"
  ON public.trial_signups FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Designated marketing viewer (nesthana373@gmail.com) can view all
DROP POLICY IF EXISTS "Marketing viewer sees trial signups" ON public.trial_signups;
CREATE POLICY "Marketing viewer sees trial signups"
  ON public.trial_signups FOR SELECT
  TO authenticated
  USING (auth.uid() = 'a26051b0-2904-4dbc-ab41-d171ae2d69be'::uuid);

-- Super admins can update status / notes
DROP POLICY IF EXISTS "Super admins update trial signups" ON public.trial_signups;
CREATE POLICY "Super admins update trial signups"
  ON public.trial_signups FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.trg_trial_signups_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trial_signups_touch ON public.trial_signups;
CREATE TRIGGER trial_signups_touch
  BEFORE UPDATE ON public.trial_signups
  FOR EACH ROW EXECUTE FUNCTION public.trg_trial_signups_touch();
