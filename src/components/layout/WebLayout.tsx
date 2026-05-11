import { useState } from "react";
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
import SessionManager from "../SessionManager";
import { useSubscription } from "@/hooks/useSubscription";
import { TabsProvider } from "@/contexts/TabsContext";

interface WebLayoutProps {
  children: React.ReactNode;
}

const WebLayout = ({ children }: WebLayoutProps) => {
  const { pathname } = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { subscription } = useSubscription();
  const isHRRoute = ["/hr", "/employees", "/employee-forms-management", "/hr-attendance", "/attendance/roster", "/manager/roster", "/leaves", "/loans", "/advances", "/hr-deductions", "/payroll", "/payroll-settings"].some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Show only ONE banner: TrialBanner for trial users, SubscriptionExpiryBanner for paid users
  const isTrial = subscription?.isTrial ?? false;

  return (
    <TabsProvider>
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Sidebar — always visible */}
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

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

      {/* Session timeout manager */}
      <SessionManager />

      {/* Noor Support Widget */}
      <NoorSupportWidget />
    </div>
    </TabsProvider>
  );
};

export default WebLayout;
