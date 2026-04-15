import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, FileText, Receipt, Menu } from "lucide-react";
import { smartNavigate } from "@/lib/smartNavigate";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { icon: Receipt, label: "المعاملات", path: "/transactions" },
  { icon: Users, label: "الزبائن", path: "/contacts" },
  { icon: FileText, label: "الحسابات", path: "/accounts" },
  { icon: Menu, label: "القائمة", path: "/menu" },
  { icon: Home, label: "الرئيسية", path: "/apps" },
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
      <nav className="fixed bottom-2 left-2 right-2 z-40">
        <div className="max-w-md mx-auto bg-card rounded-2xl shadow-lg" style={{ border: "1px solid rgba(128,128,128,0.15)" }}>
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const isAI = item.path === "/smart-report";
              return (
                <button
                  key={item.path}
                  onClick={(e) => smartNavigate(e, item.path, navigate)}
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
