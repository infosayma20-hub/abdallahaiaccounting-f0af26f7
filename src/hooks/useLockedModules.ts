import { useMemo } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";
import { resolveRouteAppId, APP_NAMES_AR } from "@/lib/permissions/routeAppId";

export function useLockedModules() {
  const { settings } = useCompanySettings();
  const { subscription } = useSubscription();
  const { isSuperAdmin, isTrial } = useSubscriptionGuard();
  const { allow: allowOverrides, deny: denyOverrides } = useMyAppOverrides();

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
    // Per-user override: deny is strongest
    if (denyOverrides.has(appId)) return true;
    if (allowOverrides.has(appId)) return false;
    // 🚫 Premium-lock نظام مُلغى — لم نعد نقفل بناءً على الباقة
    // التحكم اليدوي فقط عبر hidden_apps من Super Admin
    if (isTrial) return false;
    if (hiddenApps.includes(appId)) return true;
    return false;
  };

  const isRouteLocked = (path: string, search?: string): boolean => {
    const appId = resolveRouteAppId(path, search);
    return appId ? isModuleLocked(appId) : false;
  };

  const getLockedModuleName = (path: string, search?: string): string => {
    const appId = resolveRouteAppId(path, search);
    return (appId && APP_NAMES_AR[appId]) || "هذا الموديل";
  };

  return { hiddenApps, enabledModules, isModuleLocked, isRouteLocked, getLockedModuleName, allowOverrides, denyOverrides };
}
