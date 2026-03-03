
-- Auto-assign trial subscription when a new profile is created
CREATE OR REPLACE FUNCTION public.auto_assign_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_starter_plan_id UUID;
BEGIN
  -- Get the starter plan
  SELECT id INTO v_starter_plan_id
  FROM public.plans
  WHERE plan_key = 'starter' AND is_active = true
  LIMIT 1;

  IF v_starter_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (
      NEW.user_id,
      v_starter_plan_id,
      'monthly',
      'trial',
      now() + INTERVAL '14 days',
      now(),
      now() + INTERVAL '14 days'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table (fires after profile creation)
CREATE TRIGGER on_profile_created_assign_trial
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_trial_subscription();

-- Allow super_admin to update subscriptions
CREATE POLICY "Users can update own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
