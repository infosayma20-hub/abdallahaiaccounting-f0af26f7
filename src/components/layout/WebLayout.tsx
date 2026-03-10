import { useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import HelpGuideModal from "../HelpGuideModal";
import SubscriptionExpiryBanner from "../SubscriptionExpiryBanner";
import TrialBanner from "../billing/TrialBanner";
import TrialExpiredGate from "../trial/TrialExpiredGate";

interface WebLayoutProps {
  children: React.ReactNode;
}

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

const WebLayout = ({ children }: WebLayoutProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const location = useLocation();

  // Use top-level path segment as key to avoid re-animating on query changes
  const routeKey = location.pathname.split("/").slice(0, 3).join("/");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl">
      {/* Sidebar */}
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
          onOpenHelpGuide={() => setShowHelpGuide(true)}
        />

        {/* Subscription / Trial Banners */}
        <TrialBanner />
        <SubscriptionExpiryBanner />

        {/* Content with smooth page transition */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
          <TrialExpiredGate>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={routeKey}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </TrialExpiredGate>
        </main>
      </div>

      {/* Help Guide Modal */}
      <HelpGuideModal
        open={showHelpGuide}
        onClose={() => setShowHelpGuide(false)}
        onFillInput={() => {}}
      />
    </div>
  );
};

export default WebLayout;
