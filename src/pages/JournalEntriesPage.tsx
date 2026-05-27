import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Pencil, Search, Plus, ExternalLink, Lock,
  FileText, ChevronLeft, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/permissions/Can";
import { assertPermission } from "@/lib/permissions/assertPermission";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";
import {
  FinanceShell,
  applyFilters,
  type ActionTab,
  type FilterCondition,
  type FilterField,
} from "@/components/finance/shell";

import { setNextExportBranding } from "@/lib/excel-export";
interface TransactionRow {
  id: string;
  transaction_date: string | null;
  description: string | null;
  transaction_type: string | null;
  debit_account_code: string | null;
  credit_account_code: string | null;
  amount: number;
  currency: string | null;
  reference: string | null;
  payment_method: string | null;
  is_deleted: boolean | null;
}

interface AccountRow {
  id: string;
  account_name: string;
  account_code: string;
  account_type: string;
}

// Map English transaction types from RPCs to Arabic display labels
const typeDisplayMap: Record<string, string> = {
  "sale_cash": "فاتورة مبيعات",
  "sale_bank": "فاتورة مبيعات",
  "sale_cheque": "فاتورة مبيعات",
  "sale_credit": "فاتورة مبيعات",
  "sale": "فاتورة مبيعات",
  "purchase_cash": "فاتورة مشتريات",
  "purchase_bank": "فاتورة مشتريات",
  "purchase_cheque": "فاتورة مشتريات",
  "purchase_credit": "فاتورة مشتريات",
  "purchase": "فاتورة مشتريات",
  "purchase_invoice": "فاتورة مشتريات",
  "receipt": "سند قبض",
  "payment": "سند صرف",
  "salary": "راتب",
  "employee_salary": "راتب موظف",
  "employee_payment": "دفعة موظف",
  "employee_advance": "سلفة موظف",
  "employee_deduction": "خصم موظف",
  "loan_payment": "قسط قرض",
  "loan_disbursement": "صرف قرض",
  "cheque_collection": "تحصيل شيك",
  "cheque_register": "تسجيل شيك",
  "cheque_deposit": "إيداع شيك",
  "cheque_bounce": "شيك مرتجع",
  "cheque_endorsement": "تظهير شيك",
  "cheque_return": "إرجاع شيك",
  "cheque_cancel": "إلغاء شيك",
  "bank_fee": "عمولة بنكية",
  "workshop_cost": "تكلفة ورشة",
  "workshop_payment": "دفعة ورشة",
  "workshop_invoice": "فاتورة ورشة",
  "contract": "عقد مقاولة",
  "contract_payment": "دفعة عقد",
  "pos_sale": "مبيعات POS",
  "pos_cogs": "تكلفة مبيعات",
  "pos_transfer": "ترحيل وردية",
  "pos_expense": "مصروف POS",
  "pos_meal": "وجبة موظف",
  "pos_purchase": "مشتريات POS",
  "pos_currency_exchange": "صرف عملة POS",
  "expense": "مصروفات",
  "inventory_in": "إدخال مخزون",
  "inventory_out": "إخراج مخزون",
  "import_cost": "تكلفة استيراد",
  "return": "مرتجع",
  "purchase_return": "مرتجع مشتريات",
  "sale_return": "مرتجع مبيعات",
  "cash_transfer": "تحويل صندوق",
  "bank_transfer": "تحويل بنكي",
  "exchange_diff": "فروق عملة",
  "opening_balance": "رصيد افتتاحي",
  "manual": "قيد يدوي",
  "journal": "سند صرف",
  "workshop_receipt": "دفعة ورشة",
  "asset_purchase": "شراء أصل",
  "depreciation": "إهلاك",
  "asset_disposal": "استبعاد أصل",
  "سند صرف": "سند صرف",
  "سند قبض": "سند قبض",
  "قيد يومية": "سند صرف",
  "فاتورة مشتريات": "فاتورة مشتريات",
  "فاتورة مبيعات": "فاتورة مبيعات",
};

const typeStyle: Record<string, string> = {
  "سند صرف": "bg-destructive/10 text-destructive",
  "سند قبض": "bg-primary/10 text-primary",
  "قيد يومية": "bg-destructive/10 text-destructive",
  "فاتورة مشتريات": "bg-accent text-accent-foreground",
  "فاتورة مبيعات": "bg-primary/10 text-primary",
  "راتب": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "راتب موظف": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "دفعة موظف": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "سلفة موظف": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "خصم موظف": "bg-destructive/10 text-destructive",
  "قسط قرض": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "صرف قرض": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "تحصيل شيك": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "تسجيل شيك": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "إيداع شيك": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "شيك مرتجع": "bg-destructive/10 text-destructive",
  "تظهير شيك": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "إرجاع شيك": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "إلغاء شيك": "bg-muted text-muted-foreground",
  "عمولة بنكية": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "تكلفة ورشة": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "دفعة ورشة": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "فاتورة ورشة": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "عقد مقاولة": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "دفعة عقد": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "مبيعات POS": "bg-primary/10 text-primary",
  "تكلفة مبيعات": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "ترحيل وردية": "bg-primary/10 text-primary",
  "مصروف POS": "bg-destructive/10 text-destructive",
  "وجبة موظف": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "مشتريات POS": "bg-accent text-accent-foreground",
  "صرف عملة POS": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "مصروفات": "bg-destructive/10 text-destructive",
  "إدخال مخزون": "bg-primary/10 text-primary",
  "إخراج مخزون": "bg-destructive/10 text-destructive",
  "تكلفة استيراد": "bg-accent text-accent-foreground",
  "مرتجع": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "مرتجع مشتريات": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "مرتجع مبيعات": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "تحويل صندوق": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "تحويل بنكي": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "فروق عملة": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "رصيد افتتاحي": "bg-muted text-muted-foreground",
  "قيد يدوي": "bg-muted text-muted-foreground",
  "شراء أصل": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "إهلاك": "bg-muted text-muted-foreground",
  "استبعاد أصل": "bg-destructive/10 text-destructive",
};

const PAGE_SIZE = 20;

const JournalEntriesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);

  const [editingTx, setEditingTx] = useState<TransactionRow | null>(null);
  const [editResolution, setEditResolution] = useState<{
    kind: "voucher" | "invoice" | "orphan";
    voucherId?: string;
    voucherRef?: string;
    invoiceHint?: string;
    message: string;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showJournalEntry, setShowJournalEntry] = useState(false);

  // Build account code → name map
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach(a => { map[a.account_code] = `${a.account_code} - ${a.account_name}`; });
    return map;
  }, [accounts]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txRes, accRes, profileRes] = await Promise.all([
        supabase.from("transactions")
          .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, reference, payment_method, is_deleted")
          .eq("user_id", user.id)
          .order("transaction_date", { ascending: false })
          .limit(1000),
        supabase.from("accounts")
          .select("id, account_name, account_code, account_type")
          .eq("user_id", user.id)
          .order("account_code"),
        supabase.from("profiles")
          .select("display_name, company_name")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (txRes.error) throw txRes.error;
      setTransactions(txRes.data || []);
      if (!accRes.error) setAccounts(accRes.data || []);
      if (profileRes.data) {
        setCompanyName(profileRes.data.company_name || profileRes.data.display_name || "");
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const getDisplayType = (type: string | null) => {
    if (!type) return "—";
    return typeDisplayMap[type] || type;
  };

  const filtered = useMemo(() => {
    // Default: hide soft-deleted unless user added a status condition
    const hasStatusCond = shellFilters.some((c) => c.fieldKey === "is_deleted");
    let result = hasStatusCond ? transactions : transactions.filter((tx) => !tx.is_deleted);

    result = applyFilters(result, shellFilters, (row, key) => {
      if (key === "displayType") return getDisplayType(row.transaction_type);
      if (key === "is_deleted") return row.is_deleted ? "true" : "false";
      return (row as any)[key];
    });

    if (searchQuery.trim()) {
      result = result.filter((tx) =>
        multiWordMatchAny(
          searchQuery,
          tx.description,
          accountMap[tx.debit_account_code || ""],
          accountMap[tx.credit_account_code || ""],
          tx.reference,
        ),
      );
    }

    return result.sort((a, b) =>
      (b.transaction_date || "").localeCompare(a.transaction_date || ""),
    );
  }, [transactions, shellFilters, searchQuery, accountMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [shellFilters, searchQuery]);

  const totalDebit = filtered.reduce((s, tx) => s + (tx.amount || 0), 0);
  const totalCredit = totalDebit;

  /**
   * ✅ Source of Truth: لا نعدّل صف transaction مباشرة هنا.
   * نحدد مصدر القيد ونوجّه المستخدم للمحرر الموحّد المناسب:
   *  - voucher (journal): فتح FinanceJournalPage في وضع تعديل
   *  - invoice / payment / receipt / cheque ...: عرض رسالة + رابط للمستند الأصلي
   *  - يتيم بدون مرجع: عرض رسالة "لا يمكن التعديل" مع تفسير
   */
  const openEdit = async (tx: TransactionRow) => {
    if (!user) return;
    setEditingTx(tx);
    setEditResolution(null);
    setResolving(true);

    try {
      const ref = (tx.reference || "").trim();
      const txType = (tx.transaction_type || "").toLowerCase();

      // (1) قيد يومية / رصيد افتتاحي → ابحث عن voucher مطابق
      if (ref && (txType === "journal" || txType === "opening_balance" || txType === "قيد يومية")) {
        const { data: v } = await supabase
          .from("vouchers")
          .select("id, ref_number, type, status")
          .eq("user_id", user.id)
          .eq("type", "journal")
          .eq("ref_number", ref)
          .maybeSingle();

        if (v) {
          setEditResolution({
            kind: "voucher",
            voucherId: v.id,
            voucherRef: v.ref_number,
            message: `هذا القيد مرتبط بسند يومية (${v.ref_number}). أي تعديل يجب أن يتم من خلال محرر السند الموحّد لضمان تزامن الرأس والأسطر مع كشف الحساب والتقارير.`,
          });
          return;
        }
      }

      // (2) فاتورة/سند صرف/قبض/شيك/راتب... — مرتبط بمستند آخر
      const docHints: Record<string, string> = {
        sale: "فاتورة مبيعات", sale_cash: "فاتورة مبيعات", sale_bank: "فاتورة مبيعات",
        sale_cheque: "فاتورة مبيعات", sale_credit: "فاتورة مبيعات",
        purchase: "فاتورة مشتريات", purchase_cash: "فاتورة مشتريات", purchase_bank: "فاتورة مشتريات",
        purchase_cheque: "فاتورة مشتريات", purchase_credit: "فاتورة مشتريات", purchase_invoice: "فاتورة مشتريات",
        receipt: "سند قبض", "سند قبض": "سند قبض",
        payment: "سند صرف", "سند صرف": "سند صرف",
        salary: "راتب", employee_salary: "راتب", employee_payment: "دفعة موظف",
        employee_advance: "سلفة موظف", employee_deduction: "خصم موظف",
        loan_payment: "قسط قرض", loan_disbursement: "صرف قرض",
        cheque_collection: "تحصيل شيك", cheque_register: "تسجيل شيك",
        cheque_deposit: "إيداع شيك", cheque_bounce: "شيك مرتجع",
        cheque_endorsement: "تظهير شيك", cheque_return: "إرجاع شيك",
        depreciation: "إهلاك أصل", asset_purchase: "شراء أصل", asset_disposal: "استبعاد أصل",
        pos_sale: "وردية POS", pos_cogs: "وردية POS", pos_transfer: "ترحيل وردية",
      };
      const hint = docHints[txType] || (tx.transaction_type ? typeDisplayMap[tx.transaction_type] : null);
      if (hint) {
        setEditResolution({
          kind: "invoice",
          invoiceHint: hint,
          message: `هذا القيد ناتج تلقائياً عن "${hint}"${ref ? ` (المرجع: ${ref})` : ""}. لا يمكن تعديله مباشرة من هنا — التعديل يجب أن يتم من المستند الأصلي حتى تنعكس التغييرات على المخزون والذمم وكشف الحساب معاً.`,
        });
        return;
      }

      // (3) سجل يتيم بدون مرجع — لا يمكن تعديله من هذه الشاشة
      setEditResolution({
        kind: "orphan",
        message: ref
          ? `قيد بمرجع "${ref}" غير مرتبط بسند معروف في النظام. لا يمكن تعديله من شاشة تقرير القيود؛ هذا التقرير للعرض والتدقيق فقط. للتعديل أنشئ سند قيد تسوية جديد.`
          : `هذا القيد لا يحمل أي مرجع لمستند مصدر. شاشة "تقرير القيود المحاسبية" للعرض والتدقيق فقط — أي تعديل محاسبي يجب أن يمر عبر إنشاء سند قيد تسوية جديد.`,
      });
    } finally {
      setResolving(false);
    }
  };

  const handleEditNavigate = async () => {
    if (!editResolution) return;
    if (editResolution.kind === "voucher" && editResolution.voucherId) {
      try { await assertPermission("finance", "journal", "update"); } catch { return; }
      navigate(`/finance/journals?edit=${editResolution.voucherId}`);
      setEditingTx(null);
      setEditResolution(null);
    } else if (editResolution.kind === "orphan") {
      try { await assertPermission("finance", "journal", "create"); } catch { return; }
      // افتح محرر السند الموحّد لإنشاء قيد تسوية جديد
      setEditingTx(null);
      setEditResolution(null);
      setShowJournalEntry(true);
    }
  };

  const handleExport = () => {
    const data = filtered.map(tx => ({
      "التاريخ": fmtDateDisplay(tx.transaction_date) || "",
      "الوصف": tx.description || "",
      "النوع": getDisplayType(tx.transaction_type),
      "الحساب المدين": accountMap[tx.debit_account_code || ""] || tx.debit_account_code || "",
      "الحساب الدائن": accountMap[tx.credit_account_code || ""] || tx.credit_account_code || "",
      "مدين": tx.amount || 0,
      "دائن": tx.amount || 0,
      "العملة": tx.currency || "شيكل",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "القيود المحاسبية");
    setNextExportBranding({
      title: "تقرير القيود المحاسبية",
      currency: "حسب عمود العملة لكل قيد",
      period: dateFrom || dateTo ? `${dateFrom || "—"} → ${dateTo || "—"}` : undefined,
      extraInfo: [`عدد القيود: ${data.length.toLocaleString()}`],
    });
    XLSX.writeFile(wb, `قيود_يومية_${dateFrom || "all"}_${dateTo || "all"}.xlsx`);
  };

  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ? `من ${dateFrom}` : dateTo ? `حتى ${dateTo}` : "جميع الفترات";

  const transactionTypes = [
    { value: "all", label: "جميع الأنواع" },
    { value: "سند صرف", label: "سند صرف" },
    { value: "سند قبض", label: "سند قبض" },
    { value: "قيد يومية", label: "قيد يومية" },
    { value: "فاتورة مشتريات", label: "فاتورة مشتريات" },
    { value: "فاتورة مبيعات", label: "فاتورة مبيعات" },
    { value: "راتب", label: "راتب" },
    { value: "تحصيل شيك", label: "تحصيل شيك" },
  ];

  const accountCodes = useMemo(() =>
    accounts.map(a => ({ code: a.account_code, label: `${a.account_code} - ${a.account_name}` })).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <PageHeader title="تقرير القيود المحاسبية" breadcrumb={["المحاسبة", "القيود المحاسبية"]} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">{companyName} • {dateRangeLabel}</p>
        <div className="flex items-center gap-2">
          <Can app="finance" feature="journal" perm="create">
            <Button size="sm" onClick={() => setShowJournalEntry(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> إنشاء قيد
            </Button>
          </Can>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
          <Can app="finance" feature="journal" perm="view" disableInsteadOfHide>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0} className="gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> تصدير Excel
            </Button>
          </Can>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">عدد القيود</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{filtered.length}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي المدين</p>
          <p className="text-xl font-bold text-primary tabular-nums">₪{totalDebit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي الدائن</p>
          <p className="text-xl font-bold text-destructive tabular-nums">₪{totalCredit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">الميزان</p>
          <p className={`text-xl font-bold tabular-nums ${totalDebit === totalCredit ? "text-primary" : "text-destructive"}`}>
            {totalDebit === totalCredit ? "✅ متوازن" : "⚠️ غير متوازن"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">فلاتر البحث</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">نوع العملية</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary/50 border-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transactionTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary/50 border-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">بدون الملغية</SelectItem>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="deleted">ملغي فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">بحث</label>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في الوصف أو الحسابات..."
                className="h-9 pr-8 rounded-lg bg-secondary/50 border-0 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد قيود للفترة المحددة</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground w-10">#</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground min-w-[200px]">الوصف</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">النوع</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">الحساب المدين</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">الحساب الدائن</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-primary">مدين</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-destructive">دائن</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((tx, i) => {
                  const idx = (currentPage - 1) * PAGE_SIZE + i + 1;
                  const displayType = getDisplayType(tx.transaction_type);
                  return (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{idx}</td>
                      <td className="px-4 py-3 text-xs text-foreground tabular-nums whitespace-nowrap">{fmtDateDisplay(tx.transaction_date) || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground font-medium max-w-[250px] truncate">{tx.description || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap inline-block ${typeStyle[displayType] || "bg-muted text-muted-foreground"}`}>
                          {displayType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">{accountMap[tx.debit_account_code || ""] || tx.debit_account_code || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{accountMap[tx.credit_account_code || ""] || tx.credit_account_code || "—"}</td>
                      <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">
                        ₪{(tx.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">
                        ₪{(tx.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(tx)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-primary/10 transition-all"
                          title="تعديل القيد"
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 border-t-2 border-primary/20">
                  <td colSpan={6} className="px-4 py-3 text-xs font-bold text-foreground text-right">الإجمالي</td>
                  <td className="px-4 py-3 text-sm font-bold text-primary tabular-nums text-left">₪{totalDebit.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-bold text-destructive tabular-nums text-left">₪{totalCredit.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <p className="text-[11px] text-muted-foreground">
                عرض {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} من {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{currentPage} / {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ Edit Resolution Dialog — لا تعديل مباشر؛ توجيه للمحرر الموحّد */}
      <Dialog open={!!editingTx} onOpenChange={(open) => { if (!open) { setEditingTx(null); setEditResolution(null); } }}>
        <DialogContent className="max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              تعديل القيد المحاسبي
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground pt-1">
              يفرض النظام مرور كل تعديل عبر المحرر الموحّد لضمان تزامن السندات والقيود وكشف الحساب.
            </DialogDescription>
          </DialogHeader>

          {resolving ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : editResolution ? (
            <div className="space-y-4 mt-2">
              {/* بطاقة معلومات القيد */}
              {editingTx && (
                <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">التاريخ:</span><span className="font-medium">{fmtDateDisplay(editingTx.transaction_date) || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">الوصف:</span><span className="font-medium truncate max-w-[260px]">{editingTx.description || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">المبلغ:</span><span className="font-bold tabular-nums">₪{(editingTx.amount || 0).toLocaleString()}</span></div>
                  {editingTx.reference && (
                    <div className="flex justify-between"><span className="text-muted-foreground">المرجع:</span><span className="font-mono text-[10px]">{editingTx.reference}</span></div>
                  )}
                </div>
              )}

              {/* رسالة التشخيص */}
              <div className={`rounded-xl p-3 text-xs leading-relaxed border ${
                editResolution.kind === "voucher" ? "bg-primary/5 border-primary/20 text-foreground" :
                editResolution.kind === "invoice" ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-foreground" :
                "bg-muted/40 border-border text-foreground"
              }`}>
                {editResolution.message}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => { setEditingTx(null); setEditResolution(null); }} className="rounded-xl">
                  إلغاء
                </Button>
                {editResolution.kind === "voucher" && (
                  <Button onClick={handleEditNavigate} className="gap-2 rounded-xl">
                    <ExternalLink className="h-3.5 w-3.5" />
                    فتح محرر السند
                  </Button>
                )}
                {editResolution.kind === "orphan" && (
                  <Button onClick={handleEditNavigate} className="gap-2 rounded-xl">
                    <Plus className="h-3.5 w-3.5" />
                    إنشاء قيد تسوية
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <JournalEntryPopup
        open={showJournalEntry}
        onClose={() => setShowJournalEntry(false)}
        onSuccess={() => { setShowJournalEntry(false); fetchData(); }}
        accounts={accounts.map(a => ({ id: a.id, name: a.account_name, type: a.account_type }))}
      />
    </div>
  );
};

export default JournalEntriesPage;
