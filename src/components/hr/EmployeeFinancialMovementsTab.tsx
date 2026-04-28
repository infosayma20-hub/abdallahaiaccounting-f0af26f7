import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Search, Info } from "lucide-react";
import { formatCurrency } from "@/lib/hr-utils";
import {
  useEmployeeMovements,
  MOVEMENT_CATEGORIES,
  tCategory,
  type EmployeeMovement,
} from "@/hooks/hr/useEmployeeFinancialMovements";

interface Props {
  employeeId: string;
  employeeName: string;
  userId: string;
}

const monthNames = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

/* -------------------------------------------------------------------------- */
/*  Source labels (single source of truth — must mirror Payroll Preview)      */
/* -------------------------------------------------------------------------- */
const SOURCE_META: Record<string, { label: string; icon: string }> = {
  hr_manual: { label: "إدخال HR يدوي", icon: "✏️" },
  finance_manual: { label: "سند صرف", icon: "🧾" },
  pos_meal: { label: "وجبة POS", icon: "🍽️" },
  pos_shortage: { label: "عجز/فائض الكاشير", icon: "⚖️" },
  pos_sale_credit: { label: "بيع POS على الحساب", icon: "📦" },
  hr_advance: { label: "سلفة HR", icon: "💰" },
  salary_deduction: { label: "خصم تأديبي", icon: "📋" },
  insurance: { label: "تأمين", icon: "🏥" },
  tax: { label: "ضريبة", icon: "🏛️" },
  system: { label: "نظام", icon: "⚙️" },
};
const sourceMeta = (s: string | null) =>
  SOURCE_META[String(s || "")] || { label: s || "غير معروف", icon: "📄" };

/**
 * Categories that ARE actually deducted (or credited) in payroll.
 * Anything outside this set (i.e. `other` / NULL) shows as informational only —
 * never auto-applied to net salary. Mirrors usePayrollPreview.categorizeMovement.
 */
const DEDUCTIBLE_CATEGORIES = new Set([
  "food", "transport", "advance", "loan_installment",
  "penalty", "purchase", "cash_shortage", "cash_surplus",
  "adjustment", "previous_balance",
]);
const isDeductible = (cat: string | null) =>
  !!cat && DEDUCTIBLE_CATEGORIES.has(cat);
const isUnclassified = (cat: string | null) =>
  !cat || cat === "other";

export default function EmployeeFinancialMovementsTab({
  employeeId,
  employeeName,
}: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [category, setCategory] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [direction, setDirection] = useState<"all" | "debit" | "credit">("all");
  const [search, setSearch] = useState("");

  // Date window from month/year — use exclusive end-of-month
  const { from, to } = useMemo(() => {
    const mm = String(month).padStart(2, "0");
    const last = new Date(year, month, 0).getDate(); // last day of month
    return {
      from: `${year}-${mm}-01`,
      to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
    };
  }, [month, year]);

  const { data: movements = [], isLoading } = useEmployeeMovements(employeeId, {
    from,
    to,
    category: category === "all" ? null : category,
    direction,
  });

  /* ---------------- Client-side text + source filter ---------------- */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (source !== "all" && (m.source_type || "") !== source) return false;
      if (!term) return true;
      const hay = [
        m.description,
        m.reference_number,
        m.notes,
        m.source_reference,
        tCategory(m.category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [movements, search, source]);

  /* ---------------- KPIs (from full month, not filtered) ---------------- */
  const kpis = useMemo(() => {
    const sumBy = (pred: (m: EmployeeMovement) => boolean) =>
      movements
        .filter(pred)
        .reduce((s, m) => s + Number(m.amount || 0), 0);

    const totalDebit = sumBy((m) => m.movement_type === "debit");
    const totalCredit = sumBy((m) => m.movement_type === "credit");
    const deductible = sumBy(
      (m) => m.movement_type === "debit" && isDeductible(m.category),
    );
    const informational = sumBy(
      (m) => m.movement_type === "debit" && isUnclassified(m.category),
    );
    const unclassifiedCount = movements.filter((m) =>
      isUnclassified(m.category),
    ).length;

    return { totalDebit, totalCredit, deductible, informational, unclassifiedCount };
  }, [movements]);

  /* ---------------- Render helpers ---------------- */
  const statusBadge = (s: string | null) => {
    if (s === "approved")
      return <Badge className="text-[10px]">✅ معتمد</Badge>;
    if (s === "pending")
      return (
        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          🟡 قيد المراجعة
        </Badge>
      );
    if (s === "deducted")
      return <Badge variant="outline" className="text-[10px]">💸 خُصم</Badge>;
    if (s === "rejected")
      return <Badge variant="destructive" className="text-[10px]">❌ مرفوض</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{s || "—"}</Badge>;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header + month picker */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-foreground">
            الحركات المالية — {employeeName}
          </h3>
          <div className="flex gap-2 items-center">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-20 h-8 text-xs"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Unclassified warning banner */}
        {kpis.unclassifiedCount > 0 && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-300 text-sm">
              يوجد {kpis.unclassifiedCount} حركة غير مصنفة
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
              هذه الحركات <b>لن تُخصم تلقائياً</b> من الراتب. راجعها وصنّفها يدوياً
              لضمان دقّة احتساب صافي الراتب.
              <Button
                variant="link"
                className="text-amber-800 dark:text-amber-200 px-1 h-auto text-xs"
                onClick={() => setCategory("unclassified")}
              >
                عرض غير المصنفة فقط ←
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground">إجمالي مدين (خصم)</p>
            <p className="text-sm font-bold text-destructive">
              {formatCurrency(kpis.totalDebit)}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground">إجمالي دائن (لصالحه)</p>
            <p className="text-sm font-bold text-emerald-600">
              {formatCurrency(kpis.totalCredit)}
            </p>
          </Card>
          <Card className="p-3 border-emerald-200 dark:border-emerald-800/40">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              يُخصم فعلياً من الراتب
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  مجموع الحركات المدينة المصنّفة بفئة معتمدة
                  (وجبات / مواصلات / سلف / أقساط / مخالفات / مشتريات / تسويات).
                </TooltipContent>
              </Tooltip>
            </p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(kpis.deductible)}
            </p>
          </Card>
          <Card className="p-3 border-amber-200 dark:border-amber-800/40">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              معلوماتية فقط (لا تُخصم)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  حركات غير مصنفة أو فئة "أخرى". تظهر للمراجعة فقط
                  ولا تؤثر على صافي الراتب.
                </TooltipContent>
              </Tooltip>
            </p>
            <p className="text-sm font-bold text-amber-600">
              {formatCurrency(kpis.informational)}
            </p>
          </Card>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 text-xs pr-7"
              placeholder="بحث في البيان / المرجع / الملاحظات…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              <SelectItem value="unclassified">⚠️ غير مصنفة</SelectItem>
              {MOVEMENT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المصدر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المصادر</SelectItem>
              {Object.entries(SOURCE_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الاتجاه" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">مدين + دائن</SelectItem>
              <SelectItem value="debit">مدين فقط (خصم)</SelectItem>
              <SelectItem value="credit">دائن فقط (لصالحه)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المصدر</TableHead>
              <TableHead className="text-right">الفئة</TableHead>
              <TableHead className="text-right">البيان / المرجع</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">يُخصم؟</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  جاري التحميل…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  لا توجد حركات مطابقة لهذه الفلاتر.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const src = sourceMeta(m.source_type);
                const unclassified = isUnclassified(m.category);
                return (
                  <TableRow
                    key={m.id}
                    className={unclassified ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}
                  >
                    <TableCell className="text-xs whitespace-nowrap">
                      {m.movement_date}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {src.icon} {src.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={unclassified ? "outline" : "secondary"}
                        className={`text-[10px] ${
                          unclassified
                            ? "border-amber-400 text-amber-700 dark:text-amber-400"
                            : ""
                        }`}
                      >
                        {tCategory(m.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <div className="truncate">{m.description || "—"}</div>
                      {m.reference_number && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          مرجع: {m.reference_number}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className={`font-medium text-xs whitespace-nowrap ${
                        m.movement_type === "debit"
                          ? "text-destructive"
                          : "text-emerald-600"
                      }`}
                    >
                      {m.movement_type === "debit" ? "-" : "+"}
                      {formatCurrency(Number(m.amount))}
                    </TableCell>
                    <TableCell>
                      {isDeductible(m.category) ? (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                          نعم
                        </Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                              لا
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[220px]">
                            هذه الحركة لن تؤثر على صافي الراتب
                            لأن فئتها {m.category === "other" ? "«أخرى»" : "غير محددة"}.
                            صنّفها لتدخل ضمن الخصم التلقائي.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <p className="text-[10px] text-muted-foreground text-center">
          المصدر الموحّد: <code>employee_financial_movements</code> — لا قيود
          محاسبية ولا ترحيل تلقائي. الخصم يتم فقط عبر مسير الرواتب.
        </p>
      </div>
    </TooltipProvider>
  );
}