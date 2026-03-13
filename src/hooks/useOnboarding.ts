import { useState, useEffect, useCallback, useRef } from "react";
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
  const fetchedRef = useRef(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    // Prevent double-fetch when user object ref changes
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchData = async () => {
      const [onboardingRes, settingsRes] = await Promise.all([
        supabase.from("user_onboarding").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("company_settings").select("business_type").eq("user_id", userId).maybeSingle(),
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
  }, [userId]);

  const update = useCallback(
    async (partial: Partial<OnboardingState>) => {
      if (!userId) return;
      const newState = { ...state, ...partial };
      setState(newState);

      // Clear session guard so modal won't reappear
      if (partial.welcome_modal_shown) {
        sessionStorage.setItem("welcome_modal_shown", "true");
      }

      await supabase
        .from("user_onboarding")
        .upsert(
          {
            user_id: userId,
            ...newState,
            ...(partial.full_tour_completed ? { full_tour_completed_at: new Date().toISOString() } : {}),
          },
          { onConflict: "user_id" }
        );
    },
    [userId, state]
  );

  // Use sessionStorage guard to prevent modal showing twice in same session
  const sessionGuard = typeof window !== "undefined" && sessionStorage.getItem("welcome_modal_shown") === "true";
  const shouldShowWelcome = !loading && !state.welcome_modal_shown && !state.dont_show_again && !sessionGuard;
  const shouldShowTour = !loading && state.welcome_modal_shown && !state.full_tour_completed && !state.full_tour_skipped && !state.dont_show_again;

  return { state, loading, update, shouldShowWelcome, shouldShowTour, businessType };
};
