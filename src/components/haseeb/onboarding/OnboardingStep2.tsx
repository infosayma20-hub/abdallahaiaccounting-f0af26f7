import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, Lightbulb } from "lucide-react";

const SANDBOX_EXAMPLES = [
  {
    text: "قبضت من سالم 300 شيكل نقداً",
    result: {
      title: "سند قبض جديد",
      icon: "📄",
      details: [
        { label: "المبلغ", value: "₪300" },
        { label: "من", value: "سالم" },
        { label: "طريقة", value: "نقدي" },
      ],
      treasury: { before: "₪4,200", after: "₪4,500", diff: "+300" },
      entry: { debit: { name: "الصندوق", amount: "₪300" }, credit: { name: "ح/سالم", amount: "₪300" } },
    },
  },
  {
    text: "دفعنا كهرباء 150 شيكل من الصندوق",
    result: {
      title: "سند صرف — مصروف",
      icon: "📄",
      details: [
        { label: "المبلغ", value: "₪150" },
        { label: "النوع", value: "مصاريف كهرباء" },
        { label: "طريقة", value: "صندوق" },
      ],
      treasury: { before: "₪4,500", after: "₪4,350", diff: "-150" },
      entry: { debit: { name: "مصاريف كهرباء", amount: "₪150" }, credit: { name: "الصندوق", amount: "₪150" } },
    },
  },
  {
    text: "بعت لشركة النور 5 كراتين بـ 200",
    result: {
      title: "فاتورة بيع",
      icon: "📄",
      details: [
        { label: "المبلغ", value: "₪1,000" },
        { label: "العميل", value: "شركة النور" },
        { label: "الكمية", value: "5 كراتين" },
      ],
      treasury: null,
      entry: { debit: { name: "ذمم مدينة", amount: "₪1,000" }, credit: { name: "إيرادات مبيعات", amount: "₪1,000" } },
    },
  },
];

const PLACEHOLDER_TEXTS = [
  "قبضت من سالم 300 شيكل نقداً...",
  "دفعنا كهرباء 150 شيكل من الصندوق...",
  "بعت لشركة النور 5 كراتين بـ 200...",
];

const TIPS = [
  "اذكر المبلغ دائماً — \"500 شيكل\" أو \"500\"",
  "اذكر الاسم والنظام يجده تلقائياً",
  "للبضاعة: اذكر الكمية والسعر — \"10 حبات بـ 50\"",
];

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const OnboardingStep2 = ({ onNext, onBack }: Props) => {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<typeof SANDBOX_EXAMPLES[0]["result"] | null>(null);
  const [typedResult, setTypedResult] = useState<string[]>([]);
  const [showTips, setShowTips] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const [userStartedTyping, setUserStartedTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Typing placeholder animation
  useEffect(() => {
    if (userStartedTyping) return;
    let textIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const currentText = PLACEHOLDER_TEXTS[textIdx];
      if (!isDeleting) {
        charIdx++;
        setPlaceholder(currentText.slice(0, charIdx));
        if (charIdx >= currentText.length) {
          timeout = setTimeout(() => { isDeleting = true; tick(); }, 1500);
          return;
        }
        timeout = setTimeout(tick, 50);
      } else {
        charIdx--;
        setPlaceholder(currentText.slice(0, charIdx));
        if (charIdx <= 0) {
          isDeleting = false;
          textIdx = (textIdx + 1) % PLACEHOLDER_TEXTS.length;
          timeout = setTimeout(tick, 300);
          return;
        }
        timeout = setTimeout(tick, 30);
      }
    };
    tick();
    return () => clearTimeout(timeout);
  }, [userStartedTyping]);

  const handleSend = useCallback((text?: string) => {
    const val = text || input;
    if (!val.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);
    setTypedResult([]);

    // Find matching example
    const match = SANDBOX_EXAMPLES.find(e => e.text === val) || SANDBOX_EXAMPLES[0];

    setTimeout(() => {
      setIsLoading(false);
      setResult(match.result);
      setInput("");

      // Typewriter effect — reveal lines one by one
      const lines = buildResultLines(match.result);
      lines.forEach((line, i) => {
        setTimeout(() => {
          setTypedResult(prev => [...prev, line]);
        }, i * 150);
      });
    }, 1500);
  }, [input, isLoading]);

  const buildResultLines = (r: typeof SANDBOX_EXAMPLES[0]["result"]) => {
    const lines: string[] = [
      `✅ فهمت! إليك ما سيحدث:`,
      ``,
      `${r.icon} ${r.title}`,
      ...r.details.map(d => `   ${d.label}: ${d.value}`),
    ];
    if (r.treasury) {
      lines.push(``);
      lines.push(`💰 رصيد الخزينة`);
      lines.push(`   ${r.treasury.before} ← ${r.treasury.after} (${r.treasury.diff})`);
    }
    lines.push(``);
    lines.push(`📒 قيد محاسبي:`);
    lines.push(`   مدين: ${r.entry.debit.name}    ${r.entry.debit.amount}`);
    lines.push(`   دائن: ${r.entry.credit.name}    ${r.entry.credit.amount}`);
    return lines;
  };

  return (
    <div className="flex flex-col h-full px-5 py-6 bg-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-5"
      >
        <h2 className="text-xl font-extrabold text-slate-900 mb-1" style={{ fontFamily: "Tajawal, sans-serif" }}>
          🎯 جرّب الآن
        </h2>
        <p className="text-xs text-slate-500">اكتب أي جملة — لن يُسجَّل شيء حقيقي</p>
        <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-[11px] font-medium"
          style={{ background: "#FEF9C3", color: "#854D0E" }}>
          🧪 وضع تجريبي
        </div>
      </motion.div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2 rounded-2xl p-2 border border-slate-200 bg-slate-50 mb-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            if (!userStartedTyping) setUserStartedTyping(true);
            setResult(null);
            setTypedResult([]);
          }}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={userStartedTyping ? "اكتب عملية..." : placeholder || "اكتب عملية..."}
          className="flex-1 bg-transparent text-slate-900 text-sm px-3 py-2 outline-none placeholder:text-slate-400"
          dir="rtl"
        />
        <button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "#4A9EE8", color: "#1B3A5C" }}
        >
          <Send className="h-4 w-4" />
        </button>
      </motion.div>

      {/* Chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center gap-2 mb-4"
      >
        {!result && !isLoading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs font-bold text-primary mb-1"
          >
            👇 اختر مثالاً لتجربته
          </motion.p>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          {SANDBOX_EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => {
                setInput(ex.text);
                setUserStartedTyping(true);
                handleSend(ex.text);
              }}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl text-[11px] transition-all hover:bg-primary/10 hover:border-primary/40 active:scale-95 bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-40"
            >
              {ex.text}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Loading */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-6"
          >
            <span className="text-sm text-slate-500">جاري الفهم</span>
            <span className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#4A9EE8]"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result - Typewriter */}
      <AnimatePresence>
        {result && !isLoading && typedResult.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-3 overflow-y-auto max-h-[240px]"
          >
            <div className="font-mono text-xs leading-6 text-slate-800 whitespace-pre-wrap" dir="rtl">
              {typedResult.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className={line.startsWith("✅") ? "font-bold text-green-700 text-sm mb-1" : ""}
                >
                  {line || "\u00A0"}
                </motion.div>
              ))}
            </div>

            {/* Demo badge */}
            {typedResult.length >= 8 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5"
              >
                🧪 هذا تجريبي — لم يُسجَّل شيء فعلياً
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      {result && !isLoading && typedResult.length >= 8 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-[11px] text-slate-500 bg-blue-50/50 rounded-xl px-3 py-2 mb-4"
        >
          <Lightbulb className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          في النظام الحقيقي ستُعرض عليك هذه التفاصيل للتأكيد قبل الحفظ
        </motion.div>
      )}

      {/* Collapsible Tips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mb-4"
      >
        <button
          onClick={() => setShowTips(!showTips)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors mx-auto"
        >
          <motion.span
            animate={{ rotate: showTips ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
          نصائح الكتابة السريعة
        </button>
        <AnimatePresence>
          {showTips && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2 max-w-sm mx-auto">
                {TIPS.map((tip, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 rounded-xl px-3 py-2"
                  >
                    <span className="text-[#4A9EE8] mt-0.5">•</span>
                    {tip}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Navigation */}
      <div className="mt-auto flex gap-3 justify-center pt-2">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-2xl text-sm font-medium transition-all hover:bg-slate-100 text-slate-600 border border-slate-300"
        >
          ← السابق
        </button>
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-2xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #4A9EE8, #7BB8F0)", color: "#1B3A5C" }}
        >
          التالي ←
        </button>
      </div>
    </div>
  );
};

export default OnboardingStep2;
