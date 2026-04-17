import { useMemo } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

/**
 * Maps route path prefixes to app IDs used in hidden_apps + enabled_modules.
 */
const ROUTE_TO_APP_ID: Record<string, string> = {
  "/pos": "pos",
  "/pos-users": "pos",
  "/employees": "hr",
  "/hr": "hr",
  "/inventory": "inventory",
  "/fixed-assets": "fixed-assets",
  "/projects": "contracting",
  "/workshops": "workshops",
  "/call-center": "call-center",
  "/warranty": "warranty",
  "/tourism": "tourism",
  "/ecommerce": "ecommerce",
  "/tasks": "tasks",
  "/ai-accountant": "ai-accountant",
};

const APP_NAMES_AR: Record<string, string> = {
  pos: "نقطة البيع",
  hr: "الموارد البشرية",
  inventory: "المخزون",
  "fixed-assets": "الأصول الثابتة",
  contracting: "المقاولات",
  workshops: "الورشات",
  "call-center": "مركز الاتصال",
  warranty: "إدارة الكفالات",
  tourism: "السياحة والسفر",
  ecommerce: "التجارة الإلكترونية",
  tasks: "المهام",
  "ai-accountant": "المحاسب الذكي",
};

export function useLockedModules() {
  const { settings } = useCompanySettings();
  const { subscription } = useSubscription();
  const { isSuperAdmin, isTrial } = useSubscriptionGuard();

  const hiddenApps: string[] = useMemo(
    () => (settings as any)?.hidden_apps || [],
    [settings]
  );

  const enabledModules: string[] = useMemo(
    () => subscription?.enabledModules || [],
    [subscription]
  );

  /**
   * App is locked if:
   * - Super admin hid it explicitly (hidden_apps), OR
   * - User has a paid plan AND the module is NOT in plan's enabled_modules
   * - During Trial: ALL apps unlocked (unless hidden by super admin)
   * - Super admin role: nothing is locked
   */
  const isModuleLocked = (appId: string): boolean => {
    if (isSuperAdmin) return false;
    // ⛔ Trial users see EVERYTHING — no locks at all, even if hidden_apps set
    if (isTrial) return false;
    // ⛔ While subscription data is still loading → don't lock anything (prevents flicker)
    if (!subscription) return false;
    // Super admin hidden apps (only enforced for paid users, not trial)
    if (hiddenApps.includes(appId)) return true;
    // Paid users restricted by plan
    if (enabledModules.length === 0) return false; // no plan data → don't block
    return !enabledModules.includes(appId);
  };

  const isRouteLocked = (path: string): boolean => {
    for (const [prefix, appId] of Object.entries(ROUTE_TO_APP_ID)) {
      if (path.startsWith(prefix) && isModuleLocked(appId)) {
        return true;
      }
    }
    return false;
  };

  const getLockedModuleName = (path: string): string => {
    for (const [prefix, appId] of Object.entries(ROUTE_TO_APP_ID)) {
      if (path.startsWith(prefix)) {
        return APP_NAMES_AR[appId] || "هذا الموديل";
      }
    }
    return "هذا الموديل";
  };

  return { hiddenApps, enabledModules, isModuleLocked, isRouteLocked, getLockedModuleName };
}
