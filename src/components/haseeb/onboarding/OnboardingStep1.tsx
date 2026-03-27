import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, BarChart3, Search, UserPlus } from "lucide-react";

const CAPABILITIES = [
  {
    icon: Zap,
    title: "تسجيل عمليات",
    example: "قبضت من سالم 300 شيكل",
    result: "← سند قبض ₪300 + قيد تلقائي",
    color: "#4A9EE8",
    emoji: "⚡",
  },
  {
    icon: BarChart3,
    title: "تقارير فورية",
    example: "شو وضعي المالي؟",
    result: "← ملخص أرباح وخسائر + رسم بياني",
    color: "#006D8F",
    emoji: "📊",
  },
  {
    icon: Search,
    title: "استعلامات",
    example: "كم على شركة النور؟",
    result: "← رصيد الذمم المدينة: ₪12,500",
    color: "#7C3AED",
    emoji: "🔍",
  },
  {
    icon: UserPlus,
    title: "إضافة جهات",
    example: "أضف زبون محمد",
    result: "← جهة اتصال جديدة + حساب ذمم",
    color: "#16A34A",
    emoji: "👤",
  },
];

interface Props {
  userName: string;
  onNext: () => void;
}

const OnboardingStep1 = ({ userName, onNext }: Props) => {
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      {/* Top Section - Navy Gradient */}
      <div
        className="relative px-6 pt-10 pb-8 text-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1B3A5C 0%, #0F2744 100%)",
          borderRadius: "0 0 32px 32px",
        }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(74,158,232,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(74,158,232,0.2) 0%, transparent 40%)",
          }}
        />

        {/* Robot icon with pulse */}
        <motion.div
          className="relative text-7xl mb-4"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          🤖
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[26px] font-extrabold text-white mb-3"
          style={{ fontFamily: "Tajawal, sans-serif" }}
        >
          محاسبك الذكي ✨
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-sm leading-relaxed max-w-xs mx-auto"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          اكتب بلغتك العادية — أنا أفهم
          <br />
          وأحوّل الكلام لمحاسبة دقيقة
        </motion.p>
      </div>

      {/* Bottom Section - White with Cards */}
      <div className="flex-1 px-5 py-6 bg-white">
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
            >
              <button
                onClick={() =>
                  setExpandedCard(expandedCard === i ? null : i)
                }
                className="w-full text-right p-4 rounded-2xl border transition-all duration-200"
                style={{
                  background:
                    expandedCard === i ? `${cap.color}08` : "#F8FAFC",
                  borderColor:
                    expandedCard === i ? `${cap.color}40` : "#E2E8F0",
                  boxShadow:
                    expandedCard === i
                      ? `0 4px 20px ${cap.color}15`
                      : "none",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{cap.emoji}</span>
                  <span className="text-sm font-bold text-slate-900">
                    {cap.title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 pr-7">
                  "{cap.example}"
                </p>
              </button>

              {/* Mini preview */}
              <AnimatePresence>
                {expandedCard === i && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mt-2 px-3 py-2.5 rounded-xl text-[11px] leading-relaxed"
                      style={{
                        background: `${cap.color}10`,
                        color: cap.color,
                        borderRight: `3px solid ${cap.color}`,
                      }}
                    >
                      <span className="font-bold">مثال:</span>{" "}
                      {cap.example}
                      <br />
                      <span className="font-bold">{cap.result}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-6 max-w-md mx-auto"
        >
          <button
            onClick={onNext}
            className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #4A9EE8, #7BB8F0)",
              color: "#1B3A5C",
            }}
          >
            <Zap className="h-4 w-4" />
            جرّب الآن
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default OnboardingStep1;
