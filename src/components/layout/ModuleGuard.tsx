import { useLocation } from "react-router-dom";
import { useLockedModules } from "@/hooks/useLockedModules";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
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

  // ⛔ Never show lock for: loading, super admin, trial users, or no-subscription state
  if (loading || isSuperAdmin || isTrial || !subscription) {
    return <>{children}</>;
  }

  if (isRouteLocked(location.pathname)) {
    return <LockedModulePage moduleName={getLockedModuleName(location.pathname)} />;
  }

  return <>{children}</>;
};

export default ModuleGuard;
