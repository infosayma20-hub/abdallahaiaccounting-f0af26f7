import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const [transitioning, setTransitioning] = useState(false);

  const currentStep = tourSteps[step];

  const measureElement = useCallback(() => {
    if (!active || !currentStep) return;
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      // scrollIntoView first, then measure after scroll settles
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      // Wait for scroll to settle before measuring
      const measure = () => {
        const r = el.getBoundingClientRect();
        const padding = 8;
        // Use viewport-relative coords (no scrollY) since container is fixed
        setRect({
          top: r.top - padding,
          left: r.left - padding,
          width: r.width + padding * 2,
          height: r.height + padding * 2,
        });
      };

      // Measure immediately, then again after scroll settles
      measure();
      const timer = setTimeout(measure, 450);
      return () => clearTimeout(timer);
    }
  }, [active, currentStep]);

  useEffect(() => {
    const cleanup = measureElement();
    window.addEventListener("resize", measureElement);
    window.addEventListener("scroll", measureElement, { passive: true });
    return () => {
      cleanup?.();
      window.removeEventListener("resize", measureElement);
      window.removeEventListener("scroll", measureElement);
    };
  }, [measureElement, step]);

  const handleNext = () => {
    if (step < tourSteps.length - 1) {
      setTransitioning(true);
      setTimeout(() => {
        setStep(step + 1);
        setTransitioning(false);
      }, 100);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setTransitioning(true);
      setTimeout(() => {
        setStep(step - 1);
        setTransitioning(false);
      }, 100);
    }
  };

  if (!active || !rect) return null;

  // Tooltip positioning — prefer below, switch to above if no space
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const tooltipHeight = 280;
  const showAbove = spaceBelow < tooltipHeight && spaceAbove > tooltipHeight;

  const tooltipTop = showAbove
    ? rect.top - tooltipHeight - 12
    : rect.top + rect.height + 12;

  // Horizontally: try to center on the element, clamp to viewport
  const tooltipWidth = 380;
  const elementCenter = rect.left + rect.width / 2;
  const tooltipLeft = Math.min(
    Math.max(elementCenter - tooltipWidth / 2, 16),
    window.innerWidth - tooltipWidth - 16
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200]" dir="rtl">
        {/* SVG overlay with spotlight cutout — fixed to viewport */}
        <svg className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 200 }}>
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
                transition={{ duration: 0.35, ease: "easeInOut" }}
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
            fill="rgba(0,0,0,0.7)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Click blocker (let clicks through the spotlight hole) */}
        <div
          className="fixed inset-0"
          style={{ zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* Spotlight border glow */}
        <motion.div
          animate={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="fixed rounded-2xl border-2 border-primary/40 shadow-[0_0_24px_rgba(34,197,94,0.15)] pointer-events-none"
          style={{ zIndex: 201 }}
        />

        {/* Tooltip card */}
        <AnimatePresence mode="wait">
          {!transitioning && (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: showAbove ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: showAbove ? -8 : 8 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="fixed w-[380px] max-w-[calc(100vw-32px)]"
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
                {currentStep.tip && (
                  <p className="text-xs text-primary/80 mb-4">{currentStep.tip}</p>
                )}

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
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>
  );
};

export default SpotlightTour;
