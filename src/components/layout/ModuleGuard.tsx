import { useLocation } from "react-router-dom";
import { useLockedModules } from "@/hooks/useLockedModules";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";
import LockedModulePage from "./LockedModulePage";

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps routes to check if the current module is locked.
 * STRICT RULE: Trial users + loading state → NEVER show lock screen (no flicker).
 */
const ModuleGuard = ({ children }: Props) => {
  const location = useLocation();
  const { isRouteLocked, getLockedModuleName } = useLockedModules();
  const { isTrial, isSuperAdmin, loading, subscription } = useSubscriptionGuard();
  const { deny: denyOverrides, loading: overridesLoading } = useMyAppOverrides();

  // Map current path to its app id (mirror of ROUTE_TO_APP_ID inside useLockedModules)
  const path = location.pathname;
  const routeAppId = (() => {
    // Lightweight inline mapping (shares keys with useLockedModules)
    const ROUTE_TO_APP_ID: Record<string, string> = {
      "/pos": "pos", "/pos-users": "pos", "/employees": "hr", "/hr": "hr",
      "/inventory": "inventory", "/fixed-assets": "fixed-assets", "/projects": "contracting",
      "/workshops": "workshops", "/call-center": "call-center", "/warranty": "warranty",
      "/tourism": "tourism", "/ecommerce": "ecommerce", "/tasks": "tasks",
      "/ai-accountant": "ai-accountant", "/sales": "sales", "/purchases": "purchases",
      "/finance": "finance", "/accounting": "finance", "/tax": "tax", "/crm": "crm",
      "/reports": "reports", "/dashboards": "dashboards", "/dashboard": "dashboard",
      "/print-templates": "print-templates", "/van-sales": "van-sales", "/travel": "travel",
      "/contractor": "contractor",
    };
    for (const [prefix, id] of Object.entries(ROUTE_TO_APP_ID)) {
      if (path.startsWith(prefix)) return id;
    }
    return null;
  })();

  // Per-user deny: block even super-admins of trial — admin (owner) handled by RLS / never denies themselves
  if (!overridesLoading && routeAppId && denyOverrides.has(routeAppId) && !isSuperAdmin) {
    return <LockedModulePage moduleName={getLockedModuleName(path)} />;
  }

  // ⛔ Never show lock for: loading, super admin, trial users, or no-subscription state
  if (loading || isSuperAdmin || isTrial || !subscription) {
    return <>{children}</>;
  }

  if (isRouteLocked(path)) {
    return <LockedModulePage moduleName={getLockedModuleName(path)} />;
  }

  return <>{children}</>;
};

export default ModuleGuard;
