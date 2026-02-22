import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, FileText, Receipt, Sparkles } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { icon: Sparkles, label: "AI", path: "/smart-report" },
  { icon: Receipt, label: "المصروفات", path: "/transactions" },
  { icon: FileText, label: "الفواتير", path: "/invoices" },
  { icon: Users, label: "العملاء", path: "/contacts" },
  { icon: Home, label: "الرئيسية", path: "/" },
];

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-background relative">
      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Navigation - Premium Dark */}
      <nav className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-md mx-auto bg-card" style={{ borderTop: "1px solid rgba(128,128,128,0.1)" }}>
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const isAI = item.path === "/smart-report";
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 transition-all duration-200 ${
                    active ? "text-primary" : "text-muted-foreground"
                  } ${isAI && active ? "animate-pulse-glow" : ""}`}
                >
                  <item.icon className={`h-5 w-5 ${active ? "drop-shadow-[0_0_6px_hsl(152,72%,40%,0.6)]" : ""}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
