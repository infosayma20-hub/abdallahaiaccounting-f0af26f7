import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Phase = "loading" | "success";

interface TransactionToastProps {
  show: boolean;
  onDone?: () => void;
  loadingText?: string;
  successText?: string;
  subtitleText?: string;
}

const AnimatedCheckmark = () => (
  <motion.svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
  >
    <motion.rect
      x="2"
      y="2"
      width="20"
      height="20"
      rx="4"
      className="fill-primary"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    />
    <motion.path
      d="M7 12.5L10.5 16L17 8"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
    />
  </motion.svg>
);

const LoadingDots = () => (
  <div className="flex items-center gap-1">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-primary"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
      />
    ))}
  </div>
);

const TransactionToast = ({
  show,
  onDone,
  loadingText = "جارٍ تحليل العملية…",
  successText = "تم تسجيل الحركة بنجاح",
  subtitleText = "⚡ جاري تحديث وضعك المالي",
}: TransactionToastProps) => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setPhase("loading");
      setVisible(false);
      return;
    }

    setVisible(true);
    setPhase("loading");

    const successTimer = setTimeout(() => setPhase("success"), 500);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 3200);

    return () => {
      clearTimeout(successTimer);
      clearTimeout(hideTimer);
    };
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-6 left-1/2 z-[200]"
          initial={{ opacity: 0, y: -30, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -20, x: "-50%" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <div className="bg-card border border-border rounded-2xl px-5 py-3.5 shadow-2xl min-w-[260px] max-w-[340px]"
               style={{ boxShadow: "0 8px 32px hsl(var(--primary) / 0.15), 0 2px 8px rgba(0,0,0,0.2)" }}>
            <div className="flex items-center gap-3" dir="rtl">
              {/* Icon area */}
              <div className="flex-shrink-0">
                <AnimatePresence mode="wait">
                  {phase === "loading" ? (
                    <motion.div
                      key="loading"
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <LoadingDots />
                    </motion.div>
                  ) : (
                    <motion.div key="check">
                      <AnimatedCheckmark />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text area */}
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  {phase === "loading" ? (
                    <motion.p
                      key="loading-text"
                      className="text-sm font-medium text-foreground"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {loadingText}
                    </motion.p>
                  ) : (
                    <motion.div
                      key="success-text"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="text-sm font-semibold text-foreground">{successText}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{subtitleText}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Progress bar */}
            {phase === "success" && (
              <motion.div
                className="mt-2.5 h-[2px] rounded-full bg-muted overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 2.5, ease: "linear" }}
                />
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TransactionToast;

// Helper hook
export const useTransactionToast = () => {
  const [show, setShow] = useState(false);
  const trigger = () => setShow(true);
  const handleDone = () => setShow(false);
  return { show, trigger, handleDone };
};
