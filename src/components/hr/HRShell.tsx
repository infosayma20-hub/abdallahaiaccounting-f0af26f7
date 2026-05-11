import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import HRTopNav from "./HRTopNav";
import PayrollSubNav from "./PayrollSubNav";

/**
 * Wraps any HR page with the unified top tabs bar.
 * The nav stack is sticky to the top of the scrolling <main> region so it
 * stays visible while scrolling through long HR pages (attendance, roster…).
 * HR routes remove the outer <main> padding so the nav can be the first child
 * of the actual scroll container. Page padding is applied below the sticky nav,
 * which prevents the bar from floating over cards or covering page titles.
 */
export function HRShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const showPayrollNav =
    pathname === "/payroll" ||
    pathname.startsWith("/payroll/") ||
    pathname === "/payroll-settings";
  return (
    <>
      <div className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <HRTopNav />
        {showPayrollNav && <PayrollSubNav />}
      </div>
      <div className="p-5 lg:p-8">{children}</div>
    </>
  );
}

export default HRShell;
