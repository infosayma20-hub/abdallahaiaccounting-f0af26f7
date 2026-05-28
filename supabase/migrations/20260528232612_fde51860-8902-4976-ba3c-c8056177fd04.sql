
-- Add bonus_days to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS bonus_days integer NOT NULL DEFAULT 0;

-- Referral codes per user
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referral code" ON public.referral_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public lookup of code -> referrer (needed at signup before login)
CREATE POLICY "Anyone can lookup code" ON public.referral_codes
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.referral_codes TO anon;

-- Referrals tracking
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_email text,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rewarded','expired')),
  reward_days integer NOT NULL DEFAULT 30,
  reward_granted boolean NOT NULL DEFAULT false,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);

GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrer sees own referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

CREATE POLICY "Service inserts referrals" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (true);

-- Function: generate a 6-char alphanumeric code for current user
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_existing text;
  v_attempts int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT code INTO v_existing FROM public.referral_codes WHERE user_id = v_user;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN RAISE EXCEPTION 'code generation failed'; END IF;
  END LOOP;

  INSERT INTO public.referral_codes(user_id, code) VALUES (v_user, v_code);
  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO authenticated;

-- Function: apply referral at signup (called after new user signs in)
CREATE OR REPLACE FUNCTION public.apply_referral_signup(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_referrer uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_code IS NULL OR length(p_code) < 4 THEN RETURN; END IF;

  SELECT user_id INTO v_referrer FROM public.referral_codes WHERE code = upper(p_code);
  IF v_referrer IS NULL OR v_referrer = v_user THEN RETURN; END IF;

  -- avoid duplicate
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = v_user) THEN RETURN; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  INSERT INTO public.referrals(referrer_user_id, referred_user_id, referred_email, code, status)
  VALUES (v_referrer, v_user, v_email, upper(p_code), 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_referral_signup(text) TO authenticated;

-- Trigger: when referred user's subscription becomes active, qualify the referral & grant bonus
CREATE OR REPLACE FUNCTION public.qualify_referral_on_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref record;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    SELECT * INTO v_ref FROM public.referrals
      WHERE referred_user_id = NEW.user_id AND status = 'pending'
      LIMIT 1;
    IF v_ref.id IS NOT NULL THEN
      UPDATE public.referrals
        SET status = 'rewarded', qualified_at = now(), rewarded_at = now(), reward_granted = true
        WHERE id = v_ref.id;
      UPDATE public.subscriptions
        SET bonus_days = bonus_days + v_ref.reward_days,
            current_period_end = current_period_end + (v_ref.reward_days || ' days')::interval
        WHERE user_id = v_ref.referrer_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qualify_referral ON public.subscriptions;
CREATE TRIGGER trg_qualify_referral
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.qualify_referral_on_active();
