import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface TourCard {
  emoji: string;
  emojiSize?: string;
  title: string;
  description: string;
  highlight?: string;
  gradient?: string;
  examples?: { input: string; output: string }[];
}

const baseTourCards: TourCard[] = [
  {
    emoji: "📊",
    title: "لوحة المعلومات",
    description: "صفحتك الرئيسية — كل أرقام شركتك في لمحة واحدة كل صباح",
  },
  {
    emoji: "🧾",
    title: "فواتير المبيعات",
    description: "أنشئ فواتيرك واحصل على ثمنها — احترافية وتُرسل مباشرة لواتساب",
    highlight: "أول فاتورة في 30 ثانية",
  },
  {
    emoji: "💰",
    title: "سندات القبض",
    description: "سجّل كل دفعة تستلمها وارتبطها بفاتورتها — صفر أموال ضائعة",
    highlight: "يُغلق الفاتورة تلقائياً",
  },
  {
    emoji: "👥",
    title: "الزبائن والموردون",
    description: "دفتر عناوينك المالي — كل زبون بتاريخه ورصيده ودرجة التزامه",
  },
];

// Card 5 varies by business_type
const card5Map: Record<string, TourCard> = {
  retail: { emoji: "📦", title: "المخزون", description: "راقب بضاعتك في الوقت الفعلي — تنبيه تلقائي قبل النفاد" },
  restaurant: { emoji: "📦", title: "المخزون", description: "راقب بضاعتك في الوقت الفعلي — تنبيه تلقائي قبل النفاد" },
  ecommerce: { emoji: "📦", title: "المخزون", description: "راقب بضاعتك في الوقت الفعلي — تنبيه تلقائي قبل النفاد" },
  contractor: { emoji: "🏗️", title: "محاسب المشاريع", description: "كل مشروع بحساباته المستقلة — تكاليف وأرباح لحظية" },
  services: { emoji: "📋", title: "المشتريات", description: "سجّل مشترياتك وارتبطها بحساباتك تلقائياً" },
};

const defaultCard5: TourCard = { emoji: "📦", title: "المخزون", description: "راقب بضاعتك في الوقت الفعلي — تنبيه تلقائي قبل النفاد" };

const lastCards: TourCard[] = [
  {
    emoji: "🏦",
    title: "الصناديق والبنوك",
    description: "كل جيبك المالي في مكان واحد — نقدي وبنكي وشيكات بلحظة",
  },
  {
    emoji: "📈",
    title: "مركز التقارير",
    description: "قائمة الدخل، الميزانية، الذمم — كل تقرير بضغطة وجاهز للطباعة",
  },
  {
    emoji: "✨",
    emojiSize: "text-5xl",
    title: "المحاسب الذكي",
    description: "بدّل طريقة عملك كلياً — اكتب بلغتك العادية وهو يحول الكلام لقيود محاسبية بدقة 100%",
    gradient: "from-[#0D1B2A] to-[#D4A017]",
    examples: [
      { input: "قبضت من شركة النور 5000 شيكل شيك", output: "سند قبض + قيد محاسبي" },
      { input: "اشترينا بضاعة من المورد الأهلي بـ 3000", output: "فاتورة مشتريات + قيد" },
    ],
  },
];

function getTourCards(businessType?: string): TourCard[] {
  const bt = businessType || "other";
  const card5 = card5Map[bt] || defaultCard5;
  return [...baseTourCards, card5, ...lastCards];
}

interface AppTourModalProps {
  open: boolean;
  businessType?: string;
  onComplete: () => void;
  onSkip: () => void;
}

const AppTourModal = ({ open, businessType, onComplete, onSkip }: AppTourModalProps) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const navigate = useNavigate();
  const cards = getTourCards(businessType);
  const total = cards.length; // 8

  const handleNext = useCallback(() => {
    if (step < total - 1) {
      setDirection(1);
      setStep(s => s + 1);
    }
  }, [step, total]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  }, [step]);

  const handleFinish = () => {
    onComplete();
    navigate("/dashboard");
  };

  const goToStep = (i: number) => {
    setDirection(i > step ? 1 : -1);
    setStep(i);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleNext(); // RTL: left = next
      if (e.key === "ArrowRight") handlePrev();
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleNext, handlePrev, onSkip]);

  if (!open) return null;

  const card = cards[step];
  const isLast = step === total - 1;
  const isSmartAccountant = isLast;

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" dir="rtl">
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-[4px]"
        onClick={onSkip}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 w-full max-w-[560px] rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <button onClick={onSkip} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {step + 1} من {total}
          </span>
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            تخطّي
          </button>
        </div>

        {/* Card content with animation */}
        <div className="px-6 pb-2 min-h-[320px] flex flex-col items-center justify-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full flex flex-col items-center text-center"
            >
              {/* Smart Accountant special card */}
              {isSmartAccountant && card.gradient ? (
                <div className={`w-full rounded-2xl bg-gradient-to-br ${card.gradient} p-6 mb-4`}>
                  <div className={`mb-3 ${card.emojiSize || "text-4xl"}`}>{card.emoji}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
                  <p className="text-sm text-white/85 leading-relaxed mb-4 max-w-md mx-auto">{card.description}</p>

                  {/* Animated examples */}
                  {card.examples && (
                    <div className="space-y-3">
                      {card.examples.map((ex, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + i * 0.4 }}
                          className="bg-white/10 rounded-xl p-3 text-right"
                        >
                          <p className="text-xs text-white/70 mb-1">💬 "{ex.input}"</p>
                          <p className="text-xs text-emerald-300 font-medium">✅ {ex.output}</p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-5xl mb-4">{card.emoji}</div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{card.title}</h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md mx-auto mb-3">
                    {card.description}
                  </p>
                  {card.highlight && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      🏷️ {card.highlight}
                    </span>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pb-3">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                  ? "w-2 bg-primary/40"
                  : "w-2 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-3 px-6 pb-5">
          {isLast ? (
            <Button onClick={handleFinish} className="flex-1 h-12 rounded-xl text-base gap-2 font-bold">
              ابدأ الاستخدام ⚡
            </Button>
          ) : (
            <>
              <Button onClick={handleNext} className="flex-1 h-11 rounded-xl gap-1">
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {step > 0 && (
                <Button onClick={handlePrev} variant="outline" className="h-11 rounded-xl gap-1">
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </Button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AppTourModal;
