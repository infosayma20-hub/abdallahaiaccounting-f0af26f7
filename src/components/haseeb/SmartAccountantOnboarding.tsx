import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Zap, MessageCircle, Hash, Package, Building2, Calendar,
  BarChart3, UserPlus, Search, CheckCircle2, Sparkles
} from "lucide-react";

interface Props {
  userName: string;
  onComplete: () => void;
  onSkip: () => void;
}

const EXAMPLES_STEP1 = [
  "قبضت من محمد 500 شيكل",
  "دفعت إيجار 2000 شيكل من البنك",
  "بعت 10 كيلو طحين لشركة النور بـ 50 شيكل",
  "اشتريت 50 قطعة سجاد سعر القطعة 120",
  "سجل فاتورة لسليم 12000 على الحساب",
];

const SANDBOX_EXAMPLES = [
  { text: "قبضت من سالم 300 شيكل", result: { type: "قبض نقدي", from: "سالم", amount: "₪300", entry: "ح/صندوق مدين ← ح/ذمم مدينة دائن" } },
  { text: "دفعت كهرباء 150 شيكل", result: { type: "مصروف", from: "كهرباء", amount: "₪150", entry: "ح/مصاريف كهرباء مدين ← ح/صندوق دائن" } },
  { text: "بعت شركة النور 5 كراتين بـ 200 الكرتون", result: { type: "بيع", from: "شركة النور", amount: "₪1,000", entry: "ح/ذمم مدينة مدين ← ح/إيرادات دائن" } },
];

const RULES = [
  { icon: MessageCircle, title: "💬 احكِ طبيعي", desc: "\"قبضت من محمد...\"" },
  { icon: Hash, title: "# اذكر المبلغ", desc: "\"500 شيكل\"" },
  { icon: UserPlus, title: "👤 اذكر الاسم", desc: "النظام يربطه تلقائياً" },
  { icon: Package, title: "📦 البضاعة:", desc: "الكمية + السعر" },
  { icon: Building2, title: "🏦 اذكر البنك", desc: "إذا من البنك" },
  { icon: Calendar, title: "📅 التاريخ", desc: "إذا شيك" },
];

const CAPABILITIES = [
  { icon: Zap, title: "تسجيل عمليات", desc: "جمل طبيعية → قيود محاسبية", color: "#C9A84C" },
  { icon: BarChart3, title: "عرض تقارير", desc: "\"شو وضعي المالي؟\"", color: "#006D8F" },
  { icon: UserPlus, title: "إضافة جهات", desc: "\"أضف زبون محمد\"", color: "#16A34A" },
  { icon: Search, title: "استعلامات", desc: "\"كم عليّ لشركة النور؟\"", color: "#7C3AED" },
];

const SmartAccountantOnboarding = ({ userName, onComplete, onSkip }: Props) => {
  const [step, setStep] = useState(0);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [sandboxInput, setSandboxInput] = useState("");
  const [sandboxResult, setSandboxResult] = useState<typeof SANDBOX_EXAMPLES[0]["result"] | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Animated examples in step 1
  useEffect(() => {
    if (step !== 0) return;
    const interval = setInterval(() => {
      setExampleIdx(i => (i + 1) % EXAMPLES_STEP1.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [step]);

  const handleSandboxSend = (text?: string) => {
    const input = text || sandboxInput;
    if (!input.trim()) return;

    // Find matching example or generate generic result
    const match = SANDBOX_EXAMPLES.find(e => e.text === input);
    if (match) {
      setSandboxResult(match.result);
    } else {
      // Generic parse
      const amountMatch = input.match(/(\d+)/);
      const amount = amountMatch ? `₪${parseInt(amountMatch[1]).toLocaleString()}` : "₪---";
      let type = "عملية";
      if (/قبض|استلم/i.test(input)) type = "قبض";
      else if (/دفع|صرف/i.test(input)) type = "دفع";
      else if (/بع/i.test(input)) type = "بيع";
      else if (/اشتر/i.test(input)) type = "شراء";
      
      setSandboxResult({
        type,
        from: input.match(/@(\S+)/)?.[1] || "---",
        amount,
        entry: type === "قبض" ? "ح/صندوق مدين ← ح/ذمم دائن" 
             : type === "دفع" ? "ح/مصاريف مدين ← ح/صندوق دائن"
             : type === "بيع" ? "ح/ذمم مدين ← ح/إيرادات دائن"
             : "ح/مخزون مدين ← ح/ذمم دائن",
      });
    }
    setShowResult(true);
    setSandboxInput("");
  };

  const totalSteps = 4;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" dir="rtl">
      {/* Backdrop - White background */}
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-white" 
      />

      {/* Skip button */}
      <button 
        onClick={onSkip}
        className="absolute top-4 left-4 z-10 text-xs px-3 py-1.5 rounded-full transition-all hover:bg-slate-100"
        style={{ color: "#64748B", border: "1px solid #E2E8F0" }}
      >
        تخطّي الدليل
      </button>

      {/* Progress dots */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full transition-all duration-300"
            style={{
              background: i === step ? "#C9A84C" : i < step ? "rgba(201,168,76,0.5)" : "#CBD5E1",
              transform: i === step ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Step 1: What is Smart Accountant */}
          {step === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="text-center space-y-8"
            >
              <p className="text-xs font-medium text-[#C9A84C]">الخطوة 1 من 4</p>
              
              <div className="space-y-4">
                <div className="text-6xl">🤖</div>
                <h1 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  أنا محاسبك الشخصي الذكي
                </h1>
                <p className="text-sm leading-relaxed text-slate-600">
                  احكِ معي بالعربي العادي — أنا أفهم وأسجّل
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30">
                  <Zap className="h-4 w-4 text-[#C9A84C]" />
                  <span className="text-sm font-bold text-[#C9A84C]">كل عملية في 5 ثواني بدل دقائق</span>
                </div>
              </div>

              {/* Animated examples */}
              <div className="h-16 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={exampleIdx}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                    className="px-5 py-3 rounded-2xl text-sm font-medium bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    → {EXAMPLES_STEP1[exampleIdx]}
                  </motion.div>
                </AnimatePresence>
              </div>

              <button
                onClick={() => setStep(1)}
                className="px-8 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-95 bg-[#C9A84C] text-slate-900"
              >
                التالي ←
              </button>
            </motion.div>
          )}

          {/* Step 2: Golden Rules */}
          {step === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="text-center space-y-6"
            >
              <p className="text-xs font-medium" style={{ color: "rgba(201,168,76,0.8)" }}>الخطوة 2 من 4</p>
              <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
                قواعد الكتابة الذهبية ✨
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {RULES.map((rule, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4 rounded-2xl text-center space-y-2"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <p className="text-lg font-bold text-white">{rule.title}</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{rule.desc}</p>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep(0)}
                  className="px-6 py-3 rounded-2xl text-sm font-medium transition-all hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  ← السابق
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="px-8 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#C9A84C", color: "#1B3A5C" }}
                >
                  التالي ←
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Try Now (Sandbox) */}
          {step === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="text-center space-y-5"
            >
              <p className="text-xs font-medium" style={{ color: "rgba(201,168,76,0.8)" }}>الخطوة 3 من 4</p>
              <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
                جرّب الآن! 🎯
              </h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>اكتب أي جملة وشوف كيف أفهمها</p>

              {/* Sandbox input */}
              <div className="flex gap-2 rounded-2xl p-2" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <input
                  value={sandboxInput}
                  onChange={e => { setSandboxInput(e.target.value); setShowResult(false); }}
                  onKeyDown={e => e.key === "Enter" && handleSandboxSend()}
                  placeholder="اكتب عملية..."
                  className="flex-1 bg-transparent text-white text-sm px-3 py-2 outline-none placeholder:text-white/30"
                  dir="rtl"
                />
                <button
                  onClick={() => handleSandboxSend()}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#C9A84C", color: "#1B3A5C" }}
                >
                  إرسال
                </button>
              </div>

              {/* Quick examples */}
              <div className="flex flex-wrap gap-2 justify-center">
                {SANDBOX_EXAMPLES.map(ex => (
                  <button
                    key={ex.text}
                    onClick={() => { setSandboxInput(ex.text); handleSandboxSend(ex.text); }}
                    className="px-3 py-1.5 rounded-xl text-[11px] transition-all hover:bg-white/15 active:scale-95"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {ex.text}
                  </button>
                ))}
              </div>

              {/* Result */}
              <AnimatePresence>
                {showResult && sandboxResult && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 rounded-2xl text-right space-y-3"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm font-bold text-white">فهمت العملية:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>النوع: </span>
                        <span className="font-bold text-white">{sandboxResult.type}</span>
                      </div>
                      <div className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>الجهة: </span>
                        <span className="font-bold text-white">{sandboxResult.from}</span>
                      </div>
                      <div className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>المبلغ: </span>
                        <span className="font-bold" style={{ color: "#C9A84C" }}>{sandboxResult.amount}</span>
                      </div>
                      <div className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>القيد: </span>
                        <span className="font-bold text-white text-[10px]">{sandboxResult.entry}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      <CheckCircle2 className="h-4 w-4" style={{ color: "#16A34A" }} />
                      <span className="text-xs font-bold" style={{ color: "#16A34A" }}>✓ تم الفهم بنجاح</span>
                    </div>
                    <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                      هذا مجرد عرض تجريبي — لن يُسجَّل شيء فعلياً
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-2xl text-sm font-medium transition-all hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  ← السابق
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-8 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#C9A84C", color: "#1B3A5C" }}
                >
                  التالي ←
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Capabilities */}
          {step === 3 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="text-center space-y-6"
            >
              <p className="text-xs font-medium" style={{ color: "rgba(201,168,76,0.8)" }}>الخطوة 4 من 4</p>
              <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
                ماذا يستطيع أن يفعل؟ 🚀
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {CAPABILITIES.map((cap, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className="p-5 rounded-2xl text-center space-y-3"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto" style={{ background: `${cap.color}20` }}>
                      <cap.icon className="h-6 w-6" style={{ color: cap.color }} />
                    </div>
                    <p className="text-sm font-bold text-white">{cap.title}</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{cap.desc}</p>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-2xl text-sm font-medium transition-all hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  ← السابق
                </button>
                <button
                  onClick={onComplete}
                  className="px-8 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-95 flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #E8D5A3)", color: "#1B3A5C" }}
                >
                  <Sparkles className="h-4 w-4" />
                  ابدأ الاستخدام
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SmartAccountantOnboarding;
