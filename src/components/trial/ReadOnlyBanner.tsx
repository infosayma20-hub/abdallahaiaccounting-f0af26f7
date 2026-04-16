import { useNavigate } from "react-router-dom";
import { Lock, AlertTriangle } from "lucide-react";

const ReadOnlyBanner = () => {
  const navigate = useNavigate();

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 text-white shadow-lg"
      style={{
        background: "linear-gradient(90deg, #B91C1C, #DC2626, #B91C1C)",
        fontFamily: "Tajawal",
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 animate-pulse" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
          <span className="text-xs sm:text-sm font-bold truncate">
            انتهى اشتراكك — بعض الميزات محدودة
          </span>
          <span className="text-[11px] sm:text-xs opacity-90 truncate hidden sm:inline">
            جدد اشتراكك للوصول الكامل لجميع الميزات
          </span>
        </div>
      </div>
      <button
        onClick={() => navigate("/billing?reason=trial_expired")}
        className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all hover:brightness-110 hover:scale-105 flex-shrink-0 shadow-md"
        style={{
          background: "linear-gradient(135deg, #FBBF24, #F59E0B)",
          color: "#1F2937",
          border: "none",
        }}
      >
        <Lock className="h-3 w-3" />
        جدد الاشتراك الآن
      </button>
    </div>
  );
};

export default ReadOnlyBanner;
