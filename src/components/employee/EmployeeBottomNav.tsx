import { Home, Calendar, Send, User, Bell } from "lucide-react";
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
  { id: "alerts", label: "الإشعارات", icon: Bell },
  { id: "profile", label: "ملفي", icon: User },
];

export default function EmployeeBottomNav({ active, onNavigate, alertCount = 0 }: Props) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t safe-area-bottom"
      style={{
        background: "#FFFFFF",
        borderColor: "#E2E8F0",
        height: 60,
      }}
    >
      <div className="flex items-center justify-around h-full max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all duration-150"
            >
              <div className="relative">
                <tab.icon
                  className="h-5 w-5"
                  style={{ color: isActive ? "#00B4D8" : "#8B9BB4" }}
                />
                {tab.id === "alerts" && alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white text-[8px] flex items-center justify-center font-bold">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-medium"
                style={{
                  color: isActive ? "#00B4D8" : "#8B9BB4",
                  fontFamily: "Tajawal, sans-serif",
                }}
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
