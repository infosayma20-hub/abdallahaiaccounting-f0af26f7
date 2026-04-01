import { useLocation } from "react-router-dom";
import { useLockedModules } from "@/hooks/useLockedModules";
import LockedModulePage from "./LockedModulePage";

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps routes to check if the current module is locked via hidden_apps.
 * If locked, shows the LockedModulePage instead of the actual content.
 */
const ModuleGuard = ({ children }: Props) => {
  const location = useLocation();
  const { isRouteLocked, getLockedModuleName } = useLockedModules();

  if (isRouteLocked(location.pathname)) {
    return <LockedModulePage moduleName={getLockedModuleName(location.pathname)} />;
  }

  return <>{children}</>;
};

export default ModuleGuard;
