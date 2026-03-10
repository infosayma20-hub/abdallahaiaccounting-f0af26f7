import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

const TrialLastDayModal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { daysLeft, isTrial, isPaidActive } = useSubscriptionGuard();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ invoiceCount: 0, contactCount: 0, transactionCount: 0 });
  const { fetchUserDataCounts } = useSubscriptionGuard();

  useEffect(() => {
    if (!isTrial || daysLeft !== 1 || isPaidActive) return;
    const shown = localStorage.getItem("trial_lastday_shown");
    if (shown) {
      const diff = Date.now() - parseInt(shown);
      if (diff < 24 * 60 * 60 * 1000) return;
    }
    setOpen(true);
    if (user?.id) fetchUserDataCounts(user.id).then(setCounts);
  }, [daysLeft, isTrial, isPaidActive, user?.id, fetchUserDataCounts]);

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem("trial_lastday_shown", String(Date.now()));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.6)" }} dir="rtl">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="w-full max-w-[600px] text-center text-white" style={{ background: "linear-gradient(160deg, #0D1B2A, #08111A)", borderRadius: 24, padding: "40px 32px" }}>
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="text-[56px] mb-4">⏰</motion.div>
            <h2 className="text-[32px] font-extrabold mb-2" style={{ fontFamily: "Tajawal" }}>تجربتك المجانية تنتهي غداً!</h2>
            <p className="text-base mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>لا تفقد بياناتك وعملك الذي بنيته</p>
            <div className="rounded-2xl p-5 mb-6" style={{ background: "rgba(255,255,255,0.08)" }}>
              <p className="text-sm mb-3 font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>ما أنجزته حتى الآن:</p>
              <div className="grid grid-cols-3 gap-4">
                {[{ emoji: "📊", count: counts.invoiceCount, label: "فاتورة" }, { emoji: "👥", count: counts.contactCount, label: "عميل" }, { emoji: "💰", count: counts.transactionCount, label: "معاملة" }].map((d) => (
                  <div key={d.label} className="text-center"><div className="text-2xl mb-1">{d.emoji}</div><div className="text-xl font-bold">{d.count}</div><div className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{d.label}</div></div>
                ))}
              </div>
            </div>
            <p className="text-sm mb-6" style={{ color: "#FCD34D" }}>بعد انتهاء التجربة، لن تتمكن من إضافة بيانات جديدة</p>
            <button
              onClick={() => { handleDismiss(); navigate("/pricing"); }}
              className="w-full h-[52px] rounded-[14px] text-lg font-extrabold transition-all hover:brightness-110 hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg, #E8A020, #F4D170)", color: "#0D1B2A", fontFamily: "Tajawal", border: "none" }}
            >
              🚀 اشترك الآن واستمر بلا انقطاع
            </button>
            <button onClick={handleDismiss} className="mt-4 text-sm bg-transparent border-none cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>سأشترك لاحقاً</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TrialLastDayModal;
