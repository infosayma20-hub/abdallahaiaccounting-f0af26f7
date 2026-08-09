import { useState, useMemo, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Filter, ExternalLink, Trash2, Calendar, ChevronDown, ChevronLeft, LayoutList, Table2, Printer, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Ban, RotateCcw, EyeOff, Eye, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/hr-utils";
import BackButton from "@/components/BackButton";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";
import { HRDateRangeFilter } from "@/components/hr/HRDateRangeFilter";
import { getDefaultDateRangeThisYear } from "@/lib/hrDate";
import { resolveDocumentRoute } from "@/lib/account-statement/resolveDocumentRoute";

import { setNextExportBranding } from "@/lib/excel-export";
import { useCompany } from "@/hooks/useCompanyContext";
import { printVoucherList, type PrintListColumn } from "@/components/print/buildVoucherListPrint";
import { esc } from "@/lib/print/openPrintWindow";
import { hasExplicitAdvanceEvidence, isCarriedOverJuneAdvance, isLoanDisbursement, isSalaryReturnEntry, isStructuredDeductionCategory } from "@/lib/hr/deductionAuditRules";

const fmtNum = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));
const DEDUCTION_SOURCES = ["الكل", "سند صرف", "سند قبض", "نقطة البيع", "خصم يدوي", "سلفة", "قرض حسن"] as const;

/** أشهر جاهزة للاختيار السريع (من بداية عمل النظام حتى الشهر الحالي) */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTH_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const start = new Date(2026, 0, 1);
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor >= start) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    out.push({ value: `${y}-${m}`, label: `${AR_MONTHS[m - 1]} ${y}` });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return out;
})();

const normalizeArabicName = (value: string = "") => value.replace(/عبدالله/g, "عبد الله").replace(/\s+/g, " ").trim();

/**
 * PostgREST يرجّع 1000 صف كحد أقصى للطلب الواحد — نجلب على دفعات حتى نهاية البيانات
 * حتى لا تختفي حركات (مثلاً وجبات نقطة البيع تتجاوز 2000 حركة).
 */
const PAGE_SIZE = 1000;
async function fetchAllRows(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[HRDeductions] paged fetch failed", error);
      break;
    }
    const chunk = (data || []) as any[];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return out;
}

type BucketKey = "advance" | "loan" | "voucher" | "purchase" | "meal" | "transport" | "penalty" | "shortage" | "surplus" | "settlement" | "other";

const BUCKET_ORDER: BucketKey[] = ["advance", "loan", "voucher", "meal", "penalty", "purchase", "transport", "shortage", "surplus", "settlement", "other"];

const BUCKET_LABELS: Record<BucketKey, string> = {
  advance: "سلف",
  loan: "قرض حسن",
  voucher: "سندات صرف",
  meal: "أكل",
  penalty: "مخالفات",
  purchase: "مشتريات",
  transport: "توصيل",
  shortage: "عجز",
  surplus: "فائض",
  settlement: "سداد",
  other: "أخرى",
};

const emptyBuckets = (): Record<BucketKey, number> =>
  ({ advance: 0, loan: 0, voucher: 0, meal: 0, penalty: 0, purchase: 0, transport: 0, shortage: 0, surplus: 0, settlement: 0, other: 0 });

/**
 * قسط القرض الحسن المستحق بين 27 من الشهر و 3 من الشهر التالي يُحتسب على الشهر الأول.
 * نُرجع "تاريخاً محاسبياً" لغرض الفلترة الشهرية.
 */
export const loanPayrollDate = (dueDate: string): string => {
  if (!dueDate) return dueDate;
  const d = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dueDate;
  if (d.getUTCDate() <= 3) {
    // ارجع لآخر يوم في الشهر السابق
    d.setUTCDate(0);
  }
  return d.toISOString().slice(0, 10);
};

/** صرف رواتب (شهر 6 وغيره) ليس خصماً على الموظف */
const isSalaryPayout = (description: string = "", reference: string = "", category?: string | null) => {
  // إرجاع/تكملة راتب ليس خصماً حتى لو صُنّف «سلفة»
  if (isSalaryReturnEntry(description)) return true;
  // صرف أصل القرض الحسن ليس خصماً — الخصم بالقسط فقط
  if (category !== "loan_installment" && isLoanDisbursement(description)) return true;
  if (isStructuredDeductionCategory(category)) return false;
  const d = String(description || "").trim();
  const ref = String(reference || "").trim();
  if (/^BPV-2026-(0011|0013)$/.test(ref)) return true;
  // استثناءات: بنود خصم فعلية قد تذكر كلمة راتب (سلفة/قسط/المخصوم من الراتب)
  const isRealDeduction = /(خصم|المخصوم|تخصم|خصمها|سلف|قسط|أقساط|اقساط)/.test(d);
  // أي سند يذكر راتب/رواتب هو دفعة راتب وليس خصماً
  if (!isRealDeduction && /(رات[بة]|رواتب)/.test(d)) return true;
  if (/^ص\s*[-–—]/.test(d) || d === "ص") return true;
  if (/^رواتب\b/.test(d)) return true;
  if (/صرف\s*رواتب|صرف\s*راتب\s*شهر|رواتب\s*شهر/.test(d)) return true;
  // تكملة راتب / إرجاع راتب / فرق راتب — دفعات راتب وليست خصومات
  if (/(تكملة|تكمله|مكملة|مكمله|فرق|فروقات|ارجاع|إرجاع|رجيع)\s*رات[بة]/.test(d)) return true;
  return false;
};

/** أرصدة افتتاحية معتمدة يدوياً من الإدارة (تتجاوز الاحتساب الآلي) */
const OPENING_OVERRIDES: Record<string, number> = {
  "محمد الشريف": 2671,
  "محمود البيطار": 32,
  "حمزة السخلة": 8184,
  "امير الباشا": 5,
  "أمير الباشا": 5,
};

/** البرنامج بدأ فعلياً بتاريخ 1/7/2026 — لا تُعتمد أي أرصدة افتتاحية غير المعتمدة أعلاه */
const OPENING_CUTOFF = "2026-07-01";

/** مفتاح مطابقة مرن: يتجاهل "ال" التعريف والهمزات وفروق المسافات */
const openingKey = (value: string = "") =>
  normalizeArabicName(value)
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .split(" ")
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .join(" ");

const OPENING_OVERRIDES_NORMALIZED: Record<string, number> = Object.fromEntries(
  Object.entries(OPENING_OVERRIDES).map(([k, v]) => [openingKey(k), v])
);

/** موظفون بدون رقم وظيفي معتمد (يُخفى الرقم في الجدول والتصدير) */
const SUPPRESSED_EMPLOYEE_NUMBERS = new Set(["عبد الله صايمة", "اياد البزرة", "إياد البزرة"]);

/** عجز/فائض مولّد آلياً من إغلاق ورديات نقطة البيع — يُستثنى، ونعتمد قيود المحاسبين فقط */
const isSystemCashDiff = (sourceType: string = "", description: string = "") => {
  if (sourceType === "pos_shortage") return true;
  return /(عجز|فائض)\s*صندوق\s*-\s*وردية/.test(String(description || ""));
};

/**
 * فواتير نقطة البيع المرحّلة على ذمة الموظف (مبيعات POS / عكس قيد POS).
 * تُحتسب حصراً من حركات الأكل (employee_financial_movements/pos_meal) لتفادي
 * الازدواج ولئلا تسقط ضمن بند «أخرى».
 */
const isPosSaleEntry = (description: string = "", reference: string = "") => {
  const ref = String(reference || "");
  const desc = String(description || "");
  return /^(REV-)?POS-/i.test(ref) || /مبيعات\s*نقطة\s*البيع|POS-\d{8}/i.test(desc);
};

const classifyBucket = (source: string, type: string, description: string, category?: string): BucketKey => {
  /* eslint-disable-next-line */
  const text = `${type} ${description}`;
  const cat = String(category || "");
  if (cat === "settlement") return "settlement";
  if (cat === "cash_surplus") return "surplus";
  if (cat === "cash_shortage") return "shortage";
  if (cat === "penalty") return "penalty";
  if (cat === "food") return "meal";
  if (cat === "purchase") return "purchase";
  if (cat === "transport") return "transport";
  if (cat === "loan_installment") return "loan";
  if (cat === "advance") return "advance";
  if (source === "نقطة البيع" || /أكل|اكل|وجبة|وجبات|طعام|مطعم|كافتيريا|مبيعات\s*نقطة\s*البيع/.test(text)) return "meal";
  // الدليل الصريح على السلفة يسبق كلمات الأسماء (مثال: الموظف حمزة مخالفة).
  if (hasExplicitAdvanceEvidence(source, type, description, category)) return "advance";
  if (/مخالفة|مخالفات|غرامة|عقوبة|عقابي|عقابية|تنبيه|إنذار|انذار|إتلاف|اتلاف|إلحاق\s*ضرر|الحاق\s*ضرر/.test(text)) return "penalty";
  if (/فائض/.test(text)) return "surplus";
  if (/عجز|فروقات\s*صندوق/.test(text)) return "shortage";
  if (/مواصلات|توصيل|تكسي|تاكسي|بنزين|محروقات|سفر|نقل/.test(text)) return "transport";
  if (/مشتريات|شراء|مشترى|بضاعة|أدوات|ادوات|مستلزمات|جبنة|جبنه|رز|أرز|ارز|دجاج|أجنحة|اجنحة|صدور|شاورما|زيت|سكر|طحين|خضار|لحمة|لحم|بطاطا|بيض|حليب/.test(text)) return "purchase";
  if (source === "قرض حسن" || /قرض\s*حسن|قسط\s*قرض/.test(text)) return "loan";
  if (/قرض|دفعة/.test(text)) return "advance";
  if (source === "سند صرف") return "voucher";
  return "other";
};

/** رأس عمود قابل للفرز — يحافظ على لون خط الهيدر (أبيض) */
const SortHeader = ({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: { label: string; k: string; sortKey: string; sortDir: "asc" | "desc"; onSort: (k: string) => void }) => (
  <button
    type="button"
    onClick={() => onSort(k)}
    className="inline-flex items-center gap-1 text-inherit hover:opacity-80 font-inherit"
    title="ترتيب"
  >
    <span>{label}</span>
    {sortKey === k ? (
      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-40" />
    )}
  </button>
);

export default function HRDeductionsPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRangeThisYear().fromISO);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRangeThisYear().toISO);

  /** يعكس اختيار الشهر الحالي إن كان المدى مطابقاً لشهر كامل */
  const selectedMonth = useMemo(() => {
    if (!dateFrom || !dateTo) return "custom";
    const [fy, fm, fd] = dateFrom.split("-").map(Number);
    const [ty, tm, td] = dateTo.split("-").map(Number);
    if (fy !== ty || fm !== tm || fd !== 1) return "custom";
    return td === new Date(ty, tm, 0).getDate() ? `${fy}-${fm}` : "custom";
  }, [dateFrom, dateTo]);
  const [viewMode, setViewMode] = useState<"summary" | "movements">("summary");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<{ id: string; sourceId?: string | null; employeeName: string; description: string; amount: number } | null>(null);
  const [excludeReason, setExcludeReason] = useState("");
  /* تعديل العجز/الفائض (تخفيف على الموظف) */
  const [adjustTarget, setAdjustTarget] = useState<
    | {
        id: string;
        sourceId?: string | null;
        employeeName: string;
        description: string;
        amount: number;
        originalAmount: number;
        bucket: string;
        adjustmentId?: string | null;
      }
    | null
  >(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const toggleSort = (key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  };

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees", user?.id],
    queryFn: async () => {
      // نشمل الموظفين المنتهية خدمتهم أيضاً حتى لا تختفي خصوماتهم/سلفهم من الكشف
      return await fetchAllRows(() =>
        (supabase as any)
          .from("employees")
          .select("id, full_name, employee_number, department, branch_id, is_active")
          .eq("user_id", dataOwnerId!)
          .order("full_name")
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // Fetch branches for branch names
  const { data: branches = [] } = useQuery({
    queryKey: ["hr-branches", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any).from("branches").select("id, name").eq("user_id", dataOwnerId!).order("id")
      );
    },
    enabled: !!user,
  });

  // Fetch employee receivable accounts to mirror employee account statement matching
  const { data: employeeAccounts = [] } = useQuery({
    queryKey: ["hr-employee-accounts", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("accounts")
          .select("account_code, account_name")
          .eq("user_id", dataOwnerId!)
          .eq("parent_code", "2180")
          .neq("is_active", false)
          .order("account_code")
      );
    },
    enabled: !!user,
  });

  // Fetch manual deductions
  const { data: manualDeductions = [], refetch: refetchDeductions } = useQuery({
    queryKey: ["hr-all-deductions", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("employee_deductions")
          .select("*, employees(full_name, department, branch_id)")
          .eq("user_id", dataOwnerId!)
          .order("deduction_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // Fetch payment vouchers from the vouchers table
  const { data: paymentVouchers = [] } = useQuery({
    queryKey: ["hr-payment-vouchers", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("vouchers")
          .select("id, ref_number, description, notes, amount, date, status, linked_transaction_id, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("type", "payment")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // Fetch employee-related transactions to match account statement and dedupe duplicate vouchers
  const { data: employeeTransactions = [] } = useQuery({
    queryKey: ["hr-employee-payment-transactions", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("transactions")
          .select("id, description, amount, transaction_date, transaction_type, payment_method, debit_account_code, credit_account_code, is_deleted, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("is_deleted", false)
          .in("transaction_type", ["employee_payment", "payment"])
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // سندات القبض (سداد الموظف) — تُخصم من مجموع مديونية الموظف
  const { data: employeeSettlements = [] } = useQuery({
    queryKey: ["hr-employee-settlements", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("transactions")
          .select("id, description, amount, transaction_date, transaction_type, reference, debit_account_code, credit_account_code, is_deleted, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("is_deleted", false)
          .in("transaction_type", ["receipt", "employee_receipt"])
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user && !!dataOwnerId,
  });

  // كل القيود المدينة على حساب ذمة الموظف (قيود محاسبية / سندات صرف / عجز …)
  const employeeAccountCodes = useMemo(
    () => employeeAccounts.map((a: any) => a.account_code).filter(Boolean),
    [employeeAccounts]
  );

  const { data: subledgerDebits = [] } = useQuery({
    queryKey: ["hr-employee-subledger-debits", user?.id, employeeAccountCodes.length],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("transactions")
          .select("id, description, amount, transaction_date, transaction_type, reference, debit_account_code, credit_account_code, is_deleted, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("is_deleted", false)
          .in("debit_account_code", employeeAccountCodes)
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user && !!dataOwnerId && employeeAccountCodes.length > 0,
  });

  // حسابات فروقات/فائض الصندوق — الفائض يُسجَّل بقيد يدوي واسم الموظف في البيان
  const { data: cashDiffAccounts = [] } = useQuery({
    queryKey: ["hr-cash-diff-accounts", user?.id],
    queryFn: async () => {
      const rows = await fetchAllRows(() =>
        (supabase as any).from("accounts").select("account_code, account_name").eq("user_id", dataOwnerId!).order("account_code")
      );
      return rows.filter((a: any) =>
        /فائض|فروقات\s*صندوق/.test(String(a.account_name || "")) && !/عمل[ةه]/.test(String(a.account_name || ""))
      );
    },
    enabled: !!user && !!dataOwnerId,
  });

  const cashDiffCodes = useMemo(
    () => Array.from(new Set(cashDiffAccounts.map((a: any) => a.account_code).filter(Boolean))),
    [cashDiffAccounts]
  );

  // قيود الفائض: دائنها حساب فروقات/فائض الصندوق واسم الموظف في البيان
  const { data: surplusTransactions = [] } = useQuery({
    queryKey: ["hr-cash-surplus-txns", user?.id, cashDiffCodes.length],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("transactions")
          .select("id, description, amount, transaction_date, transaction_type, reference, debit_account_code, credit_account_code, is_deleted, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("is_deleted", false)
          .in("credit_account_code", cashDiffCodes)
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user && !!dataOwnerId && cashDiffCodes.length > 0,
  });

  // Fetch advances
  const { data: advances = [] } = useQuery({
    queryKey: ["hr-advances-deductions", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("employee_advances")
          .select("*, employees(full_name, department, branch_id)")
          .eq("user_id", dataOwnerId!)
          .in("status", ["approved", "partially_paid"])
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // Fetch POS employee-account transactions via employee_financial_movements (pos_meal)
  const { data: loanInstallments = [] } = useQuery({
    queryKey: ["hr-loan-installments", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("loan_installments")
          .select("*")
          .eq("user_id", dataOwnerId!)
          .order("due_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user && !!dataOwnerId,
  });

  const { data: posTransactions = [] } = useQuery({
    queryKey: ["hr-pos-employee-txns", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("employee_financial_movements")
          .select("*, employees(full_name, department, branch_id)")
          .eq("user_id", dataOwnerId!)
          .eq("source_type", "pos_meal")
          .neq("status", "rejected")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  // Fetch all other employee financial movements (advances, manual finance entries, deductions...)
  const { data: financialMovements = [] } = useQuery({
    queryKey: ["hr-employee-financial-movements", user?.id],
    queryFn: async () => {
      return await fetchAllRows(() =>
        (supabase as any)
          .from("employee_financial_movements")
          .select("*, employees(full_name, department, branch_id)")
          .eq("user_id", dataOwnerId!)
          .neq("source_type", "pos_meal")
          .neq("status", "rejected")
          .order("movement_date", { ascending: false })
          .order("id", { ascending: true })
      );
    },
    enabled: !!user,
  });

  const branchMap = useMemo(() => {
    return branches.reduce((acc: Record<string, string>, branch: any) => {
      acc[branch.id] = branch.name || "";
      return acc;
    }, {});
  }, [branches]);

  const employeeDirectory = useMemo(() => {
    const byId: Record<string, { id: string; name: string; number: string; dept: string; branchId: string; branch: string }> = {};
    const byNormalizedName = new Map<string, { id: string; name: string; number: string; dept: string; branchId: string; branch: string }>();
    const byAccountCode = new Map<string, { id: string; name: string; number: string; dept: string; branchId: string; branch: string }[]>();

    const employeeList = employees.map((employee: any) => {
      const info = {
        id: employee.id,
        name: employee.full_name || "—",
        number: String(employee.employee_number ?? ""),
        dept: employee.department || "",
        branchId: employee.branch_id || "",
        branch: branchMap[employee.branch_id] || "",
      };

      byId[info.id] = info;
      byNormalizedName.set(normalizeArabicName(info.name), info);
      return info;
    });

    employeeAccounts.forEach((account: any) => {
      const normalizedAccountEmployeeName = normalizeArabicName(
        String(account.account_name || "").replace(/^ذمم موظف\s*-\s*/, "")
      );

      const matchedEmployees = employeeList.filter(
        (employee) => normalizeArabicName(employee.name) === normalizedAccountEmployeeName
      );

      if (matchedEmployees.length > 0) {
        byAccountCode.set(account.account_code, matchedEmployees);
      }
    });

    return { byId, byNormalizedName, byAccountCode };
  }, [employees, employeeAccounts, branchMap]);

  const resolveEmployeeByDescription = (description: string) => {
    const normalizedDescription = normalizeArabicName(description || "");

    for (const [normalizedName, employee] of employeeDirectory.byNormalizedName.entries()) {
      if (normalizedName && normalizedDescription.includes(normalizedName)) {
        return employee;
      }
    }

    return null;
  };

  /**
   * مطابقة مرنة بالاسم: يُستعمل لقيود الفائض التي تُكتب باسم مختصر ("فائض سامي").
   * تُقبل فقط عندما تعطي نتيجة واحدة لا لبس فيها.
   */
  const resolveEmployeeByLooseName = (description: string) => {
    const exact = resolveEmployeeByDescription(description);
    if (exact) return exact;

    const words = normalizeArabicName(description || "")
      .replace(/[0-9/\\-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(فائض|عجز|صندوق|الكاش|كاش|في|من|فرع|بلازا)$/.test(w));

    const matches = new Map<string, ReturnType<typeof resolveEmployeeByDescription>>();
    words.forEach((word) => {
      for (const [normalizedName, employee] of employeeDirectory.byNormalizedName.entries()) {
        const parts = normalizedName.split(" ");
        if (parts.includes(word)) matches.set(employee.id, employee);
      }
    });

    return matches.size === 1 ? Array.from(matches.values())[0] : null;
  };

  const resolveEmployeeByTransaction = (transaction: any) => {
    const accountMatches = employeeDirectory.byAccountCode.get(transaction.debit_account_code) || [];

    if (accountMatches.length === 1) return accountMatches[0];
    if (accountMatches.length > 1) {
      return resolveEmployeeByDescription(transaction.description || "") || accountMatches[0];
    }

    return resolveEmployeeByDescription(transaction.description || "");
  };

  const latestVoucherByTransactionId = useMemo(() => {
    const map = new Map<string, any>();

    paymentVouchers.forEach((voucher: any) => {
      if (voucher.linked_transaction_id && !map.has(voucher.linked_transaction_id)) {
        map.set(voucher.linked_transaction_id, voucher);
      }
    });

    return map;
  }, [paymentVouchers]);

  /* ============ الاستثناءات: بنود ليست خصماً من الراتب ============ */
  const { data: exclusions = [] } = useQuery({
    queryKey: ["hr-deduction-exclusions", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_deduction_exclusions")
        .select("id, source_kind, source_id, reason")
        .eq("user_id", dataOwnerId);
      if (error) throw error;
      return data || [];
    },
  });

  /** يستخرج UUID المصدر من معرّف السطر (tx-… / efm-… / sub-…) */
  const rowUuid = (rowId: string) => {
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(rowId || "");
    return m ? m[1].toLowerCase() : (rowId || "").toLowerCase();
  };

  const excludedMap = useMemo(() => {
    const m = new Map<string, { id: string; reason: string | null }>();
    (exclusions as any[]).forEach((e) => m.set(String(e.source_id).toLowerCase(), { id: e.id, reason: e.reason }));
    return m;
  }, [exclusions]);

  /** يطابق الاستثناء على معرّف السطر أو معرّف المصدر (سند/قيد) */
  const findExclusion = (row: { id: string; sourceId?: string | null }) =>
    excludedMap.get(rowUuid(row.id)) || (row.sourceId ? excludedMap.get(rowUuid(row.sourceId)) : undefined);

  /* ============ تعديلات العجز/الفائض (تخفيف على الموظف) ============
     لا نلمس القيد المحاسبي — نخزّن مبلغاً معدَّلاً يُعتمد في احتساب الخصومات فقط. */
  const { data: adjustments = [] } = useQuery({
    queryKey: ["hr-deduction-adjustments", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_deduction_adjustments")
        .select("id, source_id, bucket, original_amount, adjusted_amount, reason")
        .eq("user_id", dataOwnerId as string);
      if (error) throw error;
      return data || [];
    },
  });

  const adjustmentsMap = useMemo(() => {
    const m = new Map<string, { id: string; adjusted: number; original: number; reason: string | null }>();
    (adjustments as any[]).forEach((a) =>
      m.set(String(a.source_id).toLowerCase(), {
        id: a.id,
        adjusted: Number(a.adjusted_amount || 0),
        original: Number(a.original_amount || 0),
        reason: a.reason ?? null,
      })
    );
    return m;
  }, [adjustments]);

  const findAdjustment = useCallback(
    (row: { id: string }) => adjustmentsMap.get(rowUuid(row.id)),
    [adjustmentsMap]
  );

  const saveAdjustment = async (
    row: { id: string; employeeName: string; description: string; bucket: string; originalAmount: number },
    newAmount: number,
    reason: string
  ) => {
    try {
      const employee = employeeDirectory.byNormalizedName.get(normalizeArabicName(row.employeeName));
      const { error } = await supabase.from("hr_deduction_adjustments").upsert(
        {
          user_id: dataOwnerId,
          employee_id: employee?.id || null,
          employee_name: row.employeeName,
          source_kind: (row.id.split("-")[0] || "row").toLowerCase(),
          source_id: rowUuid(row.id),
          bucket: row.bucket,
          original_amount: row.originalAmount,
          adjusted_amount: newAmount,
          reason: reason || null,
          created_by: user?.id || null,
        } as any,
        { onConflict: "user_id,source_id" }
      );
      if (error) throw error;
      toast.success("تم اعتماد التعديل في الخصومات");
      queryClient.invalidateQueries({ queryKey: ["hr-deduction-adjustments", dataOwnerId] });
    } catch (e: any) {
      toast.error(e.message || "تعذّر حفظ التعديل");
    }
  };

  const removeAdjustment = async (adjustmentId: string) => {
    try {
      const { error } = await supabase.from("hr_deduction_adjustments").delete().eq("id", adjustmentId);
      if (error) throw error;
      toast.success("تمت إعادة المبلغ الأصلي");
      queryClient.invalidateQueries({ queryKey: ["hr-deduction-adjustments", dataOwnerId] });
    } catch (e: any) {
      toast.error(e.message || "تعذّر إلغاء التعديل");
    }
  };

  const toggleExclusion = async (row: { id: string; sourceId?: string | null }, reason: string) => {
    const uuid = rowUuid(row.id);
    const existing = findExclusion(row);
    try {
      if (existing) {
        const { error } = await supabase.from("hr_deduction_exclusions").delete().eq("id", existing.id);
        if (error) throw error;
        toast.success("تمت إعادة البند إلى الخصومات");
      } else {
        const kind = (row.id.split("-")[0] || "row").toLowerCase();
        const { error } = await supabase.from("hr_deduction_exclusions").insert({
          user_id: dataOwnerId,
          source_kind: kind,
          source_id: uuid,
          reason: reason || null,
          created_by: user?.id || null,
        });
        if (error) throw error;
        toast.success("تم استثناء البند من الخصومات");
      }
      queryClient.invalidateQueries({ queryKey: ["hr-deduction-exclusions", dataOwnerId] });
    } catch (e: any) {
      toast.error(e.message || "تعذّر تنفيذ العملية");
    }
  };

  /* ====== شهر الخصم المثبّت يدوياً (سند صرف / سند صرف جماعي) ======
     إضافة فقط: بند مؤرَّخ بعد نهاية الفترة لكنه مثبَّت على الشهر المختار
     يظهر ضمن الشهر المختار. لا يُغيَّر أي منطق تواريخ قائم. */
  const pinnedMonthIndex = useMemo(() => {
    const m = new Map<string, string>();
    (financialMovements as any[]).forEach((mov) => {
      // فقط البنود المثبَّتة يدوياً من سند الصرف (salary_month_locked)
      if (!mov?.salary_month_locked) return;
      const month = Number(mov?.salary_month || 0);
      const year = Number(mov?.salary_year || 0);
      if (!month || !year) return;
      const monthKey = `${year}-${month}`;
      const name = mov.employees?.full_name || employeeDirectory.byId[mov.employee_id]?.name || "";
      const amount = Number(mov.amount || 0).toFixed(2);
      const date = mov.movement_date || mov.created_at?.split("T")[0] || "";
      const ref = mov.source_reference || "";
      m.set(`efm-${mov.id}`, monthKey);
      if (ref && name) m.set(`ref|${ref}|${name}|${amount}`, monthKey);
      if (name && date) m.set(`nda|${name}|${date}|${amount}`, monthKey);
    });
    return m;
  }, [financialMovements, employeeDirectory]);

  const getPinnedMonth = useCallback(
    (r: { id: string; employeeName: string; amount: number; date: string; reference?: string }) => {
      const amount = Number(r.amount || 0).toFixed(2);
      return (
        pinnedMonthIndex.get(r.id) ||
        (r.reference ? pinnedMonthIndex.get(`ref|${r.reference}|${r.employeeName}|${amount}`) : undefined) ||
        pinnedMonthIndex.get(`nda|${r.employeeName}|${r.date}|${amount}`)
      );
    },
    [pinnedMonthIndex]
  );

  const isPinnedToSelectedMonth = useCallback(
    (r: { id: string; employeeName: string; amount: number; date: string; reference?: string }) => {
      if (selectedMonth === "custom") return false;
      return getPinnedMonth(r) === selectedMonth;
    },
    [getPinnedMonth, selectedMonth]
  );

  // Unify all deduction rows
  const allRows = useMemo(() => {
    const rows: {
      id: string;
      employeeName: string;
      employeeDept: string;
      employeeBranch: string;
      type: string;
      description: string;
      amount: number;
      date: string;
      source: string;
      sourceId: string | null;
      status: string;
      category?: string;
      reference?: string;
    }[] = [];

    // Manual deductions
    manualDeductions.forEach((deduction: any) => {
      const employee = employeeDirectory.byId[deduction.employee_id] || resolveEmployeeByDescription(deduction.description || "");
      const desc = deduction.description || deduction.notes || "";
      if (isSalaryPayout(desc) || isSystemCashDiff("", desc)) return;
      rows.push({
        id: deduction.id,
        employeeName: deduction.employees?.full_name || employee?.name || "—",
        employeeDept: deduction.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[deduction.employees?.branch_id] || employee?.branch || "",
        type: deduction.deduction_type || "أخرى",
        description: desc,
        amount: Number(deduction.amount || 0),
        date: deduction.deduction_date || deduction.created_at?.split("T")[0] || "",
        source: "خصم يدوي",
        sourceId: null,
        status: deduction.status || "معتمد للخصم",
      });
    });

    // Employee payment transactions + linked vouchers
    employeeTransactions.forEach((transaction: any) => {
      const employee = resolveEmployeeByTransaction(transaction);
      if (!employee) return;

      const linkedVoucher = latestVoucherByTransactionId.get(transaction.id);
      const description = linkedVoucher?.description || transaction.description || linkedVoucher?.notes || "";
      if (isSalaryPayout(description, linkedVoucher?.ref_number) || isSystemCashDiff("", description)) return;
      const deductionType = description.split(" - ")[0]?.split("|")[0]?.trim() || "سند صرف";

      rows.push({
        id: `tx-${transaction.id}`,
        employeeName: employee.name,
        employeeDept: employee.dept,
        employeeBranch: employee.branch,
        type: deductionType,
        description,
        amount: Number(linkedVoucher?.amount ?? transaction.amount ?? 0),
        date: linkedVoucher?.date || transaction.transaction_date || linkedVoucher?.created_at?.split("T")[0] || "",
        source: "سند صرف",
        sourceId: linkedVoucher?.id || null,
        status: linkedVoucher?.status === "draft" ? "مسودة" : "مرحّل",
        reference: linkedVoucher?.ref_number || undefined,
      });
    });

    // Legacy employee vouchers without linked_transaction_id
    paymentVouchers.forEach((voucher: any) => {
      if (voucher.linked_transaction_id) return;

      const employee = resolveEmployeeByDescription(voucher.description || voucher.notes || "");
      if (!employee) return;
      const voucherDesc = voucher.description || voucher.notes || "";
      if (isSalaryPayout(voucherDesc, voucher.ref_number) || isSystemCashDiff("", voucherDesc)) return;

      const deductionType = voucherDesc.split(" - ")[0]?.split("|")[0]?.trim() || "سند صرف";

      rows.push({
        id: `pv-${voucher.id}`,
        employeeName: employee.name,
        employeeDept: employee.dept,
        employeeBranch: employee.branch,
        type: deductionType,
        description: voucher.description || voucher.notes || "",
        amount: Number(voucher.amount || 0),
        date: voucher.date || voucher.created_at?.split("T")[0] || "",
        source: "سند صرف",
        sourceId: voucher.id,
        status: voucher.status === "draft" ? "مسودة" : "مرحّل",
        reference: voucher.ref_number || undefined,
      });
    });

    // POS employee-account (from employee_financial_movements)
    posTransactions.forEach((mov: any) => {
      const employee = employeeDirectory.byId[mov.employee_id] || resolveEmployeeByDescription(mov.description || "");
      const employeeName = mov.employees?.full_name || employee?.name || "—";

      rows.push({
        id: `pos-${mov.id}`,
        employeeName,
        employeeDept: mov.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[mov.employees?.branch_id] || employee?.branch || "",
        type: "أكل / POS",
        description: mov.description || `فاتورة POS #${mov.source_reference || ""}`,
        amount: Number(mov.amount || 0),
        date: mov.movement_date || mov.created_at?.split("T")[0] || "",
        source: "نقطة البيع",
        sourceId: mov.source_id || mov.id,
        status: mov.status === "approved" ? "نشط" : (mov.status || "مرحّل"),
      });
    });

    // سداد الموظف (سند قبض دائنه حساب ذمة الموظف) — يُطرح من الخصومات
    employeeSettlements.forEach((transaction: any) => {
      const matches = employeeDirectory.byAccountCode.get(transaction.credit_account_code) || [];
      const employee =
        matches.length === 1
          ? matches[0]
          : matches.length > 1
            ? resolveEmployeeByDescription(transaction.description || "") || matches[0]
            : null;
      if (!employee) return;
      const amount = Number(transaction.amount || 0);
      if (!amount) return;

      rows.push({
        id: `set-${transaction.id}`,
        employeeName: employee.name,
        employeeDept: employee.dept,
        employeeBranch: employee.branch,
        type: "سداد",
        description: transaction.description || "سداد من الموظف",
        amount: -amount,
        date: transaction.transaction_date || transaction.created_at?.split("T")[0] || "",
        source: "سند قبض",
        sourceId: transaction.id,
        status: "مرحّل",
        category: "settlement",
        reference: transaction.reference || undefined,
      });
    });

    // كل القيود المدينة على ذمة الموظف (قيود محاسبية يدوية / سحب من الكاش / عجز …)
    {
      const seenRefs = new Set(
        rows.filter((r) => r.reference).map((r) => `${r.reference}|${r.employeeName}|${Number(r.amount).toFixed(2)}`)
      );
      const seenKeys = new Set(rows.map((r) => `${r.employeeName}|${r.date}|${Number(r.amount).toFixed(2)}`));

      subledgerDebits.forEach((transaction: any) => {
        const matches = employeeDirectory.byAccountCode.get(transaction.debit_account_code) || [];
        const employee =
          matches.length === 1
            ? matches[0]
            : matches.length > 1
              ? resolveEmployeeByDescription(transaction.description || "") || matches[0]
              : null;
        if (!employee) return;

        const amount = Number(transaction.amount || 0);
        if (!amount) return;
        const description = transaction.description || "";
        const ref = transaction.reference || "";
        if (isSalaryPayout(description, ref) || isSystemCashDiff("", description)) return;
        // فواتير نقطة البيع تُحتسب من حركات الأكل فقط (تفادي الازدواج وبند «أخرى»)
        if (isPosSaleEntry(description, ref)) return;

        const date = transaction.transaction_date || transaction.created_at?.split("T")[0] || "";
        const refKey = `${ref}|${employee.name}|${amount.toFixed(2)}`;
        const key = `${employee.name}|${date}|${amount.toFixed(2)}`;
        if (ref && seenRefs.has(refKey)) return;
        if (seenKeys.has(key)) return;
        seenRefs.add(refKey);
        seenKeys.add(key);

        rows.push({
          id: `sub-${transaction.id}`,
          employeeName: employee.name,
          employeeDept: employee.dept,
          employeeBranch: employee.branch,
          type: /^B?PV/i.test(ref) ? "سند صرف" : "قيد محاسبي",
          description,
          amount,
          date,
          source: /^B?PV/i.test(ref) ? "سند صرف" : "خصم يدوي",
          sourceId: transaction.id,
          status: "مرحّل",
          reference: ref || undefined,
        });
      });

      // فائض الصندوق: قيد دائنه حساب فروقات/فائض الصندوق واسم الموظف في البيان
      surplusTransactions.forEach((transaction: any) => {
        const description = transaction.description || "";
        if (!/فائض/.test(description)) return;
        const employee = resolveEmployeeByLooseName(description);
        if (!employee) return;

        const amount = Number(transaction.amount || 0);
        if (!amount) return;
        const date = transaction.transaction_date || transaction.created_at?.split("T")[0] || "";
        const ref = transaction.reference || "";
        const key = `${employee.name}|${date}|${amount.toFixed(2)}`;
        if (ref && seenRefs.has(`${ref}|${employee.name}|${amount.toFixed(2)}`)) return;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        rows.push({
          id: `srp-${transaction.id}`,
          employeeName: employee.name,
          employeeDept: employee.dept,
          employeeBranch: employee.branch,
          type: "فائض صندوق",
          description,
          amount,
          date,
          source: "خصم يدوي",
          sourceId: transaction.id,
          status: "مرحّل",
          category: "cash_surplus",
          reference: ref || undefined,
        });
      });
    }

    // Advances
    advances.forEach((advance: any) => {
      const employee = employeeDirectory.byId[advance.employee_id] || resolveEmployeeByDescription(advance.notes || "");
      if (isSalaryPayout(advance.notes || "")) return;
      // القروض الحسنة تُحتسب عبر أقساطها المستحقة (loan_installments) وليس كأصل قرض
      if (advance.advance_type === "قرض_حسن") return;
      rows.push({
        id: `adv-${advance.id}`,
        employeeName: advance.employees?.full_name || employee?.name || "—",
        employeeDept: advance.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[advance.employees?.branch_id] || employee?.branch || "",
        type: "سلفة",
        description: advance.notes || "",
        amount: Number(advance.amount || 0),
        date: advance.payment_date || advance.approved_date || advance.created_at?.split("T")[0] || "",
        source: "سلفة",
        sourceId: advance.id,
        status: advance.status === "approved" ? "نشط" : advance.status,
      });
    });

    // أقساط القرض الحسن المستحقة (تاريخ الاستحقاق 27→3 يُحتسب على الشهر السابق)
    // يُعرض قسط واحد فقط: قسط شهر الرواتب الحالي (المحدد بنهاية الفترة)
    const payrollMonthKey = loanPayrollDate(
      (dateTo || new Date().toISOString().slice(0, 10))
    ).slice(0, 7);
    loanInstallments.forEach((inst: any) => {
      const due = inst.due_date || "";
      const payrollDate = loanPayrollDate(due);
      if (payrollDate.slice(0, 7) !== payrollMonthKey) return;
      const employee = employeeDirectory.byId[inst.employee_id];
      const employeeName = employee?.name || "—";
      rows.push({
        id: `loan-${inst.id}`,
        employeeName,
        employeeDept: employee?.dept || "",
        employeeBranch: employee?.branch || "",
        type: "قرض حسن",
        description: `قسط قرض حسن ${inst.month_number ? `#${inst.month_number}` : ""} — استحقاق ${due}`.trim(),
        amount: Number(inst.installment_amount || 0),
        date: payrollDate,
        source: "قرض حسن",
        sourceId: inst.loan_id || inst.id,
        status: inst.status === "paid" ? "مخصوم" : "مستحق",
        category: "loan_installment",
      });
    });

    // Employee financial movements (ledger-synced advances / finance entries / deductions)
    // مفتاحان للتحقق من التكرار: بالمرجع (أدق) وبالاسم/التاريخ/المبلغ (احتياطي)
    const existingRefKeys = new Set(
      rows.filter((r) => r.reference).map((r) => `${r.reference}|${r.employeeName}|${Number(r.amount).toFixed(2)}`)
    );
    const existingKeys = new Set(
      rows.map((r) => `${r.employeeName}|${r.date}|${Number(r.amount).toFixed(2)}`)
    );

    financialMovements.forEach((mov: any) => {
      const employee = employeeDirectory.byId[mov.employee_id] || resolveEmployeeByDescription(mov.description || "");
      const employeeName = mov.employees?.full_name || employee?.name || "—";
      const date = mov.movement_date || mov.created_at?.split("T")[0] || "";
      const amount = Number(mov.amount || 0);
      const movDesc = mov.description || mov.notes || mov.source_reference || "";
      if (isSalaryPayout(movDesc, mov.source_reference, mov.category)) return;
      if (isSystemCashDiff(mov.source_type, movDesc)) return;
      const key = `${employeeName}|${date}|${amount.toFixed(2)}`;
      const ref = mov.source_reference || "";
      const refKey = `${ref}|${employeeName}|${amount.toFixed(2)}`;
      if (ref) {
        if (existingRefKeys.has(refKey)) return; // نفس السند مُدرج مسبقاً
        existingRefKeys.add(refKey);
      } else {
        if (existingKeys.has(key)) return; // already listed via voucher/transaction/advance
      }
      existingKeys.add(key);

      const isAdvance = mov.category === "advance" || mov.source_type === "hr_advance";
      const isLoan = mov.category === "loan_installment" || mov.source_type === "loan_installment";

      rows.push({
        id: `efm-${mov.id}`,
        employeeName,
        employeeDept: mov.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[mov.employees?.branch_id] || employee?.branch || "",
        type: isAdvance ? "سلفة" : isLoan ? "قرض حسن" : mov.category || "خصم",
        description: mov.description || mov.notes || mov.source_reference || "",
        amount,
        date,
        source: isAdvance ? "سلفة" : isLoan ? "قرض حسن" : "خصم يدوي",
        sourceId: mov.source_id || mov.id,
        status: mov.status === "approved" ? "معتمد للخصم" : mov.status === "deducted" ? "مخصوم" : mov.status || "—",
        category: mov.category || undefined,
        reference: mov.source_reference || undefined,
      });
    });

    const isMalaky = /الملكي/.test(String(company?.name || ""));
    return rows
      .map((r) => {
        const bucket = classifyBucket(r.source, r.type, r.description, r.category);
        const adj = bucket === "shortage" || bucket === "surplus" ? findAdjustment(r) : undefined;
        return {
          ...r,
          excluded: !!findExclusion(r),
          amount: adj ? adj.adjusted : r.amount,
          originalAmount: r.amount,
          adjusted: !!adj,
          adjustmentId: adj?.id ?? null,
          adjustReason: adj?.reason ?? null,
        };
      })
      .filter((r) => showExcluded || !r.excluded)
      .filter((r) => !isMalaky || !isCarriedOverJuneAdvance({
          movement_date: r.date,
          category: classifyBucket(r.source, r.type, r.description, r.category),
          description: `${r.type} ${r.description}`,
        }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id));
  }, [manualDeductions, employeeTransactions, latestVoucherByTransactionId, paymentVouchers, posTransactions, employeeSettlements, subledgerDebits, surplusTransactions, advances, loanInstallments, financialMovements, employeeDirectory, branchMap, dateTo, company?.name, excludedMap, showExcluded, findAdjustment]);

  // Unique types for filter
  const uniqueTypes = useMemo(() => {
    const s = new Set(allRows.map(r => r.type));
    return ["الكل", ...Array.from(s)];
  }, [allRows]);

  // Filter
  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (search && !r.employeeName.includes(search) && !r.description.includes(search) && !r.type.includes(search)) return false;
      if (sourceFilter !== "الكل" && r.source !== sourceFilter) return false;
      if (typeFilter !== "الكل" && r.type !== typeFilter) return false;
      const pinnedMonth = getPinnedMonth(r);
      if (selectedMonth !== "custom" && pinnedMonth && pinnedMonth !== selectedMonth) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo && !isPinnedToSelectedMonth(r)) return false;
      return true;
    });
  }, [allRows, search, sourceFilter, typeFilter, dateFrom, dateTo, selectedMonth, getPinnedMonth, isPinnedToSelectedMonth]);

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  // Aggregated per-employee summary with opening balance + category columns
  const summary = useMemo(() => {
    const matchesNonDate = (r: typeof allRows[0]) => {
      if (search && !r.employeeName.includes(search) && !r.description.includes(search) && !r.type.includes(search)) return false;
      if (sourceFilter !== "الكل" && r.source !== sourceFilter) return false;
      if (typeFilter !== "الكل" && r.type !== typeFilter) return false;
      return true;
    };

    const map = new Map<string, {
      employeeName: string;
      employeeNumber: string;
      employeeBranch: string;
      opening: number;
      buckets: Record<BucketKey, number>;
      period: number;
      rows: (typeof allRows[0] & { bucket: BucketKey })[];
    }>();

    const ensure = (r: typeof allRows[0]) => {
      const key = r.employeeName || "—";
      if (!map.has(key)) {
        map.set(key, {
          employeeName: key,
        employeeNumber: SUPPRESSED_EMPLOYEE_NUMBERS.has(normalizeArabicName(key))
          ? ""
          : employeeDirectory.byNormalizedName.get(normalizeArabicName(key))?.number || "",
          employeeBranch: r.employeeBranch,
          opening: 0,
          buckets: emptyBuckets(),
          period: 0,
          rows: [],
        });
      }
      const entry = map.get(key)!;
      if (!entry.employeeBranch && r.employeeBranch) entry.employeeBranch = r.employeeBranch;
      return entry;
    };

    allRows.forEach((r) => {
      if (!matchesNonDate(r)) return;
      const pinnedMonth = getPinnedMonth(r);
      if (selectedMonth !== "custom" && pinnedMonth && pinnedMonth !== selectedMonth) return;
      const pinnedHere = isPinnedToSelectedMonth(r);
      if (dateFrom && r.date && r.date < dateFrom) {
        // ما قبل 1/7/2026 مُغلق ضمن الأرباح والخسائر — لا يُرحَّل كرصيد افتتاحي
        if (r.date < OPENING_CUTOFF) { ensure(r); return; }
        ensure(r).opening += r.amount;
        return;
      }
      if (dateTo && r.date > dateTo && !pinnedHere) return;
      const bucket = classifyBucket(r.source, r.type, r.description, r.category);
      const entry = ensure(r);
      const signed = r.amount;
      entry.buckets[bucket] += signed;
      entry.period += signed;
      entry.rows.push({ ...r, bucket });
    });

    return Array.from(map.values())
      // مقاصّة السداد مقابل الخصومات: ما سدّده الموظف يُطرح من بنوده
      // (مشتريات ثم أخرى ثم سندات صرف …) فلا يبقى ظاهراً كخصم مستحق.
      .map((e) => {
        let remaining = -e.buckets.settlement; // موجب = مبلغ مسدَّد
        if (remaining <= 0.0001) return e;
        const order: BucketKey[] = ["purchase", "other", "voucher", "advance", "transport", "meal", "penalty", "shortage", "surplus", "loan"];
        const buckets = { ...e.buckets };
        for (const k of order) {
          if (remaining <= 0.0001) break;
          if (buckets[k] <= 0) continue;
          const applied = Math.min(buckets[k], remaining);
          buckets[k] -= applied;
          remaining -= applied;
        }
        buckets.settlement = -remaining;
        return { ...e, buckets };
      })
      .map((e) => {
        const override =
          OPENING_OVERRIDES[normalizeArabicName(e.employeeName)] ??
          OPENING_OVERRIDES_NORMALIZED[openingKey(e.employeeName)];
        return { ...e, opening: override === undefined ? e.opening : override };
      })
      .map((e) => ({ ...e, total: e.opening + e.period }))
      .filter((e) => e.total !== 0 || e.rows.length > 0)
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "number") {
          const na = Number(a.employeeNumber) || Number.MAX_SAFE_INTEGER;
          const nb = Number(b.employeeNumber) || Number.MAX_SAFE_INTEGER;
          if (na !== nb) return (na - nb) * dir;
          return a.employeeName.localeCompare(b.employeeName, "ar") * dir;
        }
        if (sortKey === "name") return a.employeeName.localeCompare(b.employeeName, "ar") * dir;
        if (sortKey === "branch") return (a.employeeBranch || "").localeCompare(b.employeeBranch || "", "ar") * dir;
        if (sortKey === "opening") return (a.opening - b.opening) * dir;
        if (sortKey === "total") return (a.total - b.total) * dir;
        return ((a.buckets[sortKey as BucketKey] || 0) - (b.buckets[sortKey as BucketKey] || 0)) * dir;
      });
  }, [allRows, search, sourceFilter, typeFilter, dateFrom, dateTo, selectedMonth, employeeDirectory, sortKey, sortDir, getPinnedMonth, isPinnedToSelectedMonth]);

  const summaryTotals = useMemo(() => {
    return summary.reduce(
      (acc, e) => {
        acc.opening += e.opening;
        (Object.keys(acc.buckets) as BucketKey[]).forEach((k) => { acc.buckets[k] += e.buckets[k]; });
        acc.total += e.total;
        return acc;
      },
      { opening: 0, buckets: emptyBuckets(), total: 0 }
    );
  }, [summary]);

  /** إخفاء الأعمدة الفارغة تماماً (مثل سندات الصرف عندما تُصنَّف كلها ضمن فئات أخرى) */
  const ALWAYS_VISIBLE: BucketKey[] = ["shortage", "surplus"];
  const visibleBuckets = useMemo(
    () => BUCKET_ORDER.filter((k) => ALWAYS_VISIBLE.includes(k) || Math.abs(summaryTotals.buckets[k]) > 0.0001),
    [summaryTotals]
  );

  const handleNavigateToSource = async (row: typeof allRows[0]) => {
    const ref = (row.reference || "").trim();

    // 1) المرجع (QV / BPV / PV / REC …) → افتح المستند نفسه بشكل مباشر
    if (ref && dataOwnerId) {
      const route = await resolveDocumentRoute({
        ownerId: dataOwnerId,
        reference: ref,
        transactionType: /^QV|^JV/i.test(ref) ? "journal" : /^B?PV/i.test(ref) ? "payment" : /^B?R(EC|V)/i.test(ref) ? "receipt" : null,
        transactionId: row.sourceId || "",
      });
      if (route) {
        navigate(route);
        return;
      }
    }

    // 2) سند صرف معروف بالمعرّف
    if (row.source === "سند صرف" && row.sourceId) {
      navigate(`/finance/payment/${row.sourceId}/edit`);
      return;
    }
    if (row.source === "نقطة البيع") {
      navigate(`/pos-reports`);
      return;
    }
    if (row.source === "سلفة" || row.source === "قرض حسن") {
      navigate(`/loans`);
      return;
    }
    toast.info("لا يوجد مستند مرتبط بهذه الحركة");
  };

  const handleDelete = async (row: typeof allRows[0]) => {
    if (row.source !== "خصم يدوي") {
      toast.error("لا يمكن حذف سجل من مصدر خارجي. يرجى الذهاب للمصدر الأصلي.");
      return;
    }
    const { error } = await supabase.from("employee_deductions").delete().eq("id", row.id);
    if (error) toast.error("خطأ في الحذف");
    else { toast.success("تم الحذف"); refetchDeductions(); }
  };

  const handleExport = () => {
    const rowsForExport = viewMode === "summary"
      ? summary.map((e) => ({
          "الرقم الوظيفي": e.employeeNumber || "",
          "الموظف": e.employeeName,
          "الفرع": e.employeeBranch || "—",
          "رصيد ابتدائي": e.opening,
          ...Object.fromEntries(visibleBuckets.map((k) => [BUCKET_LABELS[k], e.buckets[k]])),
          "الإجمالي": e.total,
        }))
      : filtered.map(r => ({
      "الموظف": r.employeeName,
      "الفرع": r.employeeBranch,
      "النوع": r.type,
      "المصدر": r.source,
      "الوصف": r.description,
      "المبلغ": r.amount,
      "التاريخ": r.date,
      "الحالة": r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rowsForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الخصومات");
    setNextExportBranding({ title: "الخصومات" });
    XLSX.writeFile(wb, "hr-deductions.xlsx");
  };

  const statusBadge = (status: string) => {
    if (status === "مرحّل" || status === "تم الاستقطاع") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{status}</Badge>;
    if (status === "معتمد للخصم" || status === "نشط") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "ملغى") return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  const handlePrint = () => {
    const period = `الفترة: ${dateFrom || "—"} إلى ${dateTo || "—"}`;
    const info = [
      { label: "الفترة", value: `${dateFrom || "—"} → ${dateTo || "—"}` },
      { label: "المصدر", value: sourceFilter },
      { label: "النوع", value: typeFilter },
      { label: "بحث", value: search || "—" },
    ];

    if (viewMode === "summary") {
      if (!summary.length) { toast.error("لا توجد بيانات للطباعة"); return; }
      const columns: PrintListColumn<typeof summary[0]>[] = [
        { key: "no", label: "الرقم الوظيفي", render: (r) => esc(r.employeeNumber || "—") },
        { key: "emp", label: "الموظف", render: (r) => esc(r.employeeName) },
        { key: "branch", label: "الفرع", render: (r) => esc(r.employeeBranch || "—") },
        { key: "opening", label: "رصيد ابتدائي", align: "left", render: (r) => fmtNum(r.opening) },
        ...visibleBuckets.map((k) => ({
          key: k,
          label: BUCKET_LABELS[k],
          align: "left" as const,
          render: (r: typeof summary[0]) => fmtNum(r.buckets[k]),
        })),
        { key: "total", label: "الإجمالي", align: "left", render: (r) => fmtNum(r.total) },
      ];
      printVoucherList({
        title: "كشف الخصومات والمسحوبات (تجميعي)",
        subtitle: period,
        companyName: company?.name || "",
        rows: summary,
        columns,
        summary: [
          { label: "عدد الموظفين", value: String(summary.length) },
          { label: "رصيد ابتدائي", value: fmtNum(summaryTotals.opening) },
          { label: "حركة الفترة", value: fmtNum(summaryTotals.total - summaryTotals.opening) },
          { label: "الإجمالي", value: fmtNum(summaryTotals.total) },
        ],
        info,
        totalsLabel: `الإجمالي (${summary.length} موظف)`,
        totalsCells: [
          null, "", "",
          fmtNum(summaryTotals.opening),
          ...visibleBuckets.map((k) => fmtNum(summaryTotals.buckets[k])),
          fmtNum(summaryTotals.total),
        ],
      });
      return;
    }

    if (!filtered.length) { toast.error("لا توجد بيانات للطباعة"); return; }
    const columns: PrintListColumn<typeof filtered[0]>[] = [
      { key: "date", label: "التاريخ", render: (r) => esc(r.date || "—") },
      { key: "emp", label: "الموظف", render: (r) => esc(r.employeeName) },
      { key: "branch", label: "الفرع", render: (r) => esc(r.employeeBranch || "—") },
      { key: "type", label: "النوع", render: (r) => esc(r.type) },
      { key: "source", label: "المصدر", render: (r) => esc(r.source) },
      { key: "desc", label: "الوصف", render: (r) => esc(r.description || "—") },
      { key: "status", label: "الحالة", render: (r) => esc(r.status || "—") },
      { key: "amount", label: "المبلغ", align: "left", render: (r) => fmtNum(r.amount) },
    ];
    printVoucherList({
      title: "كشف الخصومات والمسحوبات (الحركات)",
      subtitle: period,
      companyName: company?.name || "",
      rows: filtered,
      columns,
      summary: [
        { label: "عدد السجلات", value: String(filtered.length) },
        { label: "إجمالي الخصومات", value: fmtNum(totalAmount) },
      ],
      info,
      isCancelled: (r) => r.status === "ملغى",
      totalsLabel: `الإجمالي (${filtered.length} سجل)`,
      totalsCells: [null, "", "", "", "", "", "", fmtNum(totalAmount)],
    });
  };

  const handleRefresh = () => {
    [
      "hr-employees",
      "hr-branches",
      "hr-employee-accounts",
      "hr-all-deductions",
      "hr-payment-vouchers",
      "hr-employee-payment-transactions",
      "hr-advances-deductions",
      "hr-pos-employee-txns",
      "hr-loan-installments",
      "hr-employee-financial-movements",
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    toast.success("تم تحديث البيانات");
  };

  const actionTabs: ActionTab[] = [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "view",
          label: "العرض",
          items: [
            { key: "summary", label: "تجميعي", icon: Table2, onClick: () => setViewMode("summary"), variant: viewMode === "summary" ? "primary" : "default" },
            { key: "movements", label: "الحركات", icon: LayoutList, onClick: () => setViewMode("movements"), variant: viewMode === "movements" ? "primary" : "default" },
            {
              key: "excluded",
              label: showExcluded ? `إخفاء المستثنى (${excludedMap.size})` : `إظهار المستثنى (${excludedMap.size})`,
              icon: showExcluded ? EyeOff : Eye,
              onClick: () => setShowExcluded((v) => !v),
              variant: showExcluded ? "primary" : "default",
            },
          ],
        },
        {
          key: "output",
          label: "المخرجات",
          items: [
            { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint },
            { key: "excel", label: "تصدير Excel", icon: Download, onClick: handleExport },
          ],
        },
        {
          key: "data",
          label: "البيانات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: handleRefresh },
          ],
        },
      ],
    },
  ];

  return (
    <FinanceShell
      title="الخصومات والمسحوبات"
      subtitle="جميع خصومات الموظفين من سندات الصرف، نقطة البيع، السلف، والخصومات اليدوية"
      breadcrumb={[{ label: "الموارد البشرية", href: "/hr" }, { label: "الخصومات" }]}
      actionTabs={actionTabs}
      storageKey="hr-deductions-page"
      rightSlot={
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الوصف..."
            className="h-8 w-56 pr-8 text-xs"
          />
        </div>
      }
    >
    <div className="space-y-4 hr-themed" dir="rtl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {viewMode === "summary" ? "إجمالي الخصومات (شامل الرصيد الابتدائي)" : "إجمالي حركات الفترة"}
          </p>
          <p className="text-lg font-bold text-destructive">
            {formatCurrency(viewMode === "summary" ? summaryTotals.total : totalAmount)}
          </p>
          {viewMode === "summary" && Math.abs(summaryTotals.opening) > 0.0001 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              حركة الفترة {formatCurrency(summaryTotals.total - summaryTotals.opening)} + ابتدائي {formatCurrency(summaryTotals.opening)}
            </p>
          )}
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">عدد السجلات</p>
          <p className="text-lg font-bold text-foreground">{filtered.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">سندات الصرف</p>
          <p className="text-lg font-bold text-foreground">{filtered.filter(r => r.source === "سند صرف").length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">نقطة البيع</p>
          <p className="text-lg font-bold text-foreground">{filtered.filter(r => r.source === "نقطة البيع").length}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]"><Filter className="h-3 w-3 ml-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEDUCTION_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            {uniqueTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <HRDateRangeFilter
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
          fieldClassName="w-[190px] min-w-[190px]"
          inlineLabels
        />

        {/* اختصار سريع: اختيار شهر يضبط من/إلى تلقائياً */}
        <Select
          value={selectedMonth}
          onValueChange={(v) => {
            if (v === "custom") return;
            const [y, m] = v.split("-").map(Number);
            const last = new Date(y, m, 0).getDate();
            setDateFrom(`${y}-${String(m).padStart(2, "0")}-01`);
            setDateTo(`${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`);
          }}
        >
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="شهر" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">فترة مخصصة</SelectItem>
            {MONTH_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary (pivot) table */}
      {viewMode === "summary" ? (
        <Table>
          <TableHeader className="sticky top-0 z-30 shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
            <TableRow>
              <TableHead className="text-right w-[32px]" />
              <TableHead className="text-right whitespace-nowrap">
                <SortHeader label="الرقم الوظيفي" k="number" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader label="الموظف" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader label="الفرع" k="branch" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableHead>
              <TableHead className="text-right whitespace-nowrap">
                <SortHeader label="رصيد ابتدائي" k="opening" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableHead>
              {visibleBuckets.map((k) => (
                <TableHead key={k} className="text-right whitespace-nowrap">
                  <SortHeader label={BUCKET_LABELS[k]} k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </TableHead>
              ))}
              <TableHead className="text-right">
                <SortHeader label="الإجمالي" k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + visibleBuckets.length} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell>
              </TableRow>
            ) : (
              summary.map((e) => (
                <Fragment key={e.employeeName}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpanded(expanded === e.employeeName ? null : e.employeeName)}
                  >
                    <TableCell className="p-1">
                      {expanded === e.employeeName ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{e.employeeNumber || "—"}</TableCell>
                    <TableCell className="font-medium text-sm">{e.employeeName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.employeeBranch || "—"}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(e.opening)}</TableCell>
                    {visibleBuckets.map((k) => (
                      <TableCell key={k} className="text-sm">{formatCurrency(e.buckets[k])}</TableCell>
                    ))}
                    <TableCell className="text-sm font-bold text-destructive">{formatCurrency(e.total)}</TableCell>
                  </TableRow>
                  {expanded === e.employeeName && (
                    <TableRow key={`${e.employeeName}-details`} className="bg-muted/30">
                      <TableCell colSpan={6 + visibleBuckets.length} className="p-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">التاريخ</TableHead>
                              <TableHead className="text-right">التصنيف</TableHead>
                              <TableHead className="text-right">النوع</TableHead>
                              <TableHead className="text-right">المصدر</TableHead>
                              <TableHead className="text-right">الملاحظة / الوصف</TableHead>
                              <TableHead className="text-right">المبلغ</TableHead>
                              <TableHead className="text-right">الحالة</TableHead>
                              <TableHead className="text-right w-[60px]">القيد / السند</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {e.rows.map((row) => (
                              <TableRow key={row.id} className={row.excluded ? "opacity-60" : undefined}>
                                <TableCell className="text-xs">{row.date}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[10px]">{BUCKET_LABELS[row.bucket]}</Badge></TableCell>
                                <TableCell className="text-xs">{row.type}</TableCell>
                                <TableCell className="text-xs">{row.source}</TableCell>
                                <TableCell className="text-xs">
                                  {row.description || "—"}
                                  {row.excluded && <Badge variant="outline" className="mr-1 text-[10px]">مستثنى</Badge>}
                                  {row.adjusted && (
                                    <Badge variant="outline" className="mr-1 text-[10px] border-amber-400 text-amber-600">
                                      معدَّل{row.adjustReason ? `: ${row.adjustReason}` : ""}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-destructive">
                                  {formatCurrency(row.amount)}
                                  {row.adjusted && (
                                    <span className="mr-1 text-[10px] font-normal text-muted-foreground line-through">
                                      {formatCurrency(row.originalAmount)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>{statusBadge(row.status)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {(row.sourceId || row.reference) && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleNavigateToSource(row)} title="فتح المصدر (سند الصرف / القيد)">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {(row.bucket === "shortage" || row.bucket === "surplus") && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className={`h-7 w-7 ${row.adjusted ? "text-amber-600" : ""}`}
                                        title="تعديل مبلغ العجز / الفائض"
                                        onClick={() => {
                                          setAdjustValue(String(row.amount));
                                          setAdjustReason(row.adjustReason || "");
                                          setAdjustTarget({
                                            id: row.id,
                                            sourceId: row.sourceId,
                                            employeeName: row.employeeName,
                                            description: row.description,
                                            amount: row.amount,
                                            originalAmount: row.originalAmount,
                                            bucket: row.bucket,
                                            adjustmentId: row.adjustmentId,
                                          });
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      title={row.excluded ? "إعادة احتسابه كخصم" : "ليس خصماً (استثناء)"}
                                      onClick={() => {
                                        if (row.excluded) { toggleExclusion(row, ""); return; }
                                        setExcludeReason("");
                                        setExcludeTarget({ id: row.id, sourceId: row.sourceId, employeeName: row.employeeName, description: row.description, amount: row.amount });
                                      }}
                                    >
                                      {row.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
          {summary.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-bold text-sm">الإجمالي</TableCell>
                <TableCell className="font-bold text-sm">{formatCurrency(summaryTotals.opening)}</TableCell>
                {visibleBuckets.map((k) => (
                  <TableCell key={k} className="font-bold text-sm">{formatCurrency(summaryTotals.buckets[k])}</TableCell>
                ))}
                <TableCell className="font-bold text-sm text-destructive">{formatCurrency(summaryTotals.total)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      ) : (
      <Table>
        <TableHeader className="sticky top-0 z-30 shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
          <TableRow>
            <TableHead className="text-right">الموظف</TableHead>
            <TableHead className="text-right">الفرع</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">المصدر</TableHead>
            <TableHead className="text-right">الوصف</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right w-[80px]">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">لا توجد خصومات مسجلة</TableCell>
            </TableRow>
          ) : (
            filtered.map(row => (
              <TableRow key={row.id} className={row.excluded ? "opacity-60" : undefined}>
                <TableCell className="font-medium text-sm">{row.employeeName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.employeeBranch || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{row.type}</Badge></TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {row.source === "سند صرف" && "📄"}
                    {row.source === "نقطة البيع" && "🖥️"}
                    {row.source === "خصم يدوي" && "✏️"}
                    {row.source === "سلفة" && "💵"}
                    {row.source === "قرض حسن" && "🤝"}
                    {" "}{row.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs truncate max-w-[180px]">
                  {row.description || "—"}
                  {row.excluded && <Badge variant="outline" className="mr-1 text-[10px]">مستثنى</Badge>}
                </TableCell>
                <TableCell className="font-semibold text-sm text-destructive">{formatCurrency(row.amount)}</TableCell>
                <TableCell className="text-xs">{row.date}</TableCell>
                <TableCell>{statusBadge(row.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(row.sourceId || row.reference) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleNavigateToSource(row)} title="الذهاب للمصدر">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {row.source === "خصم يدوي" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row)} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={row.excluded ? "إعادة احتسابه كخصم" : "ليس خصماً (استثناء)"}
                      onClick={() => {
                        if (row.excluded) { toggleExclusion(row, ""); return; }
                        setExcludeReason("");
                        setExcludeTarget({ id: row.id, sourceId: row.sourceId, employeeName: row.employeeName, description: row.description, amount: row.amount });
                      }}
                    >
                      {row.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="font-bold text-sm">الإجمالي</TableCell>
              <TableCell className="font-bold text-sm text-destructive">{formatCurrency(totalAmount)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      )}

      <Dialog open={!!excludeTarget} onOpenChange={(o) => !o && setExcludeTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>استثناء البند من الخصومات</DialogTitle>
          </DialogHeader>
          {excludeTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">الموظف:</span> {excludeTarget.employeeName}</div>
                <div><span className="text-muted-foreground">البيان:</span> {excludeTarget.description || "—"}</div>
                <div><span className="text-muted-foreground">المبلغ:</span> {formatCurrency(excludeTarget.amount)}</div>
              </div>
              <p className="text-xs text-muted-foreground">
                سيبقى القيد كما هو في المحاسبة، لكنه لن يُحتسب ضمن خصومات الراتب.
              </p>
              <Textarea
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
                placeholder="سبب الاستثناء (مثال: تعويض سابق - ليس خصماً من الراتب)"
                rows={3}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExcludeTarget(null)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!excludeTarget) return;
                await toggleExclusion(excludeTarget, excludeReason.trim());
                setExcludeTarget(null);
              }}
            >
              تأكيد الاستثناء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تعديل مبلغ العجز / الفائض */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل مبلغ {adjustTarget?.bucket === "surplus" ? "الفائض" : "العجز"}</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">الموظف:</span> {adjustTarget.employeeName}</div>
                <div><span className="text-muted-foreground">البيان:</span> {adjustTarget.description || "—"}</div>
                <div><span className="text-muted-foreground">المبلغ الأصلي:</span> {formatCurrency(adjustTarget.originalAmount)}</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">المبلغ المعتمد للخصم</label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(e.target.value)}
                  className="text-right"
                />
              </div>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="سبب التعديل (مثال: تخفيف على الموظف بقرار الإدارة)"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                القيد المحاسبي يبقى كما هو — التعديل يُعتمد في احتساب الخصومات فقط.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            {adjustTarget?.adjustmentId && (
              <Button
                variant="outline"
                onClick={async () => {
                  await removeAdjustment(adjustTarget.adjustmentId as string);
                  setAdjustTarget(null);
                }}
              >
                إلغاء التعديل
              </Button>
            )}
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>إغلاق</Button>
            <Button
              onClick={async () => {
                if (!adjustTarget) return;
                const value = Number(adjustValue);
                if (!Number.isFinite(value)) { toast.error("أدخل مبلغاً صحيحاً"); return; }
                await saveAdjustment(
                  {
                    id: adjustTarget.id,
                    employeeName: adjustTarget.employeeName,
                    description: adjustTarget.description,
                    bucket: adjustTarget.bucket,
                    originalAmount: adjustTarget.originalAmount,
                  },
                  value,
                  adjustReason.trim()
                );
                setAdjustTarget(null);
              }}
            >
              اعتماد التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </FinanceShell>
  );
}
