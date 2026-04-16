import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { X } from "lucide-react";

const LS_KEY = "trial_banner_last_shown";
const LS_DISMISS_KEY = "trial_banner_dismissed_at";
const SS_KEY = "trial_banner_shown_this_session";

function getDaysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shouldShow(daysLeft: number): boolean {
  const lastShown = localStorage.getItem(LS_KEY);
  const daysSince = getDaysSince(lastShown);
  const dismissed = localStorage.getItem(LS_DISMISS_KEY);
  const dismissedSince = getDaysSince(dismissed);

  if (daysLeft < 7) return true;

  if (daysLeft >= 7 && daysLeft < 30) {
    // Check if dismissed this session
    if (sessionStorage.getItem(SS_KEY) === "dismissed") return false;
    return true;
  }

  if (daysLeft >= 30 && daysLeft <= 60) {
    // Show if dismissed more than 1 day ago or never dismissed
    if (dismissedSince !== null && dismissedSince < 1) return false;
    if (daysSince !== null && daysSince < 1) return false;
    return true;
  }

  // daysLeft > 60
  if (dismissedSince !== null && dismissedSince < 7) return false;
  if (daysSince !== null && daysSince < 7) return false;
  return true;
}

function getAutoDismissMs(daysLeft: number): number | null {
  if (daysLeft < 7) return null;
  if (daysLeft >= 7 && daysLeft < 30) return 15000;
  if (daysLeft >= 30 && daysLeft <= 60) return 10000;
  return 8000; // > 60
}

const TrialBanner = () => {
  const navigate = useNavigate();
  const { subscription, loading } = useSubscription();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const daysLeft = subscription?.daysLeft ?? 999;
  const isTrial = subscription?.isTrial ?? false;
  const status = subscription?.status ?? "";
  const isExpired = subscription?.isExpired ?? false;

  // Determine visibility on mount / subscription change
  useEffect(() => {
    if (loading || !subscription) return;
    if (!isTrial && status === "active") { setVisible(false); return; }
    if (!isTrial) { setVisible(false); return; }
    if (isExpired || status === "expired") { setVisible(true); setMounted(true); return; }

    const show = shouldShow(daysLeft);
    if (show) {
      localStorage.setItem(LS_KEY, todayISO());
      if (daysLeft >= 7 && daysLeft < 30) {
        sessionStorage.setItem(SS_KEY, "shown");
      }
    }
    setVisible(show);
    setMounted(true);
  }, [loading, subscription, daysLeft, isTrial, status, isExpired]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible || !isTrial) return;
    const ms = getAutoDismissMs(daysLeft);
    if (!ms) return;
    const timer = setTimeout(() => {
      setVisible(false);
      localStorage.setItem(LS_DISMISS_KEY, todayISO());
      if (daysLeft >= 7 && daysLeft < 30) {
        sessionStorage.setItem(SS_KEY, "dismissed");
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [visible, daysLeft, isTrial]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(LS_DISMISS_KEY, todayISO());
    localStorage.setItem(LS_KEY, todayISO());
    if (daysLeft >= 7 && daysLeft < 30) {
      sessionStorage.setItem(SS_KEY, "dismissed");
    }
  }, [daysLeft]);

  if (loading || !visible || !mounted) return null;

  // Expired state
  if (isExpired || status === "expired") {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-3 text-sm border-b-2 border-red-500 animate-pulse flex-shrink-0" style={{ background: "#FEE2E2", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-red-800 font-bold">❌ انتهت فترتك التجريبية — اشترك لاستعادة الوصول الكامل</span>
        <button onClick={() => navigate("/pricing")} className="bg-red-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-red-600">اشترك الآن</button>
      </div>
    );
  }

  // Past due / grace
  if (status === "past_due" || status === "grace" || status === "grace_period") {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm border-b-2 border-orange-500 flex-shrink-0" style={{ background: "#FFF7ED", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-orange-800 font-medium">⚠️ يوجد دفع متأخر — يرجى تحديث طريقة الدفع</span>
        <button onClick={() => navigate("/subscription")} className="bg-orange-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-orange-600">تحديث الدفع</button>
      </div>
    );
  }

  // Critical: ≤ 4 days (day 10 of trial onwards)
  if (isTrial && daysLeft <= 4 && daysLeft > 0) {
    const isUrgent = daysLeft <= 2;
    return (
      <div
        className={`z-40 flex items-center justify-between px-6 py-2.5 text-sm border-b-2 flex-shrink-0 ${isUrgent ? "animate-pulse" : ""}`}
        style={{
          background: isUrgent ? "#FEE2E2" : "#FFEDD5",
          borderColor: isUrgent ? "#DC2626" : "#F97316",
          fontFamily: "Tajawal",
        }}
        dir="rtl"
      >
        <span className={isUrgent ? "text-red-800 font-bold" : "text-orange-800 font-bold"}>
          {isUrgent ? "🚨" : "⏰"} متبقي {daysLeft} {daysLeft === 1 ? "يوم" : "أيام"} على انتهاء تجربتك المجانية! اشترك الآن لحفظ بياناتك
        </span>
        <button
          onClick={() => navigate("/pricing")}
          className="text-white px-4 py-1 rounded-full text-xs font-bold hover:brightness-110 transition"
          style={{ background: isUrgent ? "#DC2626" : "#F97316" }}
        >
          اشترك الآن ←
        </button>
      </div>
    );
  }

  // Mid-trial: 5-7 days left
  if (isTrial && daysLeft <= 7 && daysLeft > 4) {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm border-b-2 border-amber-500 flex-shrink-0" style={{ background: "#FEF9C3", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-amber-800 font-medium">⏳ متبقي {daysLeft} أيام على انتهاء التجربة — اختر باقتك واستفد من الخصم السنوي</span>
        <button onClick={() => navigate("/pricing")} className="bg-amber-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-amber-600">اختر خطتك</button>
      </div>
    );
  }

  // Normal trial banner (>= 8 days)
  return (
    <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #0D1B2A, #1E3A5F)", fontFamily: "Tajawal" }} dir="rtl">
      <span>🎁 أنت في الفترة التجريبية المجانية — متبقي {daysLeft} يوماً (كل التطبيقات مفتوحة)</span>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/pricing")} className="px-4 py-1 rounded-full text-xs font-bold hover:brightness-110 transition-all" style={{ background: "#E8A020", color: "#0D1B2A" }}>
          اختر خطتك الآن
        </button>
        <button onClick={handleDismiss} className="text-white/60 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default TrialBanner;
