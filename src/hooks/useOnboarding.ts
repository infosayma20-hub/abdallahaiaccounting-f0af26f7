import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface OnboardingState {
  welcome_modal_shown: boolean;
  full_tour_completed: boolean;
  full_tour_skipped: boolean;
  modules_toured: string[];
  module_first_visits: Record<string, string>;
  dont_show_again: boolean;
}

const defaultState: OnboardingState = {
  welcome_modal_shown: false,
  full_tour_completed: false,
  full_tour_skipped: false,
  modules_toured: [],
  module_first_visits: {},
  dont_show_again: false,
};

export const useOnboarding = () => {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [businessType, setBusinessType] = useState<string | undefined>();

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch onboarding state and business_type in parallel
      const [onboardingRes, settingsRes] = await Promise.all([
        supabase.from("user_onboarding").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("company_settings").select("business_type").eq("user_id", user.id).maybeSingle(),
      ]);

      if (onboardingRes.data) {
        const data = onboardingRes.data;
        setState({
          welcome_modal_shown: data.welcome_modal_shown,
          full_tour_completed: data.full_tour_completed,
          full_tour_skipped: data.full_tour_skipped,
          modules_toured: (data.modules_toured as string[]) || [],
          module_first_visits: (data.module_first_visits as Record<string, string>) || {},
          dont_show_again: data.dont_show_again,
        });
      }

      if (settingsRes.data?.business_type) {
        setBusinessType(settingsRes.data.business_type as string);
      }

      setLoading(false);
    };
    fetchData();
  }, [user]);

  const update = useCallback(
    async (partial: Partial<OnboardingState>) => {
      if (!user) return;
      const newState = { ...state, ...partial };
      setState(newState);

      await supabase
        .from("user_onboarding")
        .upsert(
          {
            user_id: user.id,
            ...newState,
            ...(partial.full_tour_completed ? { full_tour_completed_at: new Date().toISOString() } : {}),
          },
          { onConflict: "user_id" }
        );
    },
    [user, state]
  );

  const shouldShowWelcome = !loading && !state.welcome_modal_shown && !state.dont_show_again;
  const shouldShowTour = !loading && state.welcome_modal_shown && !state.full_tour_completed && !state.full_tour_skipped && !state.dont_show_again;

  return { state, loading, update, shouldShowWelcome, shouldShowTour, businessType };
};
