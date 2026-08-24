import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PosMode = "restaurant" | "retail" | "service";

export interface PosFeatureFlags {
  posMode: PosMode;
  /** Restaurant features (tables, kitchen, dine-in, send-to-kitchen). */
  restaurantFeatures: boolean;
  /** Whether table numbers / table picker are used. When false the
   *  "طاولة" pill becomes a single tap (no numbered picker) and any
   *  table-list UI is hidden. Kitchen/dine-in flow itself stays on. */
  tablesEnabled: boolean;
  /** Show the Call Center cash box option in the open-shift dialog. */
  callCenterEnabled: boolean;
  /** Delivery flow: "توصيل" order type, address, zones, delivery apps. */
  deliveryEnabled: boolean;
  /** Employee meal discounts (family 10% / individual 50% dual mode). */
  employeeMealsEnabled: boolean;
  /** Loyalty points + customer wallet tender. */
  loyaltyEnabled: boolean;
  loading: boolean;
}

/**
 * Phase A+B — Generalization Hard Stop.
 * Reads pos_mode + feature toggles from company_settings of the
 * data owner (team owner if applicable). Defaults preserve legacy
 * Malaky/restaurant behavior:
 *   - pos_mode defaults to "restaurant" at the DB level.
 *   - nullable feature columns: NULL = "follow the mode" (restaurant = ON,
 *     retail/service = OFF) so existing tenants keep their exact behavior.
 *   - call center stays OFF unless explicitly enabled, EXCEPT for the
 *     legacy Malaky account where we fall back to ON to avoid breaking
 *     production until the tenant flips the switch.
 *
 * وضع التجزئة (retail): نقطة بيع نظيفة — بلا طاولات، بلا توصيل، بلا كول
 * سنتر، بلا خصومات وجبات، بلا ولاء/محفظة — ما لم يفعّلها الأدمن صراحة
 * من الإعدادات ← نقطة البيع ← «وضع نقطة البيع».
 */
export function usePosMode(): PosFeatureFlags {
  const { user } = useAuth();
  const [state, setState] = useState<PosFeatureFlags>({
    posMode: "restaurant",
    restaurantFeatures: true,
    tablesEnabled: true,
    callCenterEnabled: false,
    deliveryEnabled: true,
    employeeMealsEnabled: true,
    loyaltyEnabled: true,
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
          .select("pos_mode, pos_call_center_enabled, pos_tables_enabled, pos_delivery_enabled, pos_employee_meals_enabled, pos_loyalty_enabled")
          .eq("user_id", ownerId)
          .maybeSingle();

        const posMode = ((cs as any)?.pos_mode as PosMode) || "restaurant";
        const isRestaurant = posMode === "restaurant";
        const isMalakyLegacy = user.email === "malakybroast@gmail.com";
        const callCenterEnabled =
          (cs as any)?.pos_call_center_enabled ?? isMalakyLegacy;
        const tablesEnabled = (cs as any)?.pos_tables_enabled ?? true;
        // NULL = يتبع الوضع: مطعم = مفعّل، تجزئة/خدمات = مطفأ
        const deliveryEnabled = (cs as any)?.pos_delivery_enabled ?? isRestaurant;
        const employeeMealsEnabled = (cs as any)?.pos_employee_meals_enabled ?? isRestaurant;
        const loyaltyEnabled = (cs as any)?.pos_loyalty_enabled ?? isRestaurant;

        if (!cancelled) {
          setState({
            posMode,
            restaurantFeatures: isRestaurant,
            tablesEnabled: !!tablesEnabled,
            callCenterEnabled: !!callCenterEnabled,
            deliveryEnabled: !!deliveryEnabled,
            employeeMealsEnabled: !!employeeMealsEnabled,
            loyaltyEnabled: !!loyaltyEnabled,
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
