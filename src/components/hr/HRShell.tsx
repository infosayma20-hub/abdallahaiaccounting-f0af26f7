import { ReactNode } from "react";
import HRTopNav from "./HRTopNav";

/**
 * Wraps any HR page with the unified top tabs bar.
 * Does not change RoleGuard / HRPermGuard composition — just adds the nav above.
 */
export function HRShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <HRTopNav />
      <div>{children}</div>
    </div>
  );
}

export default HRShell;
