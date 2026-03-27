import { useState } from "react";
import { X, ChevronLeft, Search } from "lucide-react";
import { multiWordMatchAny } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
}

const CommandsSheet = ({ open, onClose, onSelect }: Props) => {
  const [search, setSearch] = useState("");

  if (!open) return null;

  const financialCommands = [
    { icon: "💰", label: "قبضت من ...", hint: "تسجيل قبض" },
    { icon: "💸", label: "دفعت لـ ...", hint: "تسجيل صرف" },
    { icon: "📦", label: "بعت لـ ...", hint: "فاتورة بيع" },
    { icon: "🛒", label: "اشتريت من ...", hint: "فاتورة شراء" },
    { icon: "🏦", label: "سحبت من البنك", hint: "سحب نقدي" },
    { icon: "💳", label: "أودعت في البنك", hint: "إيداع نقدي" },
    { icon: "📋", label: "سند قبض", hint: "إيصال رسمي" },
    { icon: "🧾", label: "فاتورة", hint: "فاتورة ضريبية" },
  ];

  const reports = [
    { icon: "📈", label: "أرباح وخسائر الشهر" },
    { icon: "💳", label: "الذمم المتأخرة" },
    { icon: "🏦", label: "كشف حساب البنك" },
    { icon: "👥", label: "كشف حساب عميل ..." },
    { icon: "📋", label: "آخر 10 معاملات" },
    { icon: "💰", label: "ملخصي المالي اليوم" },
    { icon: "⚖️", label: "ميزان المراجعة" },
    { icon: "📅", label: "تقرير الشيكات المستحقة" },
  ];

  const addNew = [
    { icon: "👤", label: "أضف زبون" },
    { icon: "🏭", label: "أضف مورد" },
    { icon: "📦", label: "أضف منتج" },
    { icon: "👷", label: "أضف موظف" },
    { icon: "📒", label: "أضف حساب" },
  ];

  const smartQuestions = [
    { icon: "💧", label: "متى ستنتهي سيولتي؟" },
    { icon: "📊", label: "ما أكثر منتج مربح؟" },
    { icon: "👔", label: "هل أوظف موظفاً؟" },
    { icon: "💡", label: "شو وضعي المالي؟" },
  ];

  const advancedCommands = [
    { icon: "🔄", label: "قيد عكسي (تصحيح قيد سابق)" },
    { icon: "📤", label: "تصدير المحادثة PDF" },
    { icon: "🔁", label: "إدخال متعدد (سجل أكثر من عملية)" },
    { icon: "📎", label: "رفع فاتورة PDF/صورة" },
    { icon: "📆", label: "عرض القيود المتكررة" },
    { icon: "🗑️", label: "مسح المحادثة الحالية" },
  ];

  // Gather all items for search
  const allItems = [
    ...financialCommands.map(c => ({ ...c, section: "transaction" })),
    ...reports.map(r => ({ ...r, hint: undefined, section: "report" })),
    ...addNew.map(a => ({ ...a, hint: undefined, section: "add" })),
    ...smartQuestions.map(q => ({ ...q, hint: undefined, section: "question" })),
    ...advancedCommands.map(a => ({ ...a, hint: undefined, section: "advanced" })),
  ];

  const isSearching = search.trim().length > 0;
  const searchResults = isSearching
    ? allItems.filter(item => item.label.includes(search))
    : [];

  const sectionHeaderStyle = {
    color: "#4A9EE8",
    fontFamily: "Tajawal, sans-serif",
    letterSpacing: "1px",
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[200] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          maxHeight: "95vh",
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "#E2E8F0" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-base font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
            ماذا تريد؟
          </h2>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full" style={{ background: "#F1F5F9" }}>
            <X className="h-4 w-4" style={{ color: "#8B9BB4" }} />
          </button>
        </div>

        {/* Search bar - sticky */}
        <div className="px-5 pb-3 sticky top-0 z-10 bg-white">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#8B9BB4" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 ابحث عن أمر..."
              className="w-full h-12 rounded-[14px] pr-10 pl-4 text-[14px] outline-none"
              style={{ background: "#F1F5F9", fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {isSearching ? (
            searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map(item => (
                  <button
                    key={item.label}
                    onClick={() => onSelect(item.label)}
                    className="w-full h-14 flex items-center gap-3 px-3 rounded-xl text-[14px] active:scale-[0.97] transition-transform hover:bg-[#F8FAFC]"
                    style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="font-bold">{item.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-[14px]" style={{ color: "#8B9BB4" }}>لا توجد نتائج</p>
              </div>
            )
          ) : (
            <>
              {/* Section 1: Financial commands */}
              <div>
                <p className="text-[12px] font-bold mb-2.5 uppercase" style={sectionHeaderStyle}>⚡ تسجيل عملية</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {financialCommands.map(cmd => (
                    <button
                      key={cmd.label}
                      onClick={() => onSelect(cmd.label)}
                      className="rounded-xl flex items-center gap-2.5 p-3 active:scale-[0.97] transition-all hover:border-[#0A2342] hover:bg-[#EFF6FF]"
                      style={{ background: "white", border: "1.5px solid #E2E8F0" }}
                    >
                      <span className="text-[18px]">{cmd.icon}</span>
                      <div className="flex flex-col items-start">
                        <span className="text-[13px] font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
                          {cmd.label}
                        </span>
                        <span className="text-[10px]" style={{ color: "#8B9BB4" }}>{cmd.hint}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 2: Reports */}
              <div>
                <p className="text-[12px] font-bold mb-2.5 uppercase" style={sectionHeaderStyle}>📊 عرض تقارير</p>
                <div className="space-y-1.5">
                  {reports.map(r => (
                    <button
                      key={r.label}
                      onClick={() => onSelect(r.label)}
                      className="w-full h-14 flex items-center justify-between px-4 rounded-xl text-[14px] active:bg-[#F8FAFC] transition-colors"
                      style={{ background: "white", border: "1px solid #F1F5F9", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{r.icon}</span>
                        <span className="font-bold">{r.label}</span>
                      </div>
                      <ChevronLeft className="h-3.5 w-3.5" style={{ color: "#8B9BB4" }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Add new */}
              <div>
                <p className="text-[12px] font-bold mb-2.5 uppercase" style={sectionHeaderStyle}>✨ إضافة جديدة</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {addNew.map(a => (
                    <button
                      key={a.label}
                      onClick={() => onSelect(a.label)}
                      className="flex-shrink-0 h-12 px-[18px] rounded-3xl text-[13px] flex items-center gap-1.5 active:scale-95 transition-transform hover:border-[#0A2342]"
                      style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                    >
                      <span>{a.icon}</span>
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 4: Smart questions */}
              <div>
                <p className="text-[12px] font-bold mb-2.5 uppercase" style={sectionHeaderStyle}>🤖 اسأل المحاسب</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {smartQuestions.map(q => (
                    <button
                      key={q.label}
                      onClick={() => onSelect(q.label)}
                      className="rounded-2xl flex items-center gap-2.5 px-3.5 py-3.5 active:scale-[0.97] transition-all hover:border-[#0A2342] hover:bg-[#EFF6FF]"
                      style={{ background: "white", border: "1.5px solid #E2E8F0", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                    >
                      <span className="text-lg">{q.icon}</span>
                      <span className="text-[13px] font-bold">{q.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 5: Advanced */}
              <div>
                <p className="text-[12px] font-bold mb-2.5 uppercase" style={sectionHeaderStyle}>⚙️ أوامر متقدمة</p>
                <div className="space-y-0">
                  {advancedCommands.map((cmd, i) => (
                    <button
                      key={cmd.label}
                      onClick={() => onSelect(cmd.label)}
                      className="w-full h-12 flex items-center gap-2.5 px-2 text-[14px] active:bg-[#F8FAFC] transition-colors"
                      style={{
                        borderBottom: i < advancedCommands.length - 1 ? "1px solid #F8FAFC" : "none",
                        color: "#0A2342",
                        fontFamily: "Tajawal, sans-serif",
                      }}
                    >
                      <span>{cmd.icon}</span>
                      <span>{cmd.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CommandsSheet;
