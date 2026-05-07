import { Home, Calendar, User, Bell, ClipboardList, FileText, CalendarDays } from "lucide-react";

type Tab = "home" | "history" | "requests" | "alerts" | "profile" | "scan" | "forms" | "schedule"
  | "manager-roster" | "manager-team" | "manager-attendance" | "manager-requests" | "manager-swaps";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "الرئيسية", icon: Home },
  { id: "schedule", label: "دوامي", icon: CalendarDays },
  { id: "forms", label: "النماذج", icon: ClipboardList },
  { id: "requests", label: "طلباتي", icon: FileText },
  { id: "history", label: "الحضور", icon: Calendar },
  { id: "alerts", label: "تنبيهات", icon: Bell },
  { id: "profile", label: "ملفي", icon: User },
];

interface Props {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  alertCount?: number;
}

export default function EmployeeBottomNav({ active, onNavigate, alertCount = 0 }: Props) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around h-[56px] max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive ? "bg-primary/10" : ""
              }`}
            >
              <div className="relative">
                <tab.icon
                  className={`h-5 w-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                {tab.id === "alerts" && alertCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                style={{ fontFamily: "Tajawal, sans-serif" }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}