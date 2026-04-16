import { useState } from "react";
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
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { TabsProvider } from "@/contexts/TabsContext";

interface WebLayoutProps {
  children: React.ReactNode;
}

const WebLayout = ({ children }: WebLayoutProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { subscription } = useSubscription();
  const { isTrialExpired } = useSubscriptionGuard();

  // Show only ONE banner: TrialBanner for trial users, SubscriptionExpiryBanner for paid users
  const isTrial = subscription?.isTrial ?? false;
  // Hide Noor support widget when trial has expired (no support after expiry)
  const showNoorWidget = !isTrialExpired;

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

      {/* Noor Support Widget — hidden for expired trials */}
      {showNoorWidget && <NoorSupportWidget />}
    </div>
    </TabsProvider>
  );
};

export default WebLayout;
