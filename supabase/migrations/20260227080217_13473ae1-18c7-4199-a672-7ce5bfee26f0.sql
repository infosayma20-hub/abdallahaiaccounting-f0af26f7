
-- User onboarding tracking table
CREATE TABLE public.user_onboarding (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  welcome_modal_shown boolean NOT NULL DEFAULT false,
  full_tour_completed boolean NOT NULL DEFAULT false,
  full_tour_completed_at timestamptz,
  full_tour_skipped boolean NOT NULL DEFAULT false,
  modules_toured jsonb NOT NULL DEFAULT '[]'::jsonb,
  module_first_visits jsonb NOT NULL DEFAULT '{}'::jsonb,
  dont_show_again boolean NOT NULL DEFAULT false,
  last_whats_new_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding" ON public.user_onboarding
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding" ON public.user_onboarding
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding" ON public.user_onboarding
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
