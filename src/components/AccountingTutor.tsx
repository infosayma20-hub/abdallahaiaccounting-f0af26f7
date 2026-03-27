import { useState, useEffect, useMemo } from "react";
import { GraduationCap, ChevronDown, ChevronUp, Lightbulb, BookOpen, HelpCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface GlossaryItem {
  term: string;
  termEn: string;
  definition: string;
  example?: string;
  relatedAccounts?: string;
}

const GLOSSARY: GlossaryItem[] = [
  { term: "القيد المزدوج", termEn: "Double Entry", definition: "كل عملية مالية يجب أن تسجل في حسابين: مدين ودائن بنفس المبلغ. هذا يضمن توازن الميزانية دائماً.", example: "بعت بضاعة نقداً: الصندوق (مدين) ← الإيرادات (دائن)", relatedAccounts: "جميع الحسابات" },
  { term: "المدين والدائن", termEn: "Debit & Credit", definition: "المدين = ما يدخل أو يزيد (الأصول والمصروفات). الدائن = ما يخرج أو ينقص (الالتزامات والإيرادات).", example: "دفعت إيجار: المصروفات مدينة (زادت)، الصندوق دائن (نقص)" },
  { term: "ميزان المراجعة", termEn: "Trial Balance", definition: "تقرير يعرض أرصدة جميع الحسابات في لحظة معينة. إذا تساوى المدين والدائن = حساباتك صحيحة.", example: "مجموع المدين = مجموع الدائن = دليل على صحة التسجيل" },
  { term: "الميزانية العمومية", termEn: "Balance Sheet", definition: "صورة مالية للشركة في لحظة: الأصول = الالتزامات + حقوق الملكية. تخبرك بما تملك وما عليك.", relatedAccounts: "1000-3000" },
  { term: "قائمة الدخل", termEn: "Income Statement", definition: "تقرير يوضح أداء الشركة خلال فترة: الإيرادات - المصروفات = صافي الربح أو الخسارة.", relatedAccounts: "4000-5000" },
  { term: "التدفق النقدي", termEn: "Cash Flow", definition: "حركة النقد الفعلي: كم دخل وكم خرج. شركة رابحة قد تعاني من نقص سيولة!", example: "بعت بالآجل = ربح بدون نقد فوري" },
  { term: "الذمم المدينة", termEn: "Accounts Receivable", definition: "المبالغ المستحقة لك من الزبائن. بعت بالآجل = الزبون مدين لك.", relatedAccounts: "1130" },
  { term: "الذمم الدائنة", termEn: "Accounts Payable", definition: "المبالغ المستحقة عليك للموردين. اشتريت بالآجل = أنت مدين للمورد.", relatedAccounts: "2110" },
  { term: "الإهلاك", termEn: "Depreciation", definition: "توزيع تكلفة الأصل الثابت على سنوات عمره الإنتاجي. سيارة بـ100,000 عمرها 5 سنوات = 20,000 سنوياً.", example: "مصروف إهلاك (مدين) ← مجمع الإهلاك (دائن)" },
  { term: "رأس المال العامل", termEn: "Working Capital", definition: "الأصول المتداولة - الالتزامات المتداولة. يقيس قدرتك على تغطية التزاماتك قصيرة الأجل.", example: "إذا كان سالباً = قد تواجه صعوبة في الدفع" },
  { term: "نقطة التعادل", termEn: "Break-even Point", definition: "النقطة التي تتساوى فيها الإيرادات مع التكاليف. بعدها كل شيكل إضافي = ربح صافي.", example: "تكاليف ثابتة 10,000 + هامش ربح 50% = تحتاج مبيعات 20,000" },
  { term: "سند القيد", termEn: "Journal Entry", definition: "المستند الذي يوثق العملية المالية بتفاصيلها: التاريخ، الحسابات، المبلغ، والوصف.", example: "قيد تسوية نهاية الشهر لتسجيل مصاريف مستحقة" },
];

const AccountingTutor = () => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"tips" | "glossary" | "quiz">("tips");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("transactions")
      .select("debit_account_code, credit_account_code, transaction_type")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .limit(500)
      .then(({ data }) => setTransactions(data || []));
  }, [user]);

  // Contextual tips based on user's actual data
  const contextualTips = useMemo(() => {
    const tips: { icon: string; title: string; tip: string; priority: number }[] = [];

    const hasReceivables = transactions.some((t) => t.debit_account_code === "1130");
    const hasPayables = transactions.some((t) => t.credit_account_code === "2110");
    const hasCheques = transactions.some((t) => t.transaction_type?.includes("cheque"));
    const hasSales = transactions.some((t) => t.credit_account_code?.startsWith("4"));
    const hasExpenses = transactions.some((t) => t.debit_account_code?.startsWith("5"));

    if (hasReceivables) {
      tips.push({ icon: "💡", title: "إدارة الذمم المدينة", tip: "لديك مبيعات آجلة. تابع تحصيلها بانتظام — القاعدة الذهبية: لا تترك ذمة تتجاوز 30 يوماً بدون متابعة.", priority: 1 });
    }
    if (hasPayables) {
      tips.push({ icon: "📋", title: "إدارة الموردين", tip: "استفد من خصم الدفع المبكر إذا أتاحه المورد. دفع خلال 10 أيام بدل 30 قد يوفر 2-5% من قيمة المشتريات.", priority: 2 });
    }
    if (hasCheques) {
      tips.push({ icon: "📝", title: "متابعة الشيكات", tip: "راقب تواريخ استحقاق الشيكات الصادرة. شيك مرتجع = سمعة متضررة + غرامات بنكية.", priority: 1 });
    }
    if (hasSales && hasExpenses) {
      tips.push({ icon: "📊", title: "تحليل الربحية", tip: "قارن نسبة المصروفات للإيرادات شهرياً. إذا تجاوزت 80% = هامش الربح ضعيف ويحتاج مراجعة.", priority: 2 });
    }

    // General tips always shown
    tips.push(
      { icon: "🔒", title: "إغلاق الفترات", tip: "أغلق الفترة المحاسبية شهرياً لمنع التعديل على قيود قديمة. هذا يحمي دقة تقاريرك.", priority: 3 },
      { icon: "🧮", title: "مطابقة بنكية", tip: "طابق كشف البنك مع سجلاتك أسبوعياً. الفروقات الصغيرة اليوم تصبح مشاكل كبيرة غداً.", priority: 3 },
      { icon: "📁", title: "أرشفة المستندات", tip: "احتفظ بنسخة رقمية من كل فاتورة وإيصال. القانون يتطلب الاحتفاظ بالسجلات 7 سنوات.", priority: 4 },
    );

    return tips.sort((a, b) => a.priority - b.priority).slice(0, 5);
  }, [transactions]);

  // Quiz questions
  const quizQuestions = [
    { q: "ما هو القيد الصحيح عند بيع بضاعة نقداً؟", options: ["مدين: الصندوق / دائن: المبيعات", "مدين: المبيعات / دائن: الصندوق", "مدين: المشتريات / دائن: الصندوق", "مدين: الصندوق / دائن: المشتريات"], correct: 0 },
    { q: "ماذا يعني رصيد مدين في حساب العميل؟", options: ["العميل دفع أكثر مما عليه", "العميل مدين لنا بمبلغ", "نحن مدينون للعميل", "الحساب مغلق"], correct: 1 },
    { q: "أين تظهر الإيرادات؟", options: ["الميزانية العمومية", "قائمة الدخل", "قائمة التدفقات النقدية فقط", "ميزان المراجعة فقط"], correct: 1 },
    { q: "ما معنى أن ميزان المراجعة متوازن؟", options: ["الشركة رابحة", "لا توجد أخطاء محاسبية", "مجموع المدين = مجموع الدائن", "الأصول تساوي الالتزامات"], correct: 2 },
    { q: "كيف يُسجل شراء بضاعة بالآجل؟", options: ["مدين: المشتريات / دائن: ذمم الموردين", "مدين: الصندوق / دائن: المشتريات", "مدين: ذمم الموردين / دائن: المشتريات", "مدين: المخزون / دائن: الصندوق"], correct: 0 },
    { q: "ما هو رأس المال العامل؟", options: ["رأس مال الشركة", "الأصول الثابتة - الالتزامات", "الأصول المتداولة - الالتزامات المتداولة", "صافي الربح السنوي"], correct: 2 },
  ];

  const currentQuiz = quizQuestions[quizIndex % quizQuestions.length];

  const filteredGlossary = searchTerm
    ? GLOSSARY.filter((g) => g.term.includes(searchTerm) || g.termEn.toLowerCase().includes(searchTerm.toLowerCase()) || g.definition.includes(searchTerm))
    : GLOSSARY;

  return (
    <div className="bg-card rounded-2xl p-6 space-y-5 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">المعلم المحاسبي</span>
            <Badge className="mr-2 bg-amber-500/10 text-amber-500 border-0 text-[9px] px-1.5">🎓 تعلّم</Badge>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-secondary/40 rounded-xl p-1">
        {([
          { key: "tips" as const, label: "نصائح", icon: Lightbulb },
          { key: "glossary" as const, label: "قاموس", icon: BookOpen },
          { key: "quiz" as const, label: "اختبر نفسك", icon: HelpCircle },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all ${
              activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tips Tab */}
      {activeTab === "tips" && (
        <div className="space-y-2">
          {contextualTips.slice(0, expanded ? undefined : 3).map((tip, i) => (
            <div key={i} className="flex gap-2.5 bg-secondary/30 rounded-xl p-3 hover:bg-secondary/50 transition-colors">
              <span className="text-base flex-shrink-0 mt-0.5">{tip.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-foreground">{tip.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{tip.tip}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Glossary Tab */}
      {activeTab === "glossary" && (
        <div className="space-y-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث عن مصطلح..."
            className="w-full bg-secondary/40 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 border-0 outline-none"
          />
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {filteredGlossary.slice(0, expanded ? undefined : 5).map((item) => (
              <div key={item.term}>
                <button
                  onClick={() => setExpandedTerm(expandedTerm === item.term ? null : item.term)}
                  className="w-full flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2.5 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{item.term}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">{item.termEn}</span>
                  </div>
                  {expandedTerm === item.term ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedTerm === item.term && (
                  <div className="bg-secondary/20 rounded-b-xl px-4 py-3 -mt-1 space-y-2 animate-fade-in">
                    <p className="text-[11px] text-foreground leading-relaxed">{item.definition}</p>
                    {item.example && (
                      <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">
                          <span className="font-bold text-amber-600 dark:text-amber-400">مثال: </span>
                          {item.example}
                        </p>
                      </div>
                    )}
                    {item.relatedAccounts && (
                      <p className="text-[10px] text-muted-foreground">
                        📌 حسابات ذات صلة: <span className="font-mono font-bold">{item.relatedAccounts}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Tab */}
      {activeTab === "quiz" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">سؤال {(quizIndex % quizQuestions.length) + 1} من {quizQuestions.length}</span>
            <Badge className="bg-amber-500/10 text-amber-500 border-0 text-[10px]">النقاط: {score}</Badge>
          </div>

          <p className="text-xs font-bold text-foreground leading-relaxed">{currentQuiz.q}</p>

          <div className="space-y-2">
            {currentQuiz.options.map((opt, i) => {
              const isSelected = selectedAnswer === i;
              const isCorrect = i === currentQuiz.correct;
              const showResult = selectedAnswer !== null;

              return (
                <button
                  key={i}
                  onClick={() => {
                    if (selectedAnswer !== null) return;
                    setSelectedAnswer(i);
                    if (i === currentQuiz.correct) setScore((s) => s + 1);
                  }}
                  className={`w-full text-right px-3 py-2.5 rounded-xl text-[11px] transition-all border ${
                    showResult && isCorrect
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : showResult && isSelected && !isCorrect
                      ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
                      : "bg-secondary/30 border-transparent hover:bg-secondary/50 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {showResult && isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />}
                    <span>{opt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedAnswer !== null && (
            <button
              onClick={() => { setQuizIndex((i) => i + 1); setSelectedAnswer(null); }}
              className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
            >
              السؤال التالي <ArrowLeft className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountingTutor;
