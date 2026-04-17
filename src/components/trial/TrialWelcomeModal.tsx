import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { Sparkles, CheckCircle2, X } from "lucide-react";

const LS_KEY = "trial_welcome_shown";

const TrialWelcomeModal = () => {
  const { user } = useAuth();
  const { isTrial, daysLeft, isPaidActive } = useSubscriptionGuard();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || !isTrial || isPaidActive) return;
    const key = `${LS_KEY}_${user.id}`;
    if (localStorage.getItem(key)) return;
    // Mark as shown immediately to prevent re-show across tabs/sessions
    localStorage.setItem(key, "1");
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [user?.id, isTrial, isPaidActive]);

  const close = () => {
    setOpen(false);
    if (user?.id) localStorage.setItem(`${LS_KEY}_${user.id}`, "1");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9997] flex items-center justify-center p-4"
          style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.55)" }}
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="w-full max-w-[540px] overflow-hidden relative"
            style={{ borderRadius: 28, boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
          >
            <button
              onClick={close}
              className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="text-center px-8 pt-10 pb-7" style={{ background: "linear-gradient(135deg, #0D1B2A, #1E3A5F)" }}>
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                className="text-[64px] mb-3 inline-block"
              >
                🎉
              </motion.div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="h-4 w-4" style={{ color: "#E8A020" }} />
                <span className="text-xs font-bold tracking-widest" style={{ color: "#E8A020", fontFamily: "Montserrat" }}>
                  AMWALI
                </span>
                <Sparkles className="h-4 w-4" style={{ color: "#E8A020" }} />
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-2" style={{ fontFamily: "Tajawal" }}>
                أهلاً وسهلاً بك في أموالي!
              </h2>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                لديك <span className="font-bold" style={{ color: "#FCD34D" }}>14 يوماً</span> تجربة كاملة — كل التطبيقات مفتوحة
              </p>
            </div>

            {/* Body */}
            <div className="bg-white px-8 py-6">
              <p className="text-sm font-bold mb-4" style={{ color: "#0D1B2A", fontFamily: "Tajawal" }}>
                خلال هذه الفترة بتقدر تجرب كل شي:
              </p>
              <div className="space-y-2.5 mb-6">
                {[
                  "محاسبة كاملة + قيود يومية + تقارير ذكية",
                  "نقطة بيع POS + إدارة مخزون متقدمة",
                  "موارد بشرية + رواتب + حضور",
                  "المحاسب الذكي حسيب — بلا حدود",
                  "بياناتك محفوظة بأمان حتى بعد التجربة",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: "#374151" }}>
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#059669" }} />
                    <span style={{ fontFamily: "Tajawal" }}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={close}
                className="w-full h-[50px] rounded-[14px] text-[16px] font-extrabold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #E8A020, #F45E0C)",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(232,160,32,0.35)",
                  fontFamily: "Tajawal",
                }}
              >
                يلا نبدأ! 🚀
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TrialWelcomeModal;
