import { useState } from "react";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";

import HelpGuideModal from "../HelpGuideModal";

interface WebLayoutProps {
  children: React.ReactNode;
}

const WebLayout = ({ children }: WebLayoutProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);

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

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
          {children}
        </main>
      </div>


      {/* Help Guide Modal - accessible from any page */}
      <HelpGuideModal
        open={showHelpGuide}
        onClose={() => setShowHelpGuide(false)}
        onFillInput={() => {}}
      />
    </div>
  );
};

export default WebLayout;
