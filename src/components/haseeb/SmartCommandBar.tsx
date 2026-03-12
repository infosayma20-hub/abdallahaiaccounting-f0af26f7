import { useState, useRef } from "react";
import { ChevronLeft } from "lucide-react";

type CategoryKey = "record" | "reports" | "add" | "ask" | "advanced";

interface Props {
  onInsert: (text: string) => void;
  onAction?: (action: string) => void;
}

const CATEGORIES: { key: CategoryKey; icon: string; label: string }[] = [
  { key: "record", icon: "⚡", label: "تسجيل عملية" },
  { key: "reports", icon: "📊", label: "عرض تقارير" },
  { key: "add", icon: "✨", label: "إضافة جديدة" },
  { key: "ask", icon: "🤖", label: "اسأل المحاسب" },
  { key: "advanced", icon: "⚙️", label: "أوامر متقدمة" },
];

const RECORD_CARDS = [
  { icon: "💰", title: "قبضت من @...", sub: "تسجيل قبض", text: "قبضت من @" },
  { icon: "💸", title: "دفعت لـ @...", sub: "تسجيل صرف", text: "دفعت لـ @" },
  { icon: "🛍️", title: "بعت لـ @...", sub: "فاتورة بيع", text: "بعت لـ @" },
  { icon: "🛒", title: "اشتريت من @...", sub: "فاتورة شراء", text: "اشتريت من @" },
  { icon: "🏦", title: "أودعت في البنك", sub: "إيداع نقدي", text: "أودعت في البنك مبلغ" },
  { icon: "🏧", title: "سحبت من البنك", sub: "سحب نقدي", text: "سحبت من البنك مبلغ" },
  { icon: "📄", title: "فاتورة ضريبية", sub: "فاتورة", text: "أصدر فاتورة ضريبية لـ @" },
  { icon: "📋", title: "سند قبض رسمي", sub: "إيصال رسمي", text: "أصدر سند قبض لـ @" },
];

const REPORT_ROWS = [
  { icon: "📈", label: "أرباح وخسائر الشهر", text: "اعرض أرباح وخسائر هذا الشهر" },
  { icon: "💳", label: "الذمم المتأخرة", text: "اعرض الذمم المتأخرة" },
  { icon: "🏦", label: "كشف حساب البنك", text: "اعرض كشف حساب البنك" },
  { icon: "👤", label: "كشف حساب زبون @...", text: "اعرض كشف حساب @" },
  { icon: "📋", label: "آخر 10 معاملات", text: "اعرض آخر 10 معاملات" },
];

const ADD_ITEMS = [
  { icon: "👤", label: "أضف زبون", gradient: "linear-gradient(135deg, #1E3A5F, #0A2342)", text: "أضف زبون" },
  { icon: "🏭", label: "أضف مورد", gradient: "linear-gradient(135deg, #1B4332, #065F46)", text: "أضف مورد" },
  { icon: "📦", label: "أضف منتج", gradient: "linear-gradient(135deg, #78350F, #B45309)", text: "أضف منتج" },
  { icon: "👷", label: "أضف موظف", gradient: "linear-gradient(135deg, #3730A3, #4F46E5)", text: "أضف موظف" },
  { icon: "📒", label: "أضف حساب", gradient: "linear-gradient(135deg, #831843, #9D174D)", text: "أضف حساب" },
];

const ASK_QUESTIONS = [
  { icon: "💧", label: "متى ستنتهي سيولتي؟", text: "متى ستنتهي سيولتي؟" },
  { icon: "📦", label: "ما أكثر منتج مربح؟", text: "ما أكثر منتج مربح؟" },
  { icon: "👔", label: "هل أوظف موظفاً؟", text: "هل أوظف موظفاً؟" },
  { icon: "💡", label: "شو وضعي المالي؟", text: "شو وضعي المالي؟" },
];

const ADVANCED_CMDS = [
  { icon: "🔄", label: "قيد عكسي (تصحيح قيد سابق)", text: "قيد عكسي", action: true },
  { icon: "📤", label: "تصدير المحادثة PDF", text: "تصدير المحادثة PDF", action: true },
  { icon: "📝", label: "إدخال متعدد (أكثر من عملية)", text: "سجل هذه العمليات:\n1." },
  { icon: "📎", label: "رفع فاتورة PDF/صورة", text: "رفع فاتورة", action: true },
  { icon: "📅", label: "عرض القيود المتكررة", text: "اعرض قيودي المتكررة" },
  { icon: "🗑️", label: "مسح المحادثة الحالية", text: "مسح المحادثة", action: true },
];

const SmartCommandBar = ({ onInsert, onAction }: Props) => {
  const [active, setActive] = useState<CategoryKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleCategoryClick = (key: CategoryKey) => {
    setActive(prev => (prev === key ? null : key));
  };

  const handleSelect = (text: string, isAction?: boolean) => {
    if (isAction && onAction) {
      onAction(text);
    } else {
      onInsert(text);
    }
    setActive(null);
  };

  return (
    <div style={{ fontFamily: "Tajawal, sans-serif" }}>
      {/* Category buttons row */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto px-4 pt-3 pb-2.5"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {CATEGORIES.map(cat => {
            const isActive = active === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                className="flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap transition-all duration-200"
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "Tajawal, sans-serif",
                  background: isActive ? "#0A2342" : "#F4F7FA",
                  color: isActive ? "white" : "#4B5563",
                  border: `1.5px solid ${isActive ? "#0A2342" : "#E5E7EB"}`,
                  boxShadow: isActive ? "0 4px 12px rgba(10,35,66,0.25)" : "none",
                  transform: isActive ? "translateY(-1px)" : "none",
                  opacity: active && !isActive ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 14 }}>{cat.icon}</span>
                {cat.label}
              </button>
            );
          })}
        </div>
        {/* Fade hint on left edge (RTL scroll) */}
        <div
          className="pointer-events-none absolute top-0 left-0 h-full w-8"
          style={{ background: "linear-gradient(90deg, white, transparent)" }}
        />
      </div>

      {/* Subcategory panel */}
      <div
        className="overflow-hidden transition-all"
        style={{
          maxHeight: active ? 340 : 0,
          opacity: active ? 1 : 0,
          transitionDuration: "350ms",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="px-4 pb-3"
          style={{
            background: "linear-gradient(180deg, #F8FAFC 0%, white 20%)",
            borderTop: "1px solid #F1F5F9",
          }}
        >
          {active === "record" && <RecordPanel onSelect={handleSelect} />}
          {active === "reports" && <ReportsPanel onSelect={handleSelect} />}
          {active === "add" && <AddPanel onSelect={handleSelect} />}
          {active === "ask" && <AskPanel onSelect={handleSelect} />}
          {active === "advanced" && <AdvancedPanel onSelect={handleSelect} />}
        </div>
      </div>
    </div>
  );
};

/* ── Panel 1: Record ──────────────────── */
const RecordPanel = ({ onSelect }: { onSelect: (t: string) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2.5">
    {RECORD_CARDS.map((card, i) => (
      <button
        key={card.title}
        onClick={() => onSelect(card.text)}
        className="flex items-center gap-2.5 rounded-[14px] p-3 transition-all duration-150 hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
        style={{
          background: "#FAFAFA",
          border: "1.5px solid #E5E7EB",
          animation: `cmdFadeUp 200ms ease-out ${i * 30}ms both`,
        }}
      >
        <span className="text-[24px] flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#F4F7FA" }}>
          {card.icon}
        </span>
        <div className="flex flex-col items-start text-right min-w-0">
          <span className="text-[13px] font-bold truncate w-full" style={{ color: "#0A2342" }}>{card.title}</span>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>{card.sub}</span>
        </div>
      </button>
    ))}
  </div>
);

/* ── Panel 2: Reports ─────────────────── */
const ReportsPanel = ({ onSelect }: { onSelect: (t: string) => void }) => (
  <div className="pt-2">
    {REPORT_ROWS.map((row, i) => (
      <button
        key={row.label}
        onClick={() => onSelect(row.text)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors hover:bg-[#F4F7FA] active:bg-[#EFF6FF]"
        style={{
          animation: `cmdFadeUp 200ms ease-out ${i * 40}ms both`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{row.icon}</span>
          <span className="text-[14px] font-bold" style={{ color: "#0A2342" }}>{row.label}</span>
        </div>
        <ChevronLeft className="h-3.5 w-3.5" style={{ color: "#8B9BB4" }} />
      </button>
    ))}
  </div>
);

/* ── Panel 3: Add New ─────────────────── */
const AddPanel = ({ onSelect }: { onSelect: (t: string) => void }) => (
  <div
    className="flex gap-2.5 overflow-x-auto pt-3 pb-1"
    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
  >
    {ADD_ITEMS.map((item, i) => (
      <button
        key={item.label}
        onClick={() => onSelect(item.text)}
        className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          minWidth: 100,
          padding: "14px 16px",
          background: item.gradient,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          animation: `cmdSlideIn 250ms ease-out ${i * 50}ms both`,
        }}
      >
        <span className="text-[28px] mb-1">{item.icon}</span>
        <span className="text-[12px] font-bold text-white whitespace-nowrap">{item.label}</span>
      </button>
    ))}
  </div>
);

/* ── Panel 4: Ask ─────────────────────── */
const AskPanel = ({ onSelect }: { onSelect: (t: string) => void }) => (
  <div className="grid grid-cols-2 gap-2 pt-2.5">
    {ASK_QUESTIONS.map((q, i) => (
      <button
        key={q.label}
        onClick={() => onSelect(q.text)}
        className="rounded-[14px] p-3.5 flex items-center gap-2.5 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
        style={{
          background: "linear-gradient(135deg, #F0F9FF, #E0F2FE)",
          border: "1.5px solid #BAE6FD",
          animation: `cmdScaleIn 200ms ease-out ${i * 40}ms both`,
        }}
      >
        <span className="text-[20px]">{q.icon}</span>
        <span className="text-[13px] font-bold text-right" style={{ color: "#0A2342" }}>{q.label}</span>
      </button>
    ))}
  </div>
);

/* ── Panel 5: Advanced ────────────────── */
const AdvancedPanel = ({ onSelect }: { onSelect: (t: string, a?: boolean) => void }) => (
  <div className="pt-1">
    {ADVANCED_CMDS.map((cmd, i) => (
      <button
        key={cmd.label}
        onClick={() => onSelect(cmd.text, cmd.action)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] transition-colors hover:bg-[#F4F7FA] active:bg-[#EFF6FF]"
        style={{
          animation: `cmdFadeUp 200ms ease-out ${i * 30}ms both`,
        }}
      >
        <span className="text-[20px]">{cmd.icon}</span>
        <span className="text-[13px]" style={{ color: "#374151" }}>{cmd.label}</span>
      </button>
    ))}
  </div>
);

export default SmartCommandBar;
