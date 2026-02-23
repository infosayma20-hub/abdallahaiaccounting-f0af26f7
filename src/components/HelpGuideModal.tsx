import { useState } from "react";
import { X, Sparkles, AtSign, Banknote, Users, BarChart3, CheckCircle2, BookOpen, Landmark, ShoppingCart, CreditCard, Receipt, ArrowRightLeft, PiggyBank, Package, UserPlus, FolderPlus } from "lucide-react";

interface HelpGuideModalProps {
  open: boolean;
  onClose: () => void;
  onFillInput?: (text: string, target: "assistant" | "command") => void;
}

const sections = [
  {
    id: "mention",
    icon: AtSign,
    title: "استخدم @ لتحديد الاسم بسرعة",
    highlight: true,
    content: (
      <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
        <p>عند كتابة <span className="text-primary font-bold">@</span> سيظهر لك اقتراحات:</p>
        <div className="flex flex-wrap gap-1.5">
          {["زبائن", "موردين", "منتجات", "حسابات"].map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{t}</span>
          ))}
        </div>
        <p>عند اختيار الاسم يتم الربط تلقائياً مع السجل الصحيح — يمنع الأخطاء ويسرّع الإدخال.</p>
      </div>
    ),
    examples: [
      { text: 'قبضت من @محمد 5000 شيكل', target: "assistant" as const },
      { text: 'اشتريت 100 كيلو من @شركة_النور', target: "assistant" as const },
      { text: 'بعت 3 قطع من @سجاد', target: "assistant" as const },
    ],
  },
  {
    id: "financial",
    icon: Banknote,
    title: "أوامر مالية",
    subsections: [
      {
        icon: Landmark, label: "تأسيس ورأس المال",
        examples: [
          { text: "أسست المشروع برأس مال 50000 شيكل نقداً", target: "assistant" as const },
          { text: "حطيت رأس مال 20000 في البنك", target: "assistant" as const },
          { text: "نقلت 10000 من الصندوق للبنك", target: "assistant" as const },
        ],
      },
      {
        icon: Package, label: "شراء معدات",
        examples: [
          { text: "اشتريت كمبيوتر بـ 3500 شيكل نقداً", target: "assistant" as const },
          { text: "اشتريت ماكينة بـ 20000 دفعت 5000 والباقي على الحساب", target: "assistant" as const },
        ],
      },
      {
        icon: ShoppingCart, label: "مشتريات",
        examples: [
          { text: "اشتريت بضاعة من @شركة_النور بـ 8000 على الحساب", target: "assistant" as const },
          { text: "اشتريت 50 قطعة @سجاد سعر القطعة 120", target: "assistant" as const },
        ],
      },
      {
        icon: Receipt, label: "مبيعات",
        examples: [
          { text: "بعت 3 قطع @سجاد بسعر 150 للقطعة نقداً", target: "assistant" as const },
          { text: "سجل فاتورة للزبون @محمد 12000 على الحساب", target: "assistant" as const },
        ],
      },
      {
        icon: PiggyBank, label: "قبض ودفع",
        examples: [
          { text: "قبضت من @محمد 1500 شيكل نقداً", target: "assistant" as const },
          { text: "استلمت من @سليم 3000 تحويل بنك", target: "assistant" as const },
          { text: "دفعت لـ @شركة_النور 3000 من البنك", target: "assistant" as const },
        ],
      },
      {
        icon: CreditCard, label: "شيكات",
        examples: [
          { text: "استلمت شيك من @أحمد 4000 بتاريخ 1/3", target: "assistant" as const },
          { text: "أودعت شيك @أحمد في البنك", target: "assistant" as const },
        ],
      },
      {
        icon: ArrowRightLeft, label: "مصاريف وتحويل",
        examples: [
          { text: "دفعت إيجار 2500 من البنك", target: "assistant" as const },
          { text: "دفعت كهرباء 300 شيكل", target: "assistant" as const },
          { text: "حولت 2000 من البنك للصندوق", target: "assistant" as const },
        ],
      },
    ],
  },
  {
    id: "definitions",
    icon: Users,
    title: "أوامر تعريفية",
    subsections: [
      {
        icon: UserPlus, label: "زبائن وموردين",
        examples: [
          { text: "أضف زبون @محمد، جوال 059xxxx، عنوان نابلس", target: "command" as const },
          { text: "خلي حد ائتمان @محمد 10000", target: "command" as const },
          { text: "أضف مورد @شركة_الشمال", target: "command" as const },
        ],
      },
      {
        icon: Package, label: "منتجات",
        examples: [
          { text: "أضف منتج @سجاد شراء 80 بيع 120 كمية 200", target: "command" as const },
        ],
      },
      {
        icon: FolderPlus, label: "حسابات",
        examples: [
          { text: "أضف حساب مصروف تسويق", target: "command" as const },
          { text: "خلي حساب مصروف تسويق ضمن المصاريف التشغيلية", target: "command" as const },
        ],
      },
    ],
  },
  {
    id: "reports",
    icon: BarChart3,
    title: "تقارير وتحليل",
    examples: [
      { text: "اعرض أرباح وخسائر هذا الشهر", target: "assistant" as const },
      { text: "اعرض الذمم المتأخرة", target: "assistant" as const },
      { text: "كشف حساب @محمد", target: "assistant" as const },
      { text: "شو وضعي المالي اليوم؟", target: "assistant" as const },
      { text: "اعرض المخزون والكميات", target: "assistant" as const },
    ],
  },
  {
    id: "rules",
    icon: CheckCircle2,
    title: "قواعد سريعة",
    highlight: true,
    content: (
      <div className="grid grid-cols-2 gap-2">
        {[
          "احكي طبيعي",
          "اذكر المبلغ",
          "حدد طريقة الدفع",
          "إذا شيك اذكر التاريخ",
          "استخدم @ لتحديد الاسم",
          "إذا بضاعة اذكر الكمية والسعر",
        ].map(rule => (
          <div key={rule} className="flex items-center gap-1.5 text-[11px] text-foreground">
            <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
            <span>{rule}</span>
          </div>
        ))}
      </div>
    ),
  },
];

const ExampleChip = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="text-right px-3 py-2 rounded-xl bg-secondary/80 text-[11px] text-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-border/50"
  >
    {text.split(/(@\S+)/g).map((part, i) =>
      part.startsWith("@") ? <span key={i} className="text-primary font-bold">{part}</span> : part
    )}
  </button>
);

const HelpGuideModal = ({ open, onClose, onFillInput }: HelpGuideModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] bg-card rounded-t-[20px] sm:rounded-[20px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/50 px-5 pt-5 pb-4">
          <button onClick={handleClose} className="absolute left-4 top-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-destructive/10 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">دليل استخدام المساعد المالي الذكي</h2>
          </div>
          <p className="text-xs text-muted-foreground">اكتب أو احكي ببساطة… وسأتولى الباقي</p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`space-y-3 ${section.highlight ? "p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5" : ""}`}
            >
              {/* Section Header */}
              <div className="flex items-center gap-2">
                <section.icon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
              </div>

              {/* Custom content */}
              {section.content}

              {/* Top-level examples */}
              {section.examples && (
                <div className="flex flex-wrap gap-2">
                  {section.examples.map((ex) => (
                    <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
                  ))}
                </div>
              )}

              {/* Subsections */}
              {section.subsections?.map((sub) => (
                <div key={sub.label} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <sub.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground">{sub.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sub.examples.map((ex) => (
                      <ExampleChip key={ex.text} text={ex.text} onClick={() => handleExampleClick(ex.text, ex.target)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Sticky Footer */}
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
