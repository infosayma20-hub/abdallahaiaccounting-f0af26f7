import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PosMode = "restaurant" | "retail" | "service";

export interface PosFeatureFlags {
  posMode: PosMode;
  /** Restaurant features (tables, kitchen, dine-in, send-to-kitchen). */
  restaurantFeatures: boolean;
  /** Show the Call Center cash box option in the open-shift dialog. */
  callCenterEnabled: boolean;
  loading: boolean;
}

/**
 * Phase A — Generalization Hard Stop.
 * Reads pos_mode + pos_call_center_enabled from company_settings of the
 * data owner (team owner if applicable). Defaults preserve legacy
 * Malaky/restaurant behavior:
 *   - pos_mode defaults to "restaurant" at the DB level.
 *   - call center stays OFF unless explicitly enabled, EXCEPT for the
 *     legacy Malaky account where we fall back to ON to avoid breaking
 *     production until the tenant flips the switch.
 */
export function usePosMode(): PosFeatureFlags {
  const { user } = useAuth();
  const [state, setState] = useState<PosFeatureFlags>({
    posMode: "restaurant",
    restaurantFeatures: true,
    callCenterEnabled: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    (async () => {
      try {
        // Resolve data owner (team owner if invited).
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id, invited_by")
          .eq("user_id", user.id)
          .maybeSingle();
        const ownerId = (prof as any)?.invited_by || user.id;

        const { data: cs } = await supabase
          .from("company_settings" as any)
          .select("pos_mode, pos_call_center_enabled")
          .eq("user_id", ownerId)
          .maybeSingle();

        const posMode = ((cs as any)?.pos_mode as PosMode) || "restaurant";
        const isMalakyLegacy = user.email === "malakybroast@gmail.com";
        const callCenterEnabled =
          (cs as any)?.pos_call_center_enabled ?? isMalakyLegacy;

        if (!cancelled) {
          setState({
            posMode,
            restaurantFeatures: posMode === "restaurant",
            callCenterEnabled: !!callCenterEnabled,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  return state;
}