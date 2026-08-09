import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wallet, Utensils, Banknote, AlertTriangle, Receipt, XCircle, ListFilter,
  Pencil, PiggyBank, Calendar as CalendarIcon, ChevronRight, ChevronLeft,
  Info, FileText, ShoppingCart, Car,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useEmployeeMovements, tCategory, type EmployeeMovement,
} from "@/hooks/hr/useEmployeeFinancialMovements";
import { formatCurrency, safeNum } from "@/lib/employeeFinancialDisplay";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MovementDetailSheet, { infoForCategory } from "./MovementDetailSheet";
import { isCarriedOverJuneAdvance, isLoanDisbursement, isSalaryReturnEntry, isStructuredDeductionCategory } from "@/lib/hr/deductionAuditRules";
import { useCompany } from "@/hooks/useCompanyContext";

interface Props { employeeId: string; }

/**
 * Determine the salary period a movement belongs to.
 * Uses salary_month/salary_year when present; falls back to movement_date.
 * The reason we care: at Malaky (and similar setups), advances/loan
 * installments disbursed early in month N are actually deducted from the
 * salary of month N-1 (paid on the 10th of month N). Showing them under
 * their disbursement month misleads the employee about their next payslip.
 */
function salaryPeriodOf(m: EmployeeMovement): { month: number; year: number } {
  if (m.salary_month && m.salary_year) {
    return { month: Number(m.salary_month), year: Number(m.salary_year) };
  }
  const d = new Date(m.movement_date);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function salaryPeriodKey(m: EmployeeMovement): string {
  const p = salaryPeriodOf(m);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function movementDateKey(m: EmployeeMovement): string {
  const d = new Date(m.movement_date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Wallet chips — كل شريحة تصنّف الحركات المعروضة. عجز/فائض الصندوق مستثناة
 * كلّياً من شاشة الموظف لأن إجراءاتها لا زالت تحت التعديل في الحسابات.
 */
type ChipKey = "all" | "food" | "advance" | "loan" | "penalty" | "purchase" | "transport" | "voucher" | "cashdiff" | "rejected";
const CHIPS: { key: ChipKey; label: string; icon: typeof Utensils }[] = [
  { key: "all",       label: "الكل",          icon: ListFilter },
  { key: "food",      label: "الأكل",         icon: Utensils },
  { key: "advance",   label: "السلف",         icon: Banknote },
  { key: "loan",      label: "القرض الحسن",   icon: PiggyBank },
  { key: "penalty",   label: "المخالفات",     icon: AlertTriangle },
  { key: "purchase",  label: "المشتريات",     icon: ShoppingCart },
  { key: "transport", label: "التوصيل",       icon: Car },
  { key: "voucher",   label: "سندات الصرف",   icon: Receipt },
  { key: "cashdiff",  label: "عجز / فائض",    icon: AlertTriangle },
  { key: "rejected",  label: "الملغاة",       icon: XCircle },
];

/**
 * قواعد الاستبعاد — مطابقة تماماً لشاشة الخصومات (HRDeductionsPage):
 *  1) عجز/فائض مولّد آلياً من إغلاق الورديات (pos_shortage) — يُعتمد قيد المحاسب فقط.
 *  2) صرف الرواتب وتكملة/إرجاع/فرق الراتب — دفعات وليست خصومات.
 */
function isSalaryPayoutRow(description: string = "", reference: string = "", category?: string | null): boolean {
  if (isSalaryReturnEntry(description)) return true;
  if (category !== "loan_installment" && isLoanDisbursement(description)) return true;
  if (isStructuredDeductionCategory(category)) return false;
  const d = String(description || "").trim();
  const ref = String(reference || "").trim();
  if (/^BPV-2026-(0011|0013)$/.test(ref)) return true;
  const isRealDeduction = /(خصم|المخصوم|تخصم|خصمها|سلف|قسط|أقساط|اقساط)/.test(d);
  if (!isRealDeduction && /(رات[بة]|رواتب)/.test(d)) return true;
  if (/^ص\s*[-–—]/.test(d) || d === "ص") return true;
  if (/^رواتب\b/.test(d)) return true;
  if (/صرف\s*رواتب|صرف\s*راتب\s*شهر|رواتب\s*شهر/.test(d)) return true;
  if (/(تكملة|تكمله|مكملة|مكمله|فرق|فروقات|ارجاع|إرجاع|رجيع)\s*رات[بة]/.test(d)) return true;
  return false;
}

/** عجز/فائض الصندوق — يُعرض للموظف بملاحظة «قيد التدقيق» ولا يدخل في أي مجموع. */
function isCashDiffRow(m: EmployeeMovement): boolean {
  if (m.category === "cash_shortage" || m.category === "cash_surplus") return true;
  if (m.source_type === "pos_shortage") return true;
  if (/(عجز|فائض)\s*صندوق/.test(String(m.description || ""))) return true;
  return false;
}

function isExcluded(m: EmployeeMovement, excludeCarriedAdvances: boolean): boolean {
  if (isSalaryPayoutRow(m.description || "", m.source_reference || "", m.category)) return true;
  if (excludeCarriedAdvances && isCarriedOverJuneAdvance(m)) return true;
  return false;
}

/** Classify a movement into the chip taxonomy above. */
function chipOf(m: EmployeeMovement): ChipKey {
  if (m.status === "rejected") return "rejected";
  if (isCashDiffRow(m)) return "cashdiff";
  if (m.source_type === "pos_meal" || m.category === "food") return "food";
  if (m.category === "penalty") return "penalty";
  if (m.category === "loan_installment" || m.source_type === "loan" || /قرض/.test(m.description || "") || /قرض/.test(m.source_reference || "")) return "loan";
  if (m.category === "advance") return "advance";
  if (m.category === "purchase") return "purchase";
  if (m.category === "transport") return "transport";
  // finance_manual entries with an explicit voucher reference are cash disbursements
  if (m.source_type === "finance_manual" && (m.source_reference?.match(/^PV[- ]?/i) || /سند\s*صرف/.test(m.description || ""))) return "voucher";
  return "all";
}

/** لون + أيقونة موحّدة لكل تصنيف — تستعمل في قائمة "تفصيل حسب البند". */
function categoryVisual(cat: string): { icon: typeof Utensils; wrap: string; icn: string; sub: string } {
  switch (cat) {
    case "food":
      return { icon: Utensils,      wrap: "bg-violet-100 dark:bg-violet-950/40", icn: "text-violet-600 dark:text-violet-300", sub: "خصومات وجبات" };
    case "advance":
      return { icon: Banknote,      wrap: "bg-emerald-100 dark:bg-emerald-950/40", icn: "text-emerald-600 dark:text-emerald-300", sub: "سندات صرف" };
    case "loan_installment":
      return { icon: FileText,      wrap: "bg-amber-100 dark:bg-amber-950/40", icn: "text-amber-600 dark:text-amber-300", sub: "أقساط قرض حسن" };
    case "penalty":
      return { icon: AlertTriangle, wrap: "bg-rose-100 dark:bg-rose-950/40", icn: "text-rose-600 dark:text-rose-300", sub: "خصومات مخالفات" };
    case "purchase":
      return { icon: Receipt,       wrap: "bg-blue-100 dark:bg-blue-950/40", icn: "text-blue-600 dark:text-blue-300", sub: "مشتريات على الحساب" };
    case "transport":
      return { icon: Car,           wrap: "bg-cyan-100 dark:bg-cyan-950/40", icn: "text-cyan-600 dark:text-cyan-300", sub: "مواصلات / توصيل" };
    default:
      return { icon: Wallet,        wrap: "bg-slate-100 dark:bg-slate-800/60", icn: "text-slate-600 dark:text-slate-300", sub: "حركات أخرى" };
  }
}

/** Friendly Arabic source badge label. */
function sourceBadge(m: EmployeeMovement): { label: string; tone: "pos" | "voucher" | "manual" } | null {
  if (m.source_type === "pos_meal") return { label: "نقطة بيع", tone: "pos" };
  if (m.source_reference?.match(/^PV[- ]?/i)) return { label: "سند صرف", tone: "voucher" };
  if (m.source_type === "loan") return { label: "قرض حسن", tone: "voucher" };
  if (m.source_type === "payroll") return { label: "خصم راتب", tone: "manual" };
  if (m.source_type === "finance_manual") return { label: "قيد يدوي", tone: "manual" };
  return null;
}

/** Arabic status label — never expose raw English status codes to the user. */
function statusLabel(status?: string | null): { text: string; tone: "warn" | "ok" | "muted" | "bad" } | null {
  switch (status) {
    case "pending":  return { text: "قيد المراجعة", tone: "warn" };
    case "approved": return null; // default — no chip needed
    case "deducted": return { text: "مخصومة", tone: "ok" };
    case "settled":  return { text: "مسددة", tone: "ok" };
    case "rejected": return { text: "ملغاة", tone: "bad" };
    case "cancelled":return { text: "ملغاة", tone: "bad" };
    case "posted":   return { text: "مرحّلة", tone: "ok" };
    case "draft":    return { text: "مسودة", tone: "muted" };
    default: return null;
  }
}

/** Detect edits: updated_at meaningfully after created_at. */
function wasEdited(m: EmployeeMovement): boolean {
  if (!m.updated_at || !m.created_at) return false;
  return new Date(m.updated_at).getTime() - new Date(m.created_at).getTime() > 60_000;
}

/** Arabic label for loan status coming from HR. */
function loanStatusLabel(s?: string | null): string {
  if (!s) return "";
  switch (s) {
    case "active": return "نشط";
    case "pending": return "قيد الاعتماد";
    case "completed": case "closed": case "settled": return "مسدد";
    case "cancelled": case "rejected": return "ملغي";
    case "suspended": return "موقوف";
    default: return s;
  }
}

export default function EmployeeFinancialSummaryTab({ employeeId }: Props) {
  const { company } = useCompany();
  const excludeCarriedAdvances = /الملكي/.test(String(company?.name || ""));
  const [activeChip, setActiveChip] = useState<ChipKey>("all");
  // الحركة المفتوحة في ورقة التفاصيل (عرض فقط).
  const [detailMovement, setDetailMovement] = useState<EmployeeMovement | null>(null);
  // فلتر التاريخ الشهري — الافتراضي: الشهر الحالي. القيمة "all" = كل الفترات.
  const [monthKey, setMonthKey] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // Always pull approved history for KPIs/summary, plus rejected once so we
  // can render the "الملغاة" chip transparently without a second round-trip.
  const { data: rawMovements = [], isLoading } = useEmployeeMovements(employeeId, { includeRejected: true });

  /* ---- تعديلات/استثناءات الموارد البشرية على الخصومات (شاشة الخصومات)
     تُطبَّق هنا حتى تعرض «محفظتي» نفس المبلغ المعتمد فعلياً بدون لمس القيود. */
  const { data: hrOverrides } = useQuery({
    queryKey: ["employee-deduction-overrides", employeeId],
    enabled: !!employeeId,
    staleTime: 15_000,
    queryFn: async () => {
      const [adj, exc] = await Promise.all([
        supabase
          .from("hr_deduction_adjustments")
          .select("source_id, original_amount, adjusted_amount, reason")
          .eq("employee_id", employeeId),
        supabase.from("hr_deduction_exclusions").select("source_id"),
      ]);
      return {
        adjustments: (adj.data || []) as any[],
        exclusions: (exc.data || []) as any[],
      };
    },
  });

  const adjustedRawMovements = useMemo(() => {
    const adjMap = new Map<string, { adjusted: number; original: number; reason: string | null }>();
    (hrOverrides?.adjustments || []).forEach((a) =>
      adjMap.set(String(a.source_id).toLowerCase(), {
        adjusted: safeNum(a.adjusted_amount),
        original: safeNum(a.original_amount),
        reason: a.reason ?? null,
      }),
    );
    const excluded = new Set((hrOverrides?.exclusions || []).map((e) => String(e.source_id).toLowerCase()));
    if (adjMap.size === 0 && excluded.size === 0) return rawMovements;
    return rawMovements
      .filter((m) => !excluded.has(String(m.id).toLowerCase()))
      .map((m) => {
        const a = adjMap.get(String(m.id).toLowerCase());
        if (!a) return m;
        return {
          ...m,
          amount: a.adjusted,
          hr_adjusted_from: a.original,
          hr_adjustment_reason: a.reason,
        } as EmployeeMovement;
      });
  }, [rawMovements, hrOverrides]);

  // استبعاد عجز/فائض الصندوق قبل أي حساب أو عرض.
  const movements = useMemo(
    () => adjustedRawMovements.filter((m) => !isExcluded(m, excludeCarriedAdvances)),
    [adjustedRawMovements, excludeCarriedAdvances],
  );

  // ---- القرض الحسن: مصدر الحقيقة الوحيد هو employee_loans + loan_installments
  // يُقرأ مباشرةً وليس من employee_forms، ويُشترك بالتغييرات الحيّة حتى تنعكس
  // أي تعديلات يجريها قسم الموارد البشرية على شاشة الموظف فوراً.
  const qc = useQueryClient();
  const loanQuery = useQuery({
    queryKey: ["employee-loans", employeeId],
    enabled: !!employeeId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: loans, error } = await supabase
        .from("employee_loans")
        .select("id, total_amount, monthly_installment, total_months, paid_months, remaining_amount, first_payment_date, last_payment_date, status, notes, created_at, approval_date")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const activeIds = (loans || [])
        .filter((l: any) => ["active", "pending", "نشط", "قيد الاعتماد"].includes(l.status))
        .map((l: any) => l.id);
      let installments: any[] = [];
      if (activeIds.length > 0) {
        const { data: inst } = await supabase
          .from("loan_installments")
          .select("id, loan_id, due_date, installment_amount, status, paid_date, payroll_month, payroll_year, month_number")
          .in("loan_id", activeIds)
          .order("due_date", { ascending: true });
        installments = inst || [];
      }
      return { loans: loans || [], installments };
    },
  });

  // اشتراك حي: أي تعديل من HR على القرض أو الأقساط يُعيد التحميل تلقائياً.
  useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`emp-loans-${employeeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_loans", filter: `employee_id=eq.${employeeId}` },
        () => qc.invalidateQueries({ queryKey: ["employee-loans", employeeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_installments" },
        () => qc.invalidateQueries({ queryKey: ["employee-loans", employeeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_financial_movements", filter: `employee_id=eq.${employeeId}` },
        () => qc.invalidateQueries({ queryKey: ["employee-movements", employeeId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId, qc]);

  const loans = loanQuery.data?.loans || [];
  const loanInstallments = loanQuery.data?.installments || [];
  const activeLoan = loans.find((l: any) => ["active", "نشط"].includes(l.status))
    || loans.find((l: any) => ["pending", "قيد الاعتماد"].includes(l.status))
    || null;

  // ---- تحويل أقساط القرض الحسن إلى صفوف شبيهة بالحركات ليُعرَض القسط
  // المستحق لكل شهر ضمن شريحة "القرض الحسن" حتى قبل ترحيل الراتب.
  // نعرض الأقساط غير المسددة فقط لتجنّب الازدواج مع الحركات الفعلية
  // التي تُنشأ عند خصم القسط من الراتب.
  const syntheticLoanMovements = useMemo<EmployeeMovement[]>(() => {
    const paidStatuses = ["paid", "settled", "deducted", "مدفوع", "مسدد"];
    return (loanInstallments as any[])
      .filter((i) => !paidStatuses.includes(i.status))
      .map((i) => {
        const due = new Date(i.due_date);
        const salaryMonth = i.payroll_month || (due.getMonth() + 1);
        const salaryYear = i.payroll_year || due.getFullYear();
        return {
          id: `loan-inst-${i.id}`,
          employee_id: employeeId,
          movement_date: i.due_date,
          movement_type: "debit",
          category: "loan_installment",
          amount: Number(i.installment_amount) || 0,
          description: `قسط قرض حسن — الشهر ${i.month_number ?? ""}`.trim(),
          reference_number: null,
          source_type: "loan",
          source_id: i.loan_id,
          source_reference: `LOAN-${String(i.loan_id).slice(0, 8)}`,
          notes: null,
          status: i.status === "overdue" ? "pending" : (i.status || "pending"),
          created_at: i.due_date,
          updated_at: null,
          salary_month: salaryMonth,
          salary_year: salaryYear,
        } as EmployeeMovement;
      });
  }, [loanInstallments, employeeId]);

  // دمج الأقساط الاصطناعية مع الحركات الحقيقية.
  const allMovements = useMemo(
    () => [...movements, ...syntheticLoanMovements],
    [movements, syntheticLoanMovements],
  );

  // الأشهر المتاحة (من واقع الحركات + أقساط القرض) + الشهر الحالي دائماً.
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMovements) {
      set.add(salaryPeriodKey(m));
    }
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    return Array.from(set).sort().reverse();
  }, [allMovements]);

  // تطبيق فلتر الشهر على الحركات — نستخدم شهر الراتب المستهدف
  // (salary_month/salary_year) وليس تاريخ الحركة، حتى تظهر السلف
  // التي صُرفت في بداية الشهر تحت راتب الشهر السابق فعلياً.
  const monthMovements = useMemo(() => {
    if (monthKey === "all") return allMovements;
    return allMovements.filter((m) => salaryPeriodKey(m) === monthKey);
  }, [allMovements, monthKey]);

  // KPI/summary numbers must ignore rejected/cancelled rows so the employee
  // sees the same balance the payroll will use.
  const activeMovements = useMemo(
    () => monthMovements.filter((m) => m.status !== "rejected"),
    [monthMovements],
  );

  const summary = useMemo(() => {
    let owesCompany = 0; // employee debit
    let owedToEmployee = 0; // credit
    const byCategory: Record<string, { debit: number; credit: number; notes: string[] }> = {};
    let loanInstallmentsPaid = 0;

    for (const m of activeMovements) {
      if (isCashDiffRow(m)) continue; // قيد التدقيق — خارج كل المجاميع
      const amt = safeNum(m.amount);
      const cat = m.category || "other";
      if (!byCategory[cat]) byCategory[cat] = { debit: 0, credit: 0, notes: [] };
      const note = (m.notes || m.description || "").trim();
      if (note && !byCategory[cat].notes.includes(note)) byCategory[cat].notes.push(note);
      if (m.movement_type === "debit") {
        owesCompany += amt;
        byCategory[cat].debit += amt;
        if (cat === "loan_installment") loanInstallmentsPaid += amt;
      } else if (m.movement_type === "credit") {
        owedToEmployee += amt;
        byCategory[cat].credit += amt;
      }
    }
    return {
      owesCompany, owedToEmployee, net: owesCompany - owedToEmployee, byCategory, loanInstallmentsPaid,
    };
  }, [activeMovements]);

  // Chip counts (for the small superscript badges).
  const chipCounts = useMemo(() => {
    const c: Record<ChipKey, number> = { all: 0, food: 0, advance: 0, loan: 0, penalty: 0, purchase: 0, transport: 0, voucher: 0, cashdiff: 0, rejected: 0 };
    for (const m of monthMovements) {
      const k = chipOf(m);
      c[k]++;
      if (m.status !== "rejected" && k !== "cashdiff") c.all++;
    }
    return c;
  }, [monthMovements]);

  const filteredMovements = useMemo(() => {
    if (activeChip === "rejected") return monthMovements.filter((m) => m.status === "rejected");
    const src = activeMovements;
    if (activeChip === "all") return src;
    return src.filter((m) => chipOf(m) === activeChip);
  }, [monthMovements, activeMovements, activeChip]);

  // تنقّل بالشهر السابق/التالي.
  const shiftMonth = (delta: number) => {
    if (monthKey === "all") return;
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // أسماء الأشهر بالعربية (تجنّب أي إخراج إنجليزي).
  const AR_MONTHS = [
    "يناير","فبراير","مارس","إبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
  ];
  const monthLabel = (key: string) => {
    if (key === "all") return "كل الفترات";
    const [y, m] = key.split("-").map(Number);
    return `${AR_MONTHS[m - 1]} ${y}`;
  };

  // إجمالي خصومات الشهر (المدين فقط، بعد استبعاد الملغاة والمستثناة).
  const monthTotalDebit = summary.owesCompany;
  const monthTotalCredit = summary.owedToEmployee;
  // مجموع الحركات الظاهرة (بعد فلاتر الشهر + الشريحة).
  const listTotals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const m of filteredMovements) {
      if (isCashDiffRow(m)) continue;
      const amt = safeNum(m.amount);
      if (m.status === "rejected") continue;
      if (m.movement_type === "debit") debit += amt;
      else if (m.movement_type === "credit") credit += amt;
    }
    return { debit, credit, net: debit - credit };
  }, [filteredMovements]);

  // احتساب أقساط القرض (المدفوعة/المتبقية) من مصدر HR مباشرة.
  const paidInstallmentsCount = loanInstallments.filter((i: any) =>
    ["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status)
  ).length;
  const paidInstallmentsAmount = loanInstallments
    .filter((i: any) => ["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status))
    .reduce((s: number, i: any) => s + safeNum(i.installment_amount), 0);
  const nextInstallment = loanInstallments.find((i: any) => !["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status));
  const loanRemaining = activeLoan ? safeNum(activeLoan.remaining_amount ?? (activeLoan.total_amount - paidInstallmentsAmount)) : null;

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      {/* رأس الشاشة */}
      <div className="pt-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2 justify-start">
          <Wallet className="h-6 w-6 text-primary" />
          <span>ملخصي المالي</span>
        </h2>
        <p className="text-[12px] text-muted-foreground text-right mt-0.5">نظرة سريعة على حركاتك وخصوماتك</p>
      </div>

      {/* بطاقة إجمالي الخصومات للشهر — تصميم مرجعي */}
      <Card className="relative overflow-hidden border-primary/20 bg-primary text-primary-foreground">
        {/* أيقونة زخرفية */}
        <Wallet className="absolute -bottom-3 -right-3 h-24 w-24 opacity-10 pointer-events-none" />
        <CardContent className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[12px] text-primary-foreground/85">
              <Info className="h-3.5 w-3.5 opacity-70" />
              <span>إجمالي الخصومات</span>
            </div>
            {/* اختيار الشهر */}
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger className="h-8 w-auto min-w-[130px] bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground text-xs font-semibold gap-1.5 rounded-full px-3">
                <CalendarIcon className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="min-w-[160px]">
                <SelectItem value="all">كل الفترات</SelectItem>
                {availableMonths.map((k) => (
                  <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 text-center">
            <div className="text-3xl font-extrabold tabular-nums tracking-tight">
              {formatCurrency(monthTotalDebit)}
            </div>
            <div className="text-[11px] text-primary-foreground/75 mt-1">
              إجمالي الخصومات {monthKey === "all" ? "لكل الفترات" : "لهذا الشهر"}
              {monthTotalCredit > 0 && ` • مستحق لك ${formatCurrency(monthTotalCredit)}`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-right">تفصيل حسب البند</div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
            </div>
          ) : Object.keys(summary.byCategory).length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">لا توجد حركات مالية</p>
          ) : (
            <ul className="divide-y divide-border">
              {Object.entries(summary.byCategory).map(([cat, totals]) => {
                const v = categoryVisual(cat);
                const Icn = v.icon;
                 const catInfo = infoForCategory(cat);
                 return (
                   <li key={cat} className="flex items-center justify-between px-4 py-3 gap-3">
                     <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", v.wrap)}>
                        <Icn className={cn("h-5 w-5", v.icn)} />
                      </div>
                       <div className="text-right min-w-0">
                         <div className="text-sm font-semibold truncate">{tCategory(cat)}</div>
                         <div className="text-[11px] text-muted-foreground line-clamp-2">
                           {totals.notes.length > 0 ? totals.notes.join(" • ") : catInfo.what}
                         </div>
                      </div>
                    </div>
                    <div className="text-sm font-bold tabular-nums text-left">
                      {totals.debit > 0 && <span className="text-rose-600">-{formatCurrency(totals.debit)}</span>}
                      {totals.credit > 0 && <span className="text-emerald-600 ml-2">+{formatCurrency(totals.credit)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Filter chips + Latest movements */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{filteredMovements.length} حركة</span>
            <span className="text-xs font-semibold">الحركات</span>
          </div>

          {/* Chips row — scrollable, no emojis, subtle lucide icons */}
          <div className="px-2 py-2 border-b border-border overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 w-max">
              {CHIPS.map((c) => {
                const active = activeChip === c.key;
                const count = chipCounts[c.key];
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveChip(c.key)}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted/50",
                      c.key === "rejected" && !active && "text-rose-600 border-rose-200 dark:border-rose-900/40",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{c.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] leading-4 min-w-4",
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredMovements.length === 0 ? (
            <p className="text-xs text-muted-foreground p-6 text-center">
              {activeChip === "rejected" ? "لا توجد حركات ملغاة." : "لا توجد حركات في هذا التصنيف."}
            </p>
          ) : (
            <>
            <ul className="divide-y divide-border">
              {filteredMovements.slice(0, 60).map((m: EmployeeMovement) => {
                const badge = sourceBadge(m);
                const rejected = m.status === "rejected";
                const edited = wasEdited(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setDetailMovement(m)}
                      aria-label="عرض تفاصيل الحركة"
                      className="w-full text-right px-3 py-2.5 flex items-start justify-between gap-2 transition hover:bg-muted/40 active:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("font-semibold text-[13px] truncate", rejected && "line-through text-muted-foreground")}>
                            {tCategory(m.category)}
                          </span>
                          {badge && (
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full border",
                              badge.tone === "pos" && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40",
                              badge.tone === "voucher" && "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/40",
                              badge.tone === "manual" && "bg-muted text-muted-foreground border-border",
                            )}>{badge.label}</span>
                          )}
                          {rejected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40 inline-flex items-center gap-0.5">
                              <XCircle className="h-2.5 w-2.5" /> ملغاة
                            </span>
                          )}
                          {edited && !rejected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40 inline-flex items-center gap-0.5">
                              <Pencil className="h-2.5 w-2.5" /> عُدِّلت
                            </span>
                          )}
                          {/* العجز/الفائض تحت مراجعة المحاسبة — توضيح للموظف حتى لا يقلق */}
                          {isCashDiffRow(m) && !rejected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/40 inline-flex items-center gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" /> قيد التدقيق — غير محتسب
                            </span>
                          )}
                          {(() => {
                            const sl = statusLabel(m.status);
                            if (!sl || rejected) return null;
                            const tone = sl.tone === "warn"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : sl.tone === "ok"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : sl.tone === "bad"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-muted text-muted-foreground border-border";
                            return (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", tone)}>{sl.text}</span>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {new Date(m.movement_date).toLocaleDateString("ar-EG-u-ca-gregory")}
                          {m.source_reference ? ` • ${m.source_reference}` : ""}
                          {m.description ? ` • ${m.description}` : ""}
                        </div>
                        {(() => {
                          const sp = salaryPeriodOf(m);
                          const md = new Date(m.movement_date);
                          const mdMonth = md.getMonth() + 1;
                          const mdYear = md.getFullYear();
                          if (sp.month === mdMonth && sp.year === mdYear) return null;
                          return (
                            <div className="text-[10px] mt-0.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40 px-1.5 py-0.5">
                              <Info className="h-2.5 w-2.5" />
                              <span>ستُخصم من راتب {AR_MONTHS[sp.month - 1]} {sp.year}</span>
                            </div>
                          );
                        })()}
                        {rejected && m.notes && (
                          <div className="text-[10px] text-rose-600 mt-0.5 truncate">سبب الإلغاء: {m.notes}</div>
                        )}
                        <div className="text-[10px] text-primary mt-1 inline-flex items-center gap-0.5">
                          <Info className="h-2.5 w-2.5" /> اضغط لعرض التفاصيل
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 font-bold text-[13px] tabular-nums",
                        rejected ? "text-muted-foreground line-through"
                          : isCashDiffRow(m) ? "text-sky-600"
                          : m.movement_type === "debit" ? "text-rose-600" : "text-emerald-600",
                      )}>
                        {m.movement_type === "debit" ? "-" : "+"}{formatCurrency(m.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* مجموع الحركات الظاهرة */}
            <div className="border-t-2 border-border bg-muted/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-bold">إجمالي الحركات الظاهرة</div>
                <div className="flex items-center gap-3 tabular-nums text-[13px] font-bold">
                  {listTotals.debit > 0 && (
                    <span className="text-rose-600">-{formatCurrency(listTotals.debit)}</span>
                  )}
                  {listTotals.credit > 0 && (
                    <span className="text-emerald-600">+{formatCurrency(listTotals.credit)}</span>
                  )}
                  {listTotals.debit === 0 && listTotals.credit === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{filteredMovements.length} حركة</span>
                <span className="tabular-nums">
                  الصافي: {formatCurrency(Math.abs(listTotals.net))}
                  {" "}({listTotals.net >= 0 ? "على ذمتك" : "مستحق لك"})
                </span>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ورقة تفاصيل الحركة — شرح البند وربطه بالإجراء الإداري */}
      <MovementDetailSheet
        movement={detailMovement}
        open={!!detailMovement}
        onOpenChange={(v) => { if (!v) setDetailMovement(null); }}
      />
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent === "ok" ? "text-emerald-600" : accent === "bad" ? "text-rose-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
