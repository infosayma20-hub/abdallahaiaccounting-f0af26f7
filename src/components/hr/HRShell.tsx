import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import HRTopNav from "./HRTopNav";
import PayrollSubNav from "./PayrollSubNav";

/**
 * Wraps any HR page with the unified top tabs bar.
 * The nav stack is sticky to the top of the scrolling <main> region so it
 * stays visible while scrolling through long HR pages (attendance, roster…).
 * The page <main> uses its own padding (p-5 lg:p-8) which we counteract via
 * negative margins so the sticky bar sits flush at the very top of the
 * scroll viewport, exactly under the global TopBar/TabBar (which live
 * outside the scroll area).
 */
export function HRShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const showPayrollNav =
    pathname === "/payroll" ||
    pathname.startsWith("/payroll/") ||
    pathname === "/payroll-settings";
  return (
    <>
      <div
        className="sticky top-0 z-40 -mx-5 lg:-mx-8 -mt-5 lg:-mt-8 mb-4 bg-card border-b border-border shadow-sm"
      >
        <HRTopNav />
        {showPayrollNav && <PayrollSubNav />}
      </div>
      <div>{children}</div>
    </>
  );
}

export default HRShell;
