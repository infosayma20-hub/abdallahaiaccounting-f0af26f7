import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import HRTopNav from "./HRTopNav";
import PayrollSubNav from "./PayrollSubNav";

/**
 * Wraps any HR page with the unified top tabs bar.
 * Does not change RoleGuard / HRPermGuard composition — just adds the nav above.
 */
export function HRShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const showPayrollNav =
    pathname === "/payroll" ||
    pathname.startsWith("/payroll/") ||
    pathname === "/payroll-settings";
  return (
    <div className="min-h-full">
      <HRTopNav />
      {showPayrollNav && <PayrollSubNav />}
      <div>{children}</div>
    </div>
  );
}

export default HRShell;
