import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tourSteps } from "./tourSteps";

interface SpotlightTourProps {
  active: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SpotlightTour = ({ active, onComplete, onSkip }: SpotlightTourProps) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const currentStep = tourSteps[step];

  const updateRect = useCallback(() => {
    if (!active || !currentStep) return;
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const r = el.getBoundingClientRect();
      const padding = 8;
      setRect({
        top: r.top - padding + window.scrollY,
        left: r.left - padding,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active, currentStep]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect, step]);

  const handleNext = () => {
    if (step < tourSteps.length - 1) setStep(step + 1);
    else onComplete();
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!active || !rect) return null;

  // Tooltip positioning — show above if near bottom of viewport
  const viewportRect = {
    top: rect.top - window.scrollY,
    bottom: rect.top - window.scrollY + rect.height,
  };
  const spaceBelow = window.innerHeight - viewportRect.bottom;
  const showAbove = spaceBelow < 280;
  const tooltipTop = showAbove
    ? rect.top - 280
    : rect.top + rect.height + 16;
  const tooltipLeft = Math.min(Math.max(rect.left, 16), window.innerWidth - 396);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200]" dir="rtl" ref={overlayRef}>
        {/* SVG overlay with spotlight hole */}
        <svg className="absolute inset-0 w-full h-full" style={{ minHeight: document.documentElement.scrollHeight }}>
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <motion.rect
                animate={{
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                rx="16"
                ry="16"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0" y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.75)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight border glow */}
        <motion.div
          animate={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="absolute rounded-2xl border-2 border-primary/40 shadow-[0_0_30px_rgba(34,197,94,0.2)] pointer-events-none"
          style={{ zIndex: 201 }}
        />

        {/* Tooltip */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          className="absolute w-[380px] max-w-[calc(100vw-32px)]"
          style={{ top: tooltipTop, left: tooltipLeft, zIndex: 202 }}
        >
          <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span className="text-lg">{currentStep.icon}</span>
                {currentStep.title}
              </h3>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                {step + 1} من {tourSteps.length}
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line mb-2">
              {currentStep.description}
            </p>

            {/* Tip */}
            <p className="text-xs text-primary/80 mb-4">{currentStep.tip}</p>

            {/* Progress bar */}
            <div className="w-full h-1 bg-muted rounded-full mb-4">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${((step + 1) / tourSteps.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {step < tourSteps.length - 1 ? (
                <Button onClick={handleNext} size="sm" className="flex-1 gap-1 rounded-xl">
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={onComplete} size="sm" className="flex-1 gap-1 rounded-xl">
                  إنهاء الجولة ✅
                </Button>
              )}
              {step > 0 && (
                <Button onClick={handlePrev} variant="outline" size="sm" className="gap-1 rounded-xl">
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </Button>
              )}
              <button
                onClick={onSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mr-auto"
              >
                تخطي
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SpotlightTour;
