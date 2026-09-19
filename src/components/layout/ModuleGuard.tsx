import { useLocation } from "react-router-dom";
import { useLockedModules } from "@/hooks/useLockedModules";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";
import { resolveRouteAppId } from "@/lib/permissions/routeAppId";
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

  // Map current route (path + query) to its app id — shared with useLockedModules
  const path = location.pathname;
  const search = location.search;
  const routeAppId = resolveRouteAppId(path, search);

  // Per-user deny: block even super-admins of trial — admin (owner) handled by RLS / never denies themselves
  if (!overridesLoading && routeAppId && denyOverrides.has(routeAppId) && !isSuperAdmin) {
    return <LockedModulePage moduleName={getLockedModuleName(path, search)} />;
  }

  // ⛔ Never show lock for: loading, super admin, trial users, or no-subscription state
  if (loading || isSuperAdmin || isTrial || !subscription) {
    return <>{children}</>;
  }

  if (isRouteLocked(path, search)) {
    return <LockedModulePage moduleName={getLockedModuleName(path, search)} />;
  }

  return <>{children}</>;
};

export default ModuleGuard;
