import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { X } from "lucide-react";

const TrialBanner = () => {
  const navigate = useNavigate();
  const { subscription, loading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // During trial with >7 days, allow dismiss for 24h
    // During trial with <=7 days or expired, never dismiss (always show)
    if (subscription && subscription.isTrial && subscription.daysLeft <= 7) {
      setDismissed(false);
      return;
    }
    const dismissedAt = localStorage.getItem("trial_banner_dismissed");
    if (dismissedAt) {
      const diff = Date.now() - parseInt(dismissedAt);
      if (diff < 24 * 60 * 60 * 1000) setDismissed(true);
      else {
        localStorage.removeItem("trial_banner_dismissed");
        setDismissed(false);
      }
    }
  }, [subscription]);

  if (loading || !subscription || dismissed) return null;
  const { isTrial, daysLeft, isExpired, status } = subscription;
  if (status === "active" && !isTrial) return null;

  if (isTrial && daysLeft > 7) {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #0D1B2A, #1E3A5F)", fontFamily: "Tajawal" }} dir="rtl">
        <span>🎁 أنت في الفترة التجريبية المجانية — متبقي {daysLeft} يوماً</span>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/pricing")} className="px-4 py-1 rounded-full text-xs font-bold hover:brightness-110 transition-all" style={{ background: "#E8A020", color: "#0D1B2A" }}>
            اختر خطتك الآن
          </button>
          <button onClick={() => { setDismissed(true); localStorage.setItem("trial_banner_dismissed", String(Date.now())); }} className="text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isTrial && daysLeft > 0 && daysLeft <= 7) {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm border-b-2 border-amber-500 flex-shrink-0" style={{ background: "#FEF9C3", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-amber-800 font-medium">⏰ تنتهي تجربتك المجانية خلال {daysLeft} أيام! اشترك الآن للاستمرار بدون انقطاع</span>
        <button onClick={() => navigate("/pricing")} className="bg-amber-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-amber-600">اشترك الآن</button>
      </div>
    );
  }

  if (isExpired || status === "expired") {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-3 text-sm border-b-2 border-red-500 animate-pulse flex-shrink-0" style={{ background: "#FEE2E2", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-red-800 font-bold">❌ انتهت فترتك التجريبية — اشترك لاستعادة الوصول الكامل</span>
        <button onClick={() => navigate("/pricing")} className="bg-red-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-red-600">اشترك الآن</button>
      </div>
    );
  }

  if (status === "past_due" || status === "grace" || status === "grace_period") {
    return (
      <div className="z-40 flex items-center justify-between px-6 py-2.5 text-sm border-b-2 border-orange-500 flex-shrink-0" style={{ background: "#FFF7ED", fontFamily: "Tajawal" }} dir="rtl">
        <span className="text-orange-800 font-medium">⚠️ يوجد دفع متأخر — يرجى تحديث طريقة الدفع</span>
        <button onClick={() => navigate("/subscription")} className="bg-orange-500 text-white px-4 py-1 rounded-full text-xs font-bold hover:bg-orange-600">تحديث الدفع</button>
      </div>
    );
  }

  return null;
};

export default TrialBanner;
