import { Home, QrCode, Calendar, AlertTriangle, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "home" | "scan" | "history" | "alerts" | "profile";

interface Props {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  alertCount?: number;
}

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "الرئيسية", icon: Home },
  { id: "history", label: "السجل", icon: Calendar },
  { id: "scan", label: "بصمة", icon: QrCode },
  { id: "alerts", label: "تنبيهات", icon: AlertTriangle },
  { id: "profile", label: "حسابي", icon: User },
];

export default function EmployeeBottomNav({ active, onNavigate, alertCount = 0 }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          const isScan = tab.id === "scan";
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 relative transition-all duration-200",
                isScan ? "w-16 -mt-5" : "flex-1 py-2",
                isActive && !isScan && "text-primary",
                !isActive && !isScan && "text-muted-foreground"
              )}
            >
              {isScan ? (
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-primary/30"
                    : "bg-secondary text-muted-foreground"
                )}>
                  <tab.icon className="h-6 w-6" />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <tab.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                    {tab.id === "alerts" && alertCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 bg-destructive text-destructive-foreground rounded-full text-[10px] font-bold flex items-center justify-center">
                        {alertCount}
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-medium", isActive && "text-primary")}>
                    {tab.label}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
