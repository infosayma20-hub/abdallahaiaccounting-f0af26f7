CREATE TABLE public.loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tagline text,
  logo_url text,
  cover_url text,
  brand_color text NOT NULL DEFAULT '#0D1B2E',
  accent_color text NOT NULL DEFAULT '#14B8A6',
  currency_code text NOT NULL DEFAULT 'ILS',
  points_per_unit numeric NOT NULL DEFAULT 1,
  welcome_message text,
  default_country text NOT NULL DEFAULT 'PS',
  default_phone_code text NOT NULL DEFAULT '+970',
  collect_birthdate boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text,
  birth_day smallint,
  birth_month smallint,
  birth_year smallint,
  phone_code text NOT NULL DEFAULT '+970',
  phone text NOT NULL,
  phone_e164 text NOT NULL,
  country text,
  points_balance numeric NOT NULL DEFAULT 0,
  card_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX loyalty_members_program_phone_key ON public.loyalty_members(program_id, phone_e164);
CREATE UNIQUE INDEX loyalty_members_card_code_key ON public.loyalty_members(card_code);
CREATE INDEX loyalty_members_user_idx ON public.loyalty_members(user_id);
CREATE INDEX loyalty_programs_user_idx ON public.loyalty_programs(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_programs TO authenticated;
GRANT SELECT ON public.loyalty_programs TO anon;
GRANT ALL ON public.loyalty_programs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_members TO authenticated;
GRANT ALL ON public.loyalty_members TO service_role;

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their loyalty programs"
ON public.loyalty_programs FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Public can view active loyalty programs"
ON public.loyalty_programs FOR SELECT TO anon
USING (is_active = true);

CREATE POLICY "Owners manage their loyalty members"
ON public.loyalty_members FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.loyalty_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER loyalty_programs_touch BEFORE UPDATE ON public.loyalty_programs
FOR EACH ROW EXECUTE FUNCTION public.loyalty_touch_updated_at();
CREATE TRIGGER loyalty_members_touch BEFORE UPDATE ON public.loyalty_members
FOR EACH ROW EXECUTE FUNCTION public.loyalty_touch_updated_at();