import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap,
  Users,
  Wallet,
  BookOpen,
  UserCheck,
  CalendarDays,
  Truck,
  FileSpreadsheet,
  Search,
  ChevronLeft,
  Download,
  Upload,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * الإدخال السريع (Quick Import) — Dynamics FinanceShell-inspired split view.
 * Left rail: categorized list of Excel-importable modules.
 * Right pane: description of the selected module + steps + open action.
 */

type ImportItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  category: string;
  to: string;
  steps: string[];
  badge?: string;
};

const items: ImportItem[] = [
  {
    id: "payroll",
    title: "تثبيت الرواتب",
    description:
      "تثبيت رواتب كل الموظفين دفعة واحدة بقيد مركّب من حساب مصروف الرواتب إلى ذمة كل موظف على حدة.",
    icon: Wallet,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    category: "الموارد البشرية",
    to: "/payroll/bulk-import",
    steps: [
      "حمّل قالب Excel الذي يحتوي على أسماء الموظفين النشطين.",
      "عبّي عمود «الراتب المثبت» لكل موظف.",
      "اختر حساب مصروف الرواتب (مدين) والتاريخ.",
      "ارفع الملف واستعرض القيد قبل التثبيت.",
      "ثبّت القيد وتُنشأ حسابات فرعية للموظفين تلقائياً.",
    ],
    badge: "قيد مركّب",
  },
  {
    id: "opening-balances",
    title: "الأرصدة الافتتاحية",
    description:
      "استيراد أرصدة العملاء والموردين والحسابات من ملف Excel كأرصدة افتتاحية دفعة واحدة.",
    icon: BookOpen,
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    category: "المحاسبة",
    to: "/opening-balances-import",
    steps: [
      "حمّل قالب الأرصدة الافتتاحية.",
      "عبّي الأرصدة مقابل كل حساب أو جهة.",
      "ارفع الملف واستعرض التسويات.",
      "ثبّت الدفعة الافتتاحية.",
    ],
  },
  {
    id: "monthly-payroll-inputs",
    title: "مدخلات الرواتب الشهرية",
    description:
      "استيراد إضافات وخصومات الشهر (بدلات، سلف، ساعات إضافية) قبل احتساب الرواتب.",
    icon: CalendarDays,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    category: "الموارد البشرية",
    to: "/payroll/inputs",
    steps: [
      "حمّل قالب المدخلات الشهرية.",
      "عبّي البدلات والخصومات والإضافي لكل موظف.",
      "ارفع الملف وراجع القيم.",
      "احفظ لاحتسابها في كشف الرواتب.",
    ],
  },
  {
    id: "accounts",
    title: "شجرة الحسابات",
    description:
      "استيراد أو تعديل شجرة الحسابات من ملف Excel مع الحفاظ على الحسابات المحمية.",
    icon: FileSpreadsheet,
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    category: "المحاسبة",
    to: "/accounts?import=1",
    steps: [
      "افتح شجرة الحسابات.",
      "حمّل الشجرة الحالية كقالب.",
      "أضف أو عدّل الحسابات في Excel.",
      "ارفع الملف — الحسابات المحمية لا تتأثر.",
    ],
  },
  {
    id: "employees",
    title: "الموظفين",
    description: "استيراد قائمة الموظفين مع بياناتهم الأساسية والرواتب الأساسية.",
    icon: Users,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    category: "الموارد البشرية",
    to: "/employees?import=1",
    steps: [
      "افتح صفحة الموظفين.",
      "اضغط زر استيراد Excel.",
      "حمّل القالب وعبّي البيانات.",
      "ارفع الملف واستعرض قبل الحفظ.",
    ],
  },
  {
    id: "leave-balances",
    title: "أرصدة الإجازات",
    description: "تحديث أرصدة الإجازات السنوية والمرضية لكل الموظفين من ملف Excel.",
    icon: UserCheck,
    accent: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    category: "الموارد البشرية",
    to: "/leaves?import=1",
    steps: [
      "افتح مركز الإجازات.",
      "اضغط استيراد أرصدة الإجازات.",
      "حمّل القالب وعبّي الأرصدة.",
      "ارفع الملف لتحديث الأرصدة.",
    ],
  },
  {
    id: "import-shipment",
    title: "شحنة استيراد",
    description: "استيراد بنود شحنة (فاتورة مورد خارجي) وتوزيع التكاليف على المنتجات.",
    icon: Truck,
    accent: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    category: "المشتريات",
    to: "/purchases/import/new",
    steps: [
      "افتح صفحة شحنات الاستيراد.",
      "أنشئ شحنة جديدة.",
      "ارفع ملف بنود الشحنة.",
      "وزّع التكاليف وثبّت الشحنة.",
    ],
  },
  {
    id: "stock-doc-in",
    title: "سند إدخال بضاعة (إكسل)",
    description:
      "رفع كميات إدخال من ملف إكسل ضمن سند موثّق — يزيد كميات المخزون في المستودع المحدد عند التأكيد.",
    icon: Boxes,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    category: "المخزون",
    to: "/stock-documents/new?type=in",
    steps: [
      "افتح سند إدخال جديد واختر المستودع والتاريخ.",
      "حمّل قالب الإكسل (رقم الصنف / الاسم / الكمية / التكلفة).",
      "ارفع الملف — تُطابق الأصناف بالرقم أو الباركود أو الاسم.",
      "راجع البنود ثم أكّد السند لتُسجَّل حركات المخزون.",
    ],
    badge: "جرد أسبوعي",
  },
  {
    id: "stock-doc-out",
    title: "سند إخراج بضاعة (إكسل)",
    description:
      "رفع كميات إخراج (تالف، هدر، صرف داخلي) من ملف إكسل ضمن سند موثّق يخفّض كميات المخزون عند التأكيد.",
    icon: Boxes,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    category: "المخزون",
    to: "/stock-documents/new?type=out",
    steps: [
      "افتح سند إخراج جديد واختر المستودع والتاريخ.",
      "حمّل قالب الإكسل وعبّي الكميات.",
      "ارفع الملف وراجع البنود.",
      "أكّد السند لتُخصم الكميات من المستودع.",
    ],
  },
];

const categories = ["الكل", "المحاسبة", "الموارد البشرية", "المشتريات", "المخزون"];


export default function QuickImportPage() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string>(items[0].id);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const matchCat = category === "الكل" || i.category === category;
      const matchQ =
        !query.trim() ||
        i.title.includes(query) ||
        i.description.includes(query) ||
        i.category.includes(query);
      return matchCat && matchQ;
    });
  }, [query, category]);

  const selected = items.find((i) => i.id === selectedId) || items[0];
  const Icon = selected.icon;

  useEffect(() => {
    const prev = document.title;
    document.title = "الإدخال السريع | المالية";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/accounting-center"))}
          className="rounded-xl p-2 hover:bg-muted"
          aria-label="رجوع"
        >
          <ChevronLeft className="h-5 w-5 -scale-x-100" />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold">الإدخال السريع</h1>
          <p className="text-xs text-muted-foreground">
            استورد أي بند من ملف Excel جاهز — رواتب، أرصدة افتتاحية، حسابات، موظفين، وأكثر.
          </p>
        </div>
      </div>

      {/* Dynamics-style split shell */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* ─── Left rail: list ─── */}
        <aside className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 p-3 space-y-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن بند..."
                className="pr-8 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    category === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <ul className="max-h-[560px] overflow-y-auto p-1.5">
            {filtered.map((i) => {
              const active = i.id === selectedId;
              const IIcon = i.icon;
              return (
                <li key={i.id}>
                  <button
                    onClick={() => setSelectedId(i.id)}
                    className={`flex w-full items-start gap-3 rounded-lg p-2.5 text-right transition-colors ${
                      active
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/60 border border-transparent"
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${i.accent}`}>
                      <IIcon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                          {i.title}
                        </p>
                        {i.badge && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{i.badge}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{i.category}</p>
                    </div>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">لا توجد نتائج</li>
            )}
          </ul>
        </aside>

        {/* ─── Right pane: details ─── */}
        <main className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 p-5">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${selected.accent}`}>
                <Icon className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{selected.title}</h2>
                  {selected.badge && <Badge variant="secondary">{selected.badge}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{selected.category}</p>
                <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{selected.description}</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">خطوات الاستيراد</h3>
            <ol className="space-y-2">
              {selected.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground/90">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 p-4">
            <Button variant="outline" onClick={() => navigate(selected.to)}>
              <Download className="ml-1 h-4 w-4" />
              تحميل القالب
            </Button>
            <Button onClick={() => navigate(selected.to)}>
              <Upload className="ml-1 h-4 w-4" />
              فتح صفحة الاستيراد
              <ArrowLeft className="mr-1 h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
