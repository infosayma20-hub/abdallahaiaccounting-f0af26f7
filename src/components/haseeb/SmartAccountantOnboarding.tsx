import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import OnboardingStep1 from "./onboarding/OnboardingStep1";
import OnboardingStep2 from "./onboarding/OnboardingStep2";
import OnboardingStep3 from "./onboarding/OnboardingStep3";

interface Props {
  userName: string;
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 3;

const SmartAccountantOnboarding = ({ userName, onComplete, onSkip }: Props) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  const goNext = () => {
    setDirection(1);
    setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const goBack = () => {
    setDirection(-1);
    setStep(s => Math.max(s - 1, 0));
  };

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background overflow-y-auto" dir="rtl">
      {/* Progress bar */}
      <div className="relative h-1 bg-muted">
        <motion.div
          className="absolute inset-y-0 right-0 rounded-full bg-primary"
          animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Skip button */}
        <button
          onClick={onSkip}
          className="text-xs px-3 py-1.5 rounded-full transition-all hover:bg-muted text-muted-foreground border border-border"
        >
          تخطّي
        </button>

        {/* Dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              className="h-2 rounded-full transition-colors"
              style={{ background: i <= step ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
              animate={{ width: i === step ? 24 : 8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          ))}
        </div>

        {/* Step indicator */}
        <span className="text-[11px] text-muted-foreground min-w-[40px] text-left">
          {step + 1}/{TOTAL_STEPS}
        </span>
      </div>

      {/* Content with slide transitions */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            {step === 0 && <OnboardingStep1 userName={userName} onNext={goNext} />}
            {step === 1 && <OnboardingStep2 onNext={goNext} onBack={goBack} />}
            {step === 2 && <OnboardingStep3 onComplete={onComplete} onBack={goBack} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SmartAccountantOnboarding;
