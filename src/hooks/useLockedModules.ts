import { useMemo } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";

/**
 * Maps route path prefixes to app IDs used in hidden_apps.
 * When a route starts with any of these prefixes and its app ID is in hidden_apps,
 * the module is considered locked.
 */
const ROUTE_TO_APP_ID: Record<string, string> = {
  "/pos": "pos",
  "/pos-users": "pos",
  "/employees": "hr",
  "/hr": "hr",
  "/inventory": "inventory",
  "/fixed-assets": "fixed-assets",
  "/projects": "projects",
  "/workshops": "workshops",
  "/call-center": "callcenter",
};

export function useLockedModules() {
  const { settings } = useCompanySettings();

  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);

  const isModuleLocked = (appId: string): boolean => {
    return hiddenApps.includes(appId);
  };

  const isRouteLocked = (path: string): boolean => {
    for (const [prefix, appId] of Object.entries(ROUTE_TO_APP_ID)) {
      if (path.startsWith(prefix) && hiddenApps.includes(appId)) {
        return true;
      }
    }
    return false;
  };

  const getLockedModuleName = (path: string): string => {
    const names: Record<string, string> = {
      pos: "نقطة البيع",
      hr: "الموارد البشرية",
      inventory: "المخزون",
      "fixed-assets": "الأصول الثابتة",
      projects: "المشاريع",
      workshops: "الورشات",
      callcenter: "مركز الاتصال",
    };
    for (const [prefix, appId] of Object.entries(ROUTE_TO_APP_ID)) {
      if (path.startsWith(prefix)) {
        return names[appId] || "هذا الموديل";
      }
    }
    return "هذا الموديل";
  };

  return { hiddenApps, isModuleLocked, isRouteLocked, getLockedModuleName };
}
