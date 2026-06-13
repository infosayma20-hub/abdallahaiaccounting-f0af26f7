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
  const stateRef = useRef(state);
  stateRef.current = state;

  // Local dismissed guard — set synchronously, survives re-renders
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("welcome_modal_shown") === "true"
  );

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchData = async () => {
      try {
        const [onboardingRes, settingsRes] = await Promise.all([
          supabase.from("user_onboarding").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("company_settings").select("business_type").eq("user_id", userId).maybeSingle(),
        ]);

        if (onboardingRes.data) {
          const data = onboardingRes.data;
          const loaded: OnboardingState = {
            welcome_modal_shown: data.welcome_modal_shown,
            full_tour_completed: data.full_tour_completed,
            full_tour_skipped: data.full_tour_skipped,
            modules_toured: (data.modules_toured as string[]) || [],
            module_first_visits: (data.module_first_visits as Record<string, string>) || {},
            dont_show_again: data.dont_show_again,
          };
          setState(loaded);
          stateRef.current = loaded;

          // If already shown in DB, mark dismissed
          if (data.welcome_modal_shown) {
            setDismissed(true);
          }
        }

        if (settingsRes.data?.business_type) {
          setBusinessType(settingsRes.data.business_type as string);
        }
      } catch (err) {
        console.warn("[useOnboarding] fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  const update = useCallback(
    async (partial: Partial<OnboardingState>) => {
      if (!userId) return;

      // Use ref for latest state to avoid stale closure
      const newState = { ...stateRef.current, ...partial };
      setState(newState);
      stateRef.current = newState;

      // Immediately mark dismissed so modal can't reappear
      if (partial.welcome_modal_shown || partial.full_tour_skipped || partial.dont_show_again) {
        setDismissed(true);
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
    [userId]
  );

  // الجولة التعريفية معطّلة كلياً بناءً على طلب المستخدم
  const shouldShowWelcome = false;
  const shouldShowTour = false;

  return { state, loading, update, shouldShowWelcome, shouldShowTour, businessType };
};
