import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import AppFooter from "./AppFooter";
import NoorSupportWidget from "../NoorSupportWidget";
import TabBar from "./TabBar";

import SubscriptionExpiryBanner from "../SubscriptionExpiryBanner";
import TrialBanner from "../billing/TrialBanner";
import TrialExpiredGate from "../trial/TrialExpiredGate";
import { GlobalNavigationLoader } from "../ui/GlobalNavigationLoader";
// NOTE: SessionManager was removed in favour of the global <IdleLogoutGuard />
// mounted in App.tsx. Idle-logout is now app-wide (not WebLayout-only) and
// is driven by company-level policy via get_effective_session_policy.
import { useSubscription } from "@/hooks/useSubscription";
import { TabsProvider } from "@/contexts/TabsContext";

interface WebLayoutProps {
  children: React.ReactNode;
}

const AUTO_COLLAPSE_MS = 5000;

const WebLayout = ({ children }: WebLayoutProps) => {
  const { pathname } = useLocation();
  // Sidebar starts collapsed and auto-collapses 5s after being expanded
  // (desktop only). Hovering the sidebar keeps it open.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoCollapse = () => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  };
  const scheduleAutoCollapse = () => {
    clearAutoCollapse();
    // Skip on small screens — mobile uses the off-canvas drawer
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    autoCollapseTimer.current = setTimeout(() => {
      setSidebarCollapsed(true);
    }, AUTO_COLLAPSE_MS);
  };

  // Start/refresh the timer whenever the sidebar becomes expanded
  useEffect(() => {
    if (!sidebarCollapsed) scheduleAutoCollapse();
    else clearAutoCollapse();
    return clearAutoCollapse;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed]);
  const { subscription } = useSubscription();
  const isHRRoute = ["/hr", "/employees", "/employee-forms-management", "/hr-attendance", "/attendance/roster", "/manager/roster", "/manager/forms-inbox", "/leaves", "/loans", "/advances", "/hr-deductions", "/payroll", "/payroll-settings"].some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Show only ONE banner: TrialBanner for trial users, SubscriptionExpiryBanner for paid users
  const isTrial = subscription?.isTrial ?? false;

  return (
    <TabsProvider>
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Sidebar — always visible. Auto-collapses 5s after expand */}
      <div
        onMouseEnter={clearAutoCollapse}
        onMouseMove={clearAutoCollapse}
        onWheel={clearAutoCollapse}
        onScroll={clearAutoCollapse}
        onTouchStart={clearAutoCollapse}
        onTouchMove={clearAutoCollapse}
        onMouseLeave={() => { if (!sidebarCollapsed) scheduleAutoCollapse(); }}
        className="flex"
      >
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar
          onMenuClick={() => setMobileSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onOpenHelpGuide={() => {}}
        />

        {/* Tab bar */}
        <TabBar />

        {/* Single subscription/trial banner — never both */}
        {isTrial ? <TrialBanner /> : <SubscriptionExpiryBanner />}

        {/* Content — no heavy page transitions */}
        <main className={isHRRoute ? "flex-1 overflow-y-auto" : "flex-1 overflow-y-auto p-5 lg:p-8"}>
          <TrialExpiredGate>
            {children}
          </TrialExpiredGate>
          <AppFooter />
        </main>
      </div>

      {/* Lightweight navigation loader */}
      <GlobalNavigationLoader />

      {/* Noor Support Widget */}
      <NoorSupportWidget />
    </div>
    </TabsProvider>
  );
};

export default WebLayout;
