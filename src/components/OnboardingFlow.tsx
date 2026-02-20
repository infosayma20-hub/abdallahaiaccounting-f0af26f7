import { useState, useEffect, useCallback } from "react";
import { MessageSquareText, BarChart3, Sparkles, ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingFlowProps {
  onComplete: () => void;
  onFocusInput: () => void;
}

// ─── Step 1: Welcome ────────────────────────────────
const WelcomeStep = ({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) => (
  <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-between px-6 py-16 animate-in fade-in duration-500" dir="rtl">
    <div className="flex-1 flex flex-col items-center justify-center text-center max-w-xs">
      <div className="text-6xl mb-6">👋</div>
      <h1 className="text-3xl font-bold text-foreground leading-tight mb-3">مرحباً بك</h1>
      <p className="text-base text-muted-foreground leading-relaxed">
        خلينا نضبط حساباتك
        <br />
        خلال دقيقة واحدة
      </p>
    </div>
    <div className="w-full max-w-sm space-y-3">
      <Button onClick={onStart} className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg shadow-primary/20">
        ابدأ الآن
      </Button>
      <button onClick={onSkip} className="w-full py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
        استكشف لاحقاً
      </button>
    </div>
  </div>
);

// ─── Step 2: Value Slides ───────────────────────────
const slides = [
  {
    icon: MessageSquareText,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "سجل معاملاتك بالكلام",
    description: "اكتب أو تحدث وسنقوم بتحويل كلامك\nإلى قيد محاسبي تلقائياً.",
  },
  {
    icon: BarChart3,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    title: "تابع أرباحك لحظياً",
    description: "شاهد الرصيد، الأرباح والخسائر\nبدون تعقيد.",
  },
];

const ValueSlides = ({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) => {
  const [current, setCurrent] = useState(0);

  const handleNext = () => {
    if (current < slides.length - 1) {
      setCurrent(current + 1);
    } else {
      onNext();
    }
  };

  const slide = slides[current];

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-between px-6 py-16 animate-in fade-in duration-300" dir="rtl">
      <button onClick={onSkip} className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors">
        تخطي
      </button>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-xs">
        <div className={`w-20 h-20 rounded-3xl ${slide.iconBg} flex items-center justify-center mb-8 animate-in zoom-in duration-400`}>
          <slide.icon className={`h-10 w-10 ${slide.iconColor}`} />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3 animate-in slide-in-from-bottom-4 duration-400">
          {slide.title}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line animate-in slide-in-from-bottom-4 duration-500">
          {slide.description}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
        <Button onClick={handleNext} className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg shadow-primary/20">
          {current < slides.length - 1 ? "التالي" : "ابدأ الجولة"}
        </Button>
      </div>
    </div>
  );
};

// ─── Step 3: Guided Tour (Tooltips) ─────────────────
interface TooltipStep {
  targetId: string;
  message: string;
  position: "top" | "bottom";
}

const tourSteps: TooltipStep[] = [
  {
    targetId: "smart-input-bar",
    message: "اكتب مثل: قبضت 500 من أحمد نقداً",
    position: "top",
  },
  {
    targetId: "quick-links-section",
    message: "من هنا تقدر تضيف فاتورة، زبون أو مصروف بسرعة",
    position: "bottom",
  },
  {
    targetId: "profit-loss-card",
    message: "تابع أداء مشروعك بسهولة",
    position: "top",
  },
];

const GuidedTour = ({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    const step = tourSteps[currentStep];
    const el = document.getElementById(step.targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Small delay for scroll to settle
      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
      }, 400);
    }
  }, [currentStep]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const step = tourSteps[currentStep];

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      {/* Backdrop with cutout */}
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onSkip} />

      {/* Highlight cutout */}
      {targetRect && (
        <>
          <div
            className="absolute rounded-2xl ring-4 ring-primary/50 shadow-2xl shadow-primary/20 transition-all duration-500 ease-out"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              background: "transparent",
              boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
            }}
          />

          {/* Tooltip */}
          <div
            className="absolute z-10 max-w-[300px] animate-in slide-in-from-bottom-4 duration-400"
            style={{
              ...(step.position === "top"
                ? { bottom: window.innerHeight - targetRect.top + 20 }
                : { top: targetRect.bottom + 20 }),
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-card rounded-2xl shadow-xl p-5 border border-border/50">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <button onClick={onSkip} className="p-1 hover:bg-muted rounded-lg transition-colors">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-sm font-semibold text-foreground leading-relaxed mb-4">{step.message}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {tourSteps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentStep ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/20"
                      }`}
                    />
                  ))}
                </div>
                <Button size="sm" onClick={handleNext} className="rounded-xl text-xs gap-1 px-4">
                  {currentStep < tourSteps.length - 1 ? "التالي" : "ابدأ"}
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Step 4: First Action Prompt ────────────────────
const FirstActionPrompt = ({ onDone }: { onDone: () => void }) => (
  <div className="fixed inset-0 z-[60] bg-foreground/50 backdrop-blur-sm flex items-end" dir="rtl" onClick={onDone}>
    <div
      className="w-full bg-card rounded-t-3xl p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-400"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mb-6" />
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🚀</div>
        <h3 className="text-lg font-bold text-foreground mb-2">جرب أول عملية الآن</h3>
        <p className="text-sm text-muted-foreground">اكتب مثلاً: قبضت 1000 شيكل من الزبون نقداً</p>
      </div>
      <Button onClick={onDone} className="w-full h-12 rounded-2xl font-semibold shadow-md shadow-primary/20">
        يلّا نبدأ!
      </Button>
    </div>
  </div>
);

// ─── Main Onboarding Flow ───────────────────────────
type OnboardingStep = "welcome" | "slides" | "tour" | "firstAction";

const OnboardingFlow = ({ onComplete, onFocusInput }: OnboardingFlowProps) => {
  const [step, setStep] = useState<OnboardingStep>("welcome");

  const finish = useCallback(() => {
    localStorage.setItem("onboarding_completed", "true");
    onComplete();
    onFocusInput();
  }, [onComplete, onFocusInput]);

  const skip = useCallback(() => {
    localStorage.setItem("onboarding_completed", "true");
    onComplete();
  }, [onComplete]);

  switch (step) {
    case "welcome":
      return <WelcomeStep onStart={() => setStep("slides")} onSkip={skip} />;
    case "slides":
      return <ValueSlides onNext={() => setStep("tour")} onSkip={skip} />;
    case "tour":
      return <GuidedTour onComplete={() => setStep("firstAction")} onSkip={skip} />;
    case "firstAction":
      return <FirstActionPrompt onDone={finish} />;
    default:
      return null;
  }
};

export default OnboardingFlow;
