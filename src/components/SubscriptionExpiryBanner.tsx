import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { X, Clock, AlertTriangle, AlertCircle, XCircle } from "lucide-react";

const DISMISS_KEY = "sub_banner_dismissed_at";

export default function SubscriptionExpiryBanner() {
  const navigate = useNavigate();
  const { subscription, loading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (ts && Date.now() - parseInt(ts) < 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    } catch {}
  }, []);

  if (loading || !subscription) return null;

  const { daysLeft, isExpired, isTrial, billing_cycle, plan_name_ar, current_period_end, status } = subscription;

  // Don't show if more than 7 days left and not expired
  if (daysLeft > 7 && !isExpired) return null;
  if (status === "cancelled") return null;

  const planLabel = isTrial
    ? "فترة التجربة"
    : billing_cycle === "annual" ? "حزمتك السنوية" : "حزمتك الشهرية";

  const expiryDate = new Date(current_period_end).toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  // Variant D — Expired
  if (isExpired || status === "expired") {
    return (
      <div
        className="w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: "linear-gradient(135deg, hsl(0 72% 10%), hsl(0 60% 25%))",
          borderBottom: "2px solid hsl(0 72% 40%)",
          color: "white",
        }}
        dir="rtl"
      >
        <div className="flex items-center gap-3 min-w-0">
          <XCircle className="h-5 w-5 flex-shrink-0 text-red-300" />
          <div className="min-w-0">
            <p className="text-sm font-bold">❌ انتهى اشتراكك — بعض الميزات محدودة</p>
            <p className="text-[11px] opacity-70 mt-0.5">جدد اشتراكك للوصول الكامل لجميع الميزات</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="px-5 py-2 rounded-lg text-[13px] font-bold transition-all hover:opacity-90 flex-shrink-0"
          style={{ background: "hsl(43 56% 54%)", color: "hsl(215 78% 15%)" }}
        >
          جدد الاشتراك الآن
        </button>
      </div>
    );
  }

  // Variant C — 1 day
  if (daysLeft <= 1) {
    return (
      <div
        className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap animate-pulse-subtle"
        style={{
          background: "linear-gradient(135deg, hsl(0 84% 95%), hsl(0 84% 88%))",
          borderBottom: "2px solid hsl(0 72% 51%)",
        }}
        dir="rtl"
      >
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: "hsl(0 72% 51%)" }} />
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "hsl(0 72% 25%)" }}>
              🚨 {isTrial ? "تنتهي فترة التجربة غداً!" : "ينتهي اشتراكك غداً!"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "hsl(0 50% 35%)" }}>
              جدد فوراً لضمان استمرارية عملك
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate("/support")}
            className="px-4 py-2 rounded-lg text-[12px] font-medium border transition-all hover:opacity-80"
            style={{ borderColor: "hsl(0 50% 50%)", color: "hsl(0 50% 35%)" }}
          >
            تواصل معنا
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="px-5 py-2 rounded-lg text-[13px] font-bold text-white transition-all hover:opacity-90"
            style={{ background: "hsl(0 72% 51%)" }}
          >
            جدد الآن
          </button>
        </div>
      </div>
    );
  }

  // Variant B — 3 days
  if (daysLeft <= 3) {
    return (
      <div
        className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: "linear-gradient(135deg, hsl(30 97% 80%), hsl(30 95% 72%))",
          borderBottom: "2px solid hsl(21 90% 48%)",
        }}
        dir="rtl"
      >
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: "hsl(21 90% 35%)" }} />
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "hsl(21 80% 20%)" }}>
              ⚠️ {isTrial ? `تنتهي فترة التجربة خلال ${daysLeft} أيام فقط!` : `تنتهي ${planLabel} خلال ${daysLeft} أيام فقط!`}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "hsl(21 60% 30%)" }}>
              جدد الآن لتجنب انقطاع الخدمة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <DaysCounter days={daysLeft} />
          <button
            onClick={() => navigate("/settings")}
            className="px-5 py-2 rounded-lg text-[13px] font-bold text-white transition-all hover:opacity-90"
            style={{ background: "hsl(21 90% 48%)" }}
          >
            تجديد الاشتراك
          </button>
        </div>
      </div>
    );
  }

  // Variant A — 7 days (dismissible)
  if (dismissed) return null;

  return (
    <div
      className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
      style={{
        background: "linear-gradient(135deg, hsl(55 92% 90%), hsl(48 96% 89%))",
        borderBottom: "2px solid hsl(38 92% 50%)",
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Clock className="h-5 w-5 flex-shrink-0" style={{ color: "hsl(38 92% 40%)" }} />
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "hsl(38 80% 20%)" }}>
            ⏰ {isTrial
              ? `تنتهي فترة التجربة خلال ${daysLeft} أيام`
              : `تنتهي ${planLabel} خلال ${daysLeft} أيام`}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "hsl(38 50% 30%)" }}>
            تاريخ الانتهاء: {expiryDate}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <DaysCounter days={daysLeft} />
        <button
          onClick={() => navigate("/settings")}
          className="px-5 py-2 rounded-lg text-[13px] font-bold text-white transition-all hover:opacity-90"
          style={{ background: "hsl(38 92% 50%)" }}
        >
          تجديد الاشتراك
        </button>
        <button
          onClick={handleDismiss}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-medium transition-all hover:opacity-70"
          style={{ color: "hsl(38 50% 30%)" }}
        >
          لاحقاً
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DaysCounter({ days }: { days: number }) {
  const d = Math.floor(days);
  const h = Math.floor((days % 1) * 24);
  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <DayBox value={d} label="يوم" />
      <span className="text-lg font-bold opacity-30">:</span>
      <DayBox value={h || 0} label="ساعة" />
    </div>
  );
}

function DayBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-md px-2.5 py-1" style={{ background: "rgba(0,0,0,0.08)" }}>
      <span className="text-base font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace" }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[8px] font-medium opacity-60">{label}</span>
    </div>
  );
}
