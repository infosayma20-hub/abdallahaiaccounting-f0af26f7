import { Home, Calendar, Send, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "home" | "history" | "requests" | "alerts" | "profile" | "scan";

interface Props {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  alertCount?: number;
}

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "الرئيسية", icon: Home },
  { id: "history", label: "الحضور", icon: Calendar },
  { id: "requests", label: "الطلبات", icon: Send },
  { id: "profile", label: "ملفي", icon: User },
];

export default function EmployeeBottomNav({ active, onNavigate, alertCount = 0 }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all duration-200",
                isActive && "text-primary",
                !isActive && "text-muted-foreground"
              )}
            >
              <div className="relative">
                <tab.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              </div>
              <span className={cn("text-[10px] font-medium", isActive && "text-primary")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
