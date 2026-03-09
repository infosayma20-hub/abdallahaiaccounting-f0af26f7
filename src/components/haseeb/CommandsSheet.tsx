import { X, ChevronLeft } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
}

const CommandsSheet = ({ open, onClose, onSelect }: Props) => {
  if (!open) return null;

  const financialCommands = [
    { icon: "💰", label: "قبضت من @..." },
    { icon: "💸", label: "دفعت لـ@..." },
    { icon: "📦", label: "بعت لـ@..." },
    { icon: "🛒", label: "اشتريت من @..." },
    { icon: "🏦", label: "سحبت من البنك" },
    { icon: "💳", label: "أودعت في البنك" },
    { icon: "📋", label: "سند قبض" },
    { icon: "📝", label: "فاتورة" },
  ];

  const reports = [
    { icon: "📈", label: "أرباح وخسائر الشهر" },
    { icon: "💳", label: "الذمم المتأخرة" },
    { icon: "🏦", label: "كشف حساب البنك" },
    { icon: "👥", label: "كشف حساب عميل @..." },
    { icon: "📋", label: "آخر 10 معاملات" },
    { icon: "💰", label: "ملخصي المالي اليوم" },
  ];

  const addNew = [
    { icon: "👤", label: "أضف زبون" },
    { icon: "🏭", label: "أضف مورد" },
    { icon: "📦", label: "أضف منتج" },
    { icon: "👷", label: "أضف موظف" },
  ];

  const smartQuestions = [
    { icon: "💧", label: "متى ستنتهي سيولتي؟" },
    { icon: "📊", label: "ما أكثر منتج مربح؟" },
    { icon: "👔", label: "هل أوظف موظفاً؟" },
    { icon: "📈", label: "شو وضعي المالي؟" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-[20px] overflow-y-auto"
        style={{ maxHeight: "60vh", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "#E2E8F0" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-base font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>ماذا تريد؟</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: "#F1F5F9" }}>
            <X className="h-4 w-4" style={{ color: "#8B9BB4" }} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          {/* Section 1: Financial commands */}
          <div>
            <p className="text-[11px] font-bold mb-2 uppercase" style={{ color: "#8B9BB4" }}>⚡ تسجيل عملية</p>
            <div className="grid grid-cols-2 gap-2">
              {financialCommands.map(cmd => (
                <button
                  key={cmd.label}
                  onClick={() => onSelect(cmd.label)}
                  className="h-[52px] rounded-xl flex items-center gap-2 px-3 text-[13px] active:scale-[0.97] transition-transform"
                  style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                >
                  <span>{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Reports */}
          <div>
            <p className="text-[11px] font-bold mb-2 uppercase" style={{ color: "#8B9BB4" }}>📊 عرض تقارير</p>
            <div className="space-y-0.5">
              {reports.map(r => (
                <button
                  key={r.label}
                  onClick={() => onSelect(r.label)}
                  className="w-full h-12 flex items-center justify-between px-1 text-sm active:bg-[#F8FAFC] transition-colors"
                  style={{ borderBottom: "1px solid #F1F5F9", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{r.icon}</span>
                    <span>{r.label}</span>
                  </div>
                  <ChevronLeft className="h-3.5 w-3.5" style={{ color: "#8B9BB4" }} />
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Add new */}
          <div>
            <p className="text-[11px] font-bold mb-2 uppercase" style={{ color: "#8B9BB4" }}>✨ إضافة جديدة</p>
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {addNew.map(a => (
                <button
                  key={a.label}
                  onClick={() => onSelect(a.label)}
                  className="flex-shrink-0 h-9 px-3.5 rounded-full text-[13px] active:scale-95 transition-transform"
                  style={{ background: "#F1F5F9", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Smart questions */}
          <div>
            <p className="text-[11px] font-bold mb-2 uppercase" style={{ color: "#8B9BB4" }}>🔮 اسأل المحاسب</p>
            <div className="grid grid-cols-2 gap-2">
              {smartQuestions.map(q => (
                <button
                  key={q.label}
                  onClick={() => onSelect(q.label)}
                  className="h-[52px] rounded-xl flex items-center gap-2 px-3 text-[13px] active:scale-[0.97] transition-transform"
                  style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                >
                  <span>{q.icon}</span>
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CommandsSheet;
