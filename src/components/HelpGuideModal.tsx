import { useState } from "react";
import { X, Sparkles, AtSign, Banknote, Users, BarChart3, CheckCircle2, BookOpen, ChevronDown, MessageCircle, Hash, Package, UserPlus, FolderPlus } from "lucide-react";

interface HelpGuideModalProps {
  open: boolean;
  onClose: () => void;
  onFillInput?: (text: string, target: "assistant" | "command") => void;
}

const ExampleChip = ({ text, onClick, featured }: { text: string; onClick: () => void; featured?: boolean }) => (
  <button
    onClick={onClick}
    className={`text-right px-3 py-2 rounded-xl text-[11px] transition-all active:scale-95 border ${
      featured
        ? "bg-primary/10 text-primary font-semibold border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.15)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.25)]"
        : "bg-secondary/80 text-foreground hover:bg-primary/10 hover:text-primary border-border/50"
    }`}
  >
    {text.split(/(@\S+)/g).map((part, i) =>
      part.startsWith("@") ? <span key={i} className="text-primary font-bold">{part}</span> : part
    )}
  </button>
);

const ExpandButton = ({ expanded, onClick, count }: { expanded: boolean; onClick: () => void; count: number }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1 text-[10px] text-primary font-medium hover:underline transition-all"
  >
    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
    {expanded ? "عرض أقل" : `عرض المزيد (${count})`}
  </button>
);

const HelpGuideModal = ({ open, onClose, onFillInput }: HelpGuideModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [expandFinancial, setExpandFinancial] = useState(false);
  const [expandDefinitions, setExpandDefinitions] = useState(false);

  if (!open) return null;

  const handleExampleClick = (text: string, target: "assistant" | "command") => {
    onFillInput?.(text.replace(/@/g, ""), target);
    if (dontShowAgain) localStorage.setItem("help_guide_dismissed", "true");
    onClose();
  };

  const handleClose = () => {
    if (dontShowAgain) localStorage.setItem("help_guide_dismissed", "true");
    onClose();
  };

  const mainFinancialExamples = [
    { text: "قبضت من @محمد 5000 شيكل", target: "assistant" as const },
    { text: "دفعت إيجار 2500 من البنك", target: "assistant" as const },
    { text: "اشتريت 50 قطعة @سجاد سعر القطعة 120", target: "assistant" as const },
    { text: "استلمت شيك من @أحمد 4000 بتاريخ 1/3", target: "assistant" as const },
    { text: "سجل فاتورة لـ @سليم 12000 على الحساب", target: "assistant" as const },
  ];

  const moreFinancialExamples = [
    { text: "أسست المشروع برأس مال 50000 شيكل نقداً", target: "assistant" as const },
    { text: "حطيت رأس مال 20000 في البنك", target: "assistant" as const },
    { text: "نقلت 10000 من الصندوق للبنك", target: "assistant" as const },
    { text: "اشتريت كمبيوتر بـ 3500 شيكل نقداً", target: "assistant" as const },
    { text: "اشتريت ماكينة بـ 20000 دفعت 5000 والباقي على الحساب", target: "assistant" as const },
    { text: "اشتريت بضاعة من @شركة_النور بـ 8000 على الحساب", target: "assistant" as const },
    { text: "بعت 3 قطع @سجاد بسعر 150 للقطعة نقداً", target: "assistant" as const },
    { text: "قبضت من @محمد 1500 شيكل نقداً", target: "assistant" as const },
    { text: "استلمت من @سليم 3000 تحويل بنك", target: "assistant" as const },
    { text: "أودعت شيك @أحمد في البنك", target: "assistant" as const },
    { text: "دفعت لـ @شركة_النور 3000 من البنك", target: "assistant" as const },
    { text: "دفعت كهرباء 300 شيكل", target: "assistant" as const },
    { text: "حولت 2000 من البنك للصندوق", target: "assistant" as const },
  ];

  const mainDefinitionExamples = [
    { text: "أضف زبون @محمد", target: "command" as const },
    { text: "أضف مورد @شركة_النور", target: "command" as const },
    { text: "أضف منتج @سجاد شراء 80 بيع 120", target: "command" as const },
  ];

  const moreDefinitionExamples = [
    { text: "أضف زبون @محمد، جوال 059xxxx، عنوان نابلس", target: "command" as const },
    { text: "خلي حد ائتمان @محمد 10000", target: "command" as const },
    { text: "أضف مورد @شركة_الشمال", target: "command" as const },
    { text: "أضف منتج @سجاد شراء 80 بيع 120 كمية 200", target: "command" as const },
    { text: "أضف حساب مصروف تسويق", target: "command" as const },
    { text: "خلي حساب مصروف تسويق ضمن المصاريف التشغيلية", target: "command" as const },
  ];

  const reportExamples = [
    { text: "اعرض أرباح وخسائر هذا الشهر", target: "assistant" as const },
    { text: "كشف حساب @محمد", target: "assistant" as const },
    { text: "اعرض الذمم المتأخرة", target: "assistant" as const },
    { text: "شو وضعي المالي اليوم؟", target: "assistant" as const },
  ];

  const rules = [
    { icon: MessageCircle, text: "احكي طبيعي وبساطة" },
    { icon: Hash, text: "اذكر المبلغ دائماً" },
    { icon: Users, text: "حدد من / لـ" },
    { icon: AtSign, text: "استخدم @ لتجنب الأخطاء" },
    { icon: Banknote, text: "اذكر التاريخ إذا شيك" },
    { icon: Package, text: "اذكر الكمية والسعر إذا بضاعة" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={handleClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] bg-card rounded-t-[20px] sm:rounded-[20px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/50 px-5 pt-5 pb-4">
          <button onClick={handleClose} className="absolute left-4 top-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-destructive/10 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">دليل المساعد المالي الذكي</h2>
          </div>
          <p className="text-xs text-muted-foreground">اكتب أو احكي ببساطة… وسأتولى الباقي</p>
          <p className="text-[11px] text-primary font-medium mt-1">سجل أي عملية خلال 5 ثواني فقط ⚡</p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Featured Example */}
          <button
            onClick={() => handleExampleClick("قبضت من @محمد 5000 شيكل نقداً", "assistant")}
            className="w-full p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 text-center space-y-2 hover:bg-primary/10 transition-all active:scale-[0.98] shadow-[0_0_20px_hsl(var(--primary)/0.1)] animate-[pulse_3s_ease-in-out_infinite]"
            style={{ animationName: "none" }}
            onMouseEnter={e => e.currentTarget.style.animationName = ""}
          >
            <p className="text-sm font-bold text-foreground">
              قبضت من <span className="text-primary">@محمد</span> 5000 شيكل نقداً
            </p>
            <p className="text-[10px] text-muted-foreground">
              استخدم <span className="text-primary font-bold">@</span> لاختيار الاسم الصحيح وربطه تلقائياً
            </p>
          </button>

          {/* Smart @ Section */}
          <div className="p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center gap-2">
              <AtSign className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">استخدم @ لتحديد الاسم بسرعة</h3>
            </div>
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <div className="flex-1 space-y-2">
                <p>عند كتابة <span className="text-primary font-bold">@</span> تظهر اقتراحات:</p>
                <div className="flex flex-wrap gap-1.5">
                  {["زبائن", "موردين", "منتجات", "حسابات"].map(t => (
                    <span key={t} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{t}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1 text-[10px] min-w-fit">
                <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /><span>الربط تلقائي</span></div>
                <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /><span>يمنع الأخطاء</span></div>
                <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /><span>يسرّع الإدخال</span></div>
              </div>
            </div>
          </div>

          {/* Financial Commands */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">أوامر مالية</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mainFinancialExamples.map(ex => (
                <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
              ))}
            </div>
            {expandFinancial && (
              <div className="flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                {moreFinancialExamples.map(ex => (
                  <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
                ))}
              </div>
            )}
            <ExpandButton expanded={expandFinancial} onClick={() => setExpandFinancial(!expandFinancial)} count={moreFinancialExamples.length} />
          </div>

          {/* Definition Commands */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">أوامر تعريفية</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mainDefinitionExamples.map(ex => (
                <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
              ))}
            </div>
            {expandDefinitions && (
              <div className="flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                {moreDefinitionExamples.map(ex => (
                  <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
                ))}
              </div>
            )}
            <ExpandButton expanded={expandDefinitions} onClick={() => setExpandDefinitions(!expandDefinitions)} count={moreDefinitionExamples.length} />
          </div>

          {/* Reports - Compact pills */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">تقارير وتحليل</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reportExamples.map(ex => (
                <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">قواعد سريعة</h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {rules.map(rule => (
                <div key={rule.text} className="flex items-center gap-2 text-[11px] text-foreground">
                  <rule.icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span>{rule.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border/50 px-5 py-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-[11px] text-muted-foreground">لا تظهر مرة أخرى</span>
          </label>
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all active:scale-[0.98]"
          >
            جرب الآن ✨
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpGuideModal;
