import { useState } from "react";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import AppFooter from "./AppFooter";

import SubscriptionExpiryBanner from "../SubscriptionExpiryBanner";
import TrialBanner from "../billing/TrialBanner";
import TrialExpiredGate from "../trial/TrialExpiredGate";
import { GlobalNavigationLoader } from "../ui/GlobalNavigationLoader";
import SessionManager from "../SessionManager";

interface WebLayoutProps {
  children: React.ReactNode;
}

const WebLayout = ({ children }: WebLayoutProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  

  return (
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

        {/* Subscription / Trial Banners */}
        <TrialBanner />
        <SubscriptionExpiryBanner />

        {/* Content — no heavy page transitions */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
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
    </div>
  );
};

export default WebLayout;
