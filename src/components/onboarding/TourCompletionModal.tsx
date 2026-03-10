import { motion, AnimatePresence } from "framer-motion";
import { Settings, Brain, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface TourCompletionModalProps {
  open: boolean;
  onClose: () => void;
}

const TourCompletionModal = ({ open, onClose }: TourCompletionModalProps) => {
  const navigate = useNavigate();

  const suggestions = [
    { icon: Settings, label: "إعداد الشركة", path: "/settings", color: "text-muted-foreground" },
    { icon: Brain, label: "المحاسب الذكي", path: "/smart-accountant", color: "text-primary" },
    { icon: FileSpreadsheet, label: "استيراد بيانات", path: "/opening-balances-import", color: "text-cyan-500" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-2xl"
          >
            {/* Celebration */}
            <div className="flex justify-center mb-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6 }}
              >
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
              </motion.div>
            </div>

            <h2 className="text-xl font-bold text-foreground text-center mb-2">🎉 أنت جاهز!</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              تعرّفت على جميع تطبيقات النظام!
              <br />
              من أين تحب تبدأ؟
            </p>

            {/* Quick Start Suggestions */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {suggestions.map((s) => (
                <button
                  key={s.path}
                  onClick={() => { onClose(); navigate(s.path); }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <s.icon className={`h-6 w-6 ${s.color}`} />
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                </button>
              ))}
            </div>

            {/* Steps */}
            <div className="space-y-2 mb-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground text-xs">3 خطوات مقترحة للبداية:</p>
              <p>1. ⚙️ أعدّ بيانات شركتك في الإعدادات</p>
              <p>2. 📥 استورد أرصدتك الافتتاحية</p>
              <p>3. 🤖 جرّب المحاسب الذكي بأول قيد</p>
            </div>

            <Button onClick={onClose} className="w-full h-12 rounded-xl text-base gap-2">
              ابدأ الآن! 🚀
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TourCompletionModal;
