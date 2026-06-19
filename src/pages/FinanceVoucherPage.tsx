import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Plus, DollarSign, Hash, Calendar, ArrowRight, Search, X,
  ArrowUpDown, ChevronLeft, ChevronRight, FileText, Copy, Pencil, Trash2, Download, Printer
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import DuplicateConfirmModal from "@/components/DuplicateConfirmModal";
import DeleteDocumentDialog from "@/components/documents/DeleteDocumentDialog";
import EditPostedWarningDialog from "@/components/documents/EditPostedWarningDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Can } from "@/components/permissions/Can";
import { assertPermission } from "@/lib/permissions/assertPermission";
import { useDocumentPermissions } from "@/hooks/useDocumentPermissions";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
import AccountingShell from "@/components/layout/AccountingShell";
type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل", "نقدي": "نقدي", "شيك": "شيك", "تحويل": "تحويل", "بطاقة": "بطاقة" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

type SortKey = "ref_number" | "date" | "contact_name" | "payment_label" | "amount_display" | "status_label";
type SortDir = "asc" | "desc";
const PER_PAGE = 15;

const FinanceVoucherPage = ({ voucherType }: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { canEdit, canDelete } = useDocumentPermissions();
  const { settings } = useCompanySettings();

  const isReceipt = voucherType === "receipt";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const newTitle = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const contactLabel = isReceipt ? "المستلم من" : "المدفوع لـ";

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "active");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // Duplicate
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<any>(null);

  // Delete
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Edit posted warning
  const [editWarning, setEditWarning] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const handleEdit = async (v: any) => {
    try { await assertPermission("finance", isReceipt ? "receipts" : "payments", "update"); } catch { return; }
    const isPosted = v.status === "posted" || v.status_label === "مرحّل";
    if (isPosted) {
      setEditTarget(v);
      setEditWarning(true);
    } else {
      navigateToEdit(v);
    }
  };

  const navigateToEdit = (v: any) => {
    const editPath = isReceipt
      ? `/finance/receipt/${v.id}/edit`
      : `/finance/payment/${v.id}/edit`;
    navigate(editPath);
  };

  const confirmEditPosted = () => {
    if (!editTarget) return;
    // Log edit action
    if (user) {
      supabase.from("document_edit_history" as any).insert({
        document_id: editTarget.id,
        document_type: isReceipt ? "receipt" : "payment",
        old_data: editTarget,
        edit_reason: "فتح تعديل مستند مرحّل",
        edited_by: user.id,
        user_id: dataOwnerId!,
      } as any);
    }
    setEditWarning(false);
    navigateToEdit(editTarget);
  };

  const handleDelete = async (v: any) => {
    try { await assertPermission("finance", isReceipt ? "receipts" : "payments", "delete"); } catch { return; }
    setDeleteTarget(v);
    setDeleteDialog(true);
  };

  const confirmDelete = async (reason: string) => {
    if (!deleteTarget || !user) return;
    try { await assertPermission("finance", isReceipt ? "receipts" : "payments", "delete"); } catch { return; }
    try {
      const table = isReceipt ? "receipt_vouchers" : "vouchers";
      
      // Reverse invoice paid amounts before cancelling (works for both receipt and payment vouchers)
      const { data: links } = await supabase
        .from("payment_invoice_links" as any)
        .select("invoice_id, allocated_amount")
        .eq("payment_id", deleteTarget.id);
      
      if (links && links.length > 0) {
        for (const link of links as any[]) {
          const { data: inv } = await supabase
            .from("invoices")
            .select("paid_amount, total_amount")
            .eq("id", link.invoice_id)
            .maybeSingle();
          
          if (inv) {
            const newPaid = Math.max(0, (inv.paid_amount || 0) - (link.allocated_amount || 0));
            const newRemaining = inv.total_amount - newPaid;
            await supabase.from("invoices").update({
              paid_amount: newPaid,
              remaining_amount: newRemaining,
              payment_status: newPaid <= 0 ? "unpaid" : "partial",
            }).eq("id", link.invoice_id);
          }
        }
        // Delete the payment_invoice_links
        await supabase.from("payment_invoice_links" as any)
          .delete()
          .eq("payment_id", deleteTarget.id);
      }
      
      // Cancel the voucher — DB trigger handles cascading to linked transaction
      const { error } = await supabase
        .from(table as any)
        .update({ status: "cancelled" } as any)
        .eq("id", deleteTarget.id);

      if (error) throw error;

      // Log deletion
      await supabase.from("document_edit_history" as any).insert({
        document_id: deleteTarget.id,
        document_type: isReceipt ? "receipt" : "payment",
        old_data: deleteTarget,
        edit_reason: reason,
        edited_by: user.id,
        user_id: dataOwnerId!,
        changes: { action: "delete", reason },
      } as any);

      toast({ title: "تم إلغاء المستند وعكس تأثيره على الفواتير والقيود بنجاح ✅" });
      setDeleteDialog(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = (v: any) => {
    setDuplicateTarget(v);
    setDuplicateModal(true);
  };

  const confirmDuplicate = () => {
    if (!duplicateTarget) return;
    const draftData = {
      _sourceRef: duplicateTarget.ref_number,
      paymentMethod: PAYMENT_LABELS[duplicateTarget.payment_method] || "نقدي",
      notes: duplicateTarget.notes || "",
      contactId: duplicateTarget.contact_id || null,
      depositType: duplicateTarget.cash_box_id ? "cash_box" : "bank",
      selectedCashBox: duplicateTarget.cash_box_id || "",
      selectedBankAccount: duplicateTarget.bank_account_id || "",
    };
    localStorage.setItem(`draft_${voucherType}_new`, JSON.stringify(draftData));
    setDuplicateModal(false);
    navigate(isReceipt ? "/finance/receipt/new?from_duplicate=true" : "/finance/payment/new?from_duplicate=true");
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isReceipt) {
      const [rvRes, cRes, linksRes] = await Promise.all([
        supabase.from("receipt_vouchers").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", dataOwnerId!).neq("is_archived", true),
        supabase.from("payment_invoice_links").select("payment_id, allocated_amount"),
      ]);
      // Build allocated map
      const allocMap = new Map<string, number>();
      for (const link of (linksRes.data || [])) {
        allocMap.set(link.payment_id, (allocMap.get(link.payment_id) || 0) + (link.allocated_amount || 0));
      }
      const mapped = (rvRes.data || []).map((rv: any) => ({
        ...rv,
        ref_number: rv.receipt_number,
        date: rv.payment_date,
        amount_ils: rv.amount,
        amount: rv.amount,
        type: "receipt",
        account_code: rv.deposit_account_code || "—",
        allocated_total: allocMap.get(rv.id) || 0,
      }));
      setVouchers(mapped);
      setContacts(cRes.data || []);
    } else {
      const [vRes, cRes, txRes] = await Promise.all([
        supabase.from("vouchers").select("*").eq("user_id", dataOwnerId!).eq("type", "payment").order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", dataOwnerId!).neq("is_archived", true),
        supabase.from("transactions").select("id, debit_account_code").eq("user_id", dataOwnerId!).eq("is_deleted", false),
      ]);
      const txMap = new Map<string, string>();
      for (const tx of (txRes.data || [])) {
        txMap.set(tx.id, tx.debit_account_code || "");
      }
      setVouchers((vRes.data || []).map((v: any) => ({
        ...v,
        account_code: v.linked_transaction_id ? (txMap.get(v.linked_transaction_id) || "—") : "—",
        allocated_total: 0,
      })));
      setContacts(cRes.data || []);
    }

    setLoading(false);
  }, [user, voucherType, isReceipt]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const editPath = isReceipt
        ? `/finance/receipt/${editId}/edit`
        : `/finance/payment/${editId}/edit`;
      navigate(editPath);
    } else if (searchParams.get("new") === "1") {
      navigate(isReceipt ? "/finance/receipt/new" : "/finance/payment/new");
    }
  }, [searchParams, isReceipt, navigate]);

  const tableData = useMemo(() => {
    return vouchers.map(v => {
      const contactName = v.contact_name || contacts.find(c => c.id === v.contact_id)?.contact_name || "—";
      const amountVal = Number(v.amount_ils || v.amount || 0);
      const allocatedVal = Number(v.allocated_total || 0);
      return {
        ...v,
        contact_name: contactName,
        payment_label: PAYMENT_LABELS[v.payment_method] || v.payment_method || "—",
        status_label: STATUS_LABELS[v.status] || v.status,
        amount_display: amountVal,
        unallocated: amountVal - allocatedVal,
        account_code: v.account_code || "—",
      };
    });
  }, [vouchers, contacts]);

  // Filtering
  const filtered = useMemo(() => {
    let data = [...tableData];
    if (statusFilter === "active") data = data.filter(v => v.status_label !== "ملغي");
    else if (statusFilter !== "all") data = data.filter(v => v.status_label === statusFilter);
    if (paymentFilter !== "all") data = data.filter(v => v.payment_label === paymentFilter);
    if (searchQuery) {
      data = data.filter(v => multiWordMatchAny(searchQuery, v.ref_number, v.description, v.notes, v.contact_name));
    }
    return data;
  }, [tableData, statusFilter, paymentFilter, searchQuery]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, paymentFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  // KPIs
  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const totalMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart).reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const PAYMENT_METHODS = ["نقدي", "بنك", "شيك", "تحويل"];

  const exportToExcel = () => {
    import("xlsx").then(XLSX => {
      const rows = filtered.map(v => ({
        "رقم السند": v.ref_number || "",
        "التاريخ": v.date || "",
        "الجهة": v.contact_name || "",
        "البيان": v.description || v.notes || "",
        "طريقة الدفع": v.payment_label || "",
        "الحساب": v.account_code || "",
        "المبلغ": v.amount_display || 0,
        "غير مخصص": v.unallocated || 0,
        "الحالة": v.status_label || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
      setNextExportBranding({ title: "تقرير" });
      XLSX.writeFile(wb, `${title}-${new Date().toISOString().split("T")[0]}.xlsx`);
    });
  };

  const handlePrint = () => {
    const rows = filtered.map(v => `
      <tr>
        <td>${v.ref_number || "—"}</td>
        <td>${v.date || "—"}</td>
        <td>${v.contact_name || "—"}</td>
        <td>${v.description || v.notes || "—"}</td>
        <td>${v.payment_label || "—"}</td>
        <td class="font-mono">${v.account_code || "—"}</td>
        <td class="font-mono font-bold">₪${(v.amount_display || 0).toLocaleString()}</td>
        <td>${v.status_label || "—"}</td>
      </tr>
    `).join("");

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${settings.company_name || "الشركة"}</div>
          <div class="report-title">${title}</div>
        </div>
        <div class="print-date">${filtered.length} سند</div>
      </div>
      <div class="summary-row">
        <div class="summary-card"><div class="summary-label">${isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات"}</div><div class="summary-value ${isReceipt ? 'green' : 'red'}">${fmt(totalAll)}</div></div>
        <div class="summary-card"><div class="summary-label">هذا الشهر</div><div class="summary-value ${isReceipt ? 'green' : 'red'}">${fmt(totalMonth)}</div></div>
        <div class="summary-card"><div class="summary-label">عدد السندات</div><div class="summary-value">${vouchers.length}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>رقم السند</th><th>التاريخ</th><th>${contactLabel}</th><th>البيان</th><th>طريقة الدفع</th><th>الحساب</th><th>المبلغ</th><th>الحالة</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="6" style="text-align:right">المجموع (${filtered.length} سند)</td>
          <td class="font-mono font-bold">${fmt(filtered.reduce((s, v) => s + Number(v.amount_display || 0), 0))}</td>
          <td></td>
        </tr></tfoot>
      </table>
    `;

    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({
        title,
        companyName: settings.company_name || "الشركة",
        contentHtml,
      });
    });
  };

  return (
    <AccountingShell>
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title={title} breadcrumb={["المالية", title]} />
      {/* Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">{isReceipt ? "إدارة سندات القبض والمقبوضات" : "إدارة سندات الصرف والمدفوعات"}</p>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <>
              <Can app="finance" feature={isReceipt ? "receipts" : "payments"} perm="print" disableInsteadOfHide>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" /> طباعة
                </Button>
              </Can>
              <Can app="finance" feature={isReceipt ? "receipts" : "payments"} perm="print" disableInsteadOfHide>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={exportToExcel}>
                  <Download className="h-3.5 w-3.5" /> تصدير Excel
                </Button>
              </Can>
            </>
          )}
          <Can app="finance" feature={isReceipt ? "receipts" : "payments"} perm="create">
            <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => {
              if (isReceipt) { navigate("/finance/receipt/new"); }
              else { navigate("/finance/payment/new"); }
            }}>
              <Plus className="h-4 w-4" /> {newTitle}
            </Button>
          </Can>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات", value: fmt(totalAll), icon: DollarSign, color: isReceipt ? "text-emerald-500" : "text-destructive", bg: isReceipt ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-destructive/5 border-destructive/10" },
          { label: "هذا الشهر", value: fmt(totalMonth), icon: Calendar, color: isReceipt ? "text-emerald-500" : "text-destructive", bg: isReceipt ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-destructive/5 border-destructive/10" },
          { label: "عدد السندات", value: vouchers.length, icon: Hash, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: `متوسط ${isReceipt ? "القبض" : "الصرف"}`, value: vouchers.length > 0 ? fmt(totalAll / vouchers.length) : "₪0", icon: FileText, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
        ].map((k, i) => (
          <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
              <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="ابحث برقم السند، الوصف، الجهة..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-10 rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Payment method pills + status filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              <button onClick={() => setPaymentFilter("all")} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${paymentFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                الكل
              </button>
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => setPaymentFilter(m)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${paymentFilter === m ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  {m}
                </button>
              ))}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
                <SelectValue placeholder="حالة السند" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="active">بدون الملغية</SelectItem>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="مرحّل">مرحّل</SelectItem>
                <SelectItem value="مسودة">مسودة</SelectItem>
                <SelectItem value="ملغي">ملغي فقط</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground mr-auto">{filtered.length} سند</span>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && vouchers.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد سندات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف أول سند لبدء تتبع {isReceipt ? "المقبوضات" : "المدفوعات"}</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => {
            if (isReceipt) { navigate("/finance/receipt/new"); }
            else { navigate("/finance/payment/new"); }
          }}>
            <Plus className="h-4 w-4" /> {newTitle}
          </Button>
        </div>
      )}

      {/* No results */}
      {!loading && vouchers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد سندات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPaymentFilter("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="رقم السند" field="ref_number" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="التاريخ" field="date" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label={contactLabel} field="contact_name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">البيان</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="طريقة الدفع" field="payment_label" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">الحساب</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="المبلغ" field="amount_display" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">غير مخصص</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status_label" /></th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((v, i) => {
                  const statusStyles: Record<string, string> = {
                    "مرحّل": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    "مسودة": "bg-muted text-muted-foreground",
                    "ملغي": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  };
                  const dotColor: Record<string, string> = {
                    "مرحّل": "bg-green-500",
                    "مسودة": "bg-muted-foreground",
                    "ملغي": "bg-red-500",
                  };
                  const isVoucherCancelled = v.status === "cancelled" || v.status_label === "ملغي";
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-border/50 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                      style={{
                        opacity: isVoucherCancelled ? 0.5 : 1,
                        textDecoration: isVoucherCancelled ? "line-through" : "none",
                        background: isVoucherCancelled ? "#FEF2F2" : undefined,
                      }}
                    >
                      <td className="px-3 py-3">
                        <button
                          className="text-primary hover:underline font-mono text-xs cursor-pointer bg-transparent border-none p-0"
                          onClick={() => {
                            const editPath = isReceipt
                              ? `/finance/receipt/${v.id}/edit`
                              : `/finance/payment/${v.id}/edit`;
                            navigate(editPath);
                          }}
                        >
                          {v.ref_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground tabular-nums">{v.date || "—"}</td>
                      <td className="px-3 py-3 text-sm font-medium text-foreground">{v.contact_name}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{v.description || v.notes || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{v.payment_label}</td>
                      <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{v.account_code}</td>
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">₪{v.amount_display.toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs tabular-nums">
                        {v.unallocated > 0 ? (
                          <span className="text-destructive/80 font-semibold">₪{v.unallocated.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[v.status_label] || "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor[v.status_label] || "bg-muted-foreground"}`} />
                          {v.status_label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          {canEdit(v) && (
                            <Can app="finance" feature={isReceipt ? "receipts" : "payments"} perm="update">
                              <button
                                onClick={e => { e.stopPropagation(); handleEdit(v); }}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="تعديل"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </Can>
                          )}
                          {canDelete(v) && v.status !== "cancelled" && (
                            <Can app="finance" feature={isReceipt ? "receipts" : "payments"} perm="delete">
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(v); }}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </Can>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); handleDuplicate(v); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="جديد مشابه"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={7} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} سند)</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, v) => s + v.amount_display, 0).toLocaleString()}</td>
                  <td colSpan={2} className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {Math.min((page - 1) * PER_PAGE + 1, sorted.length)}–{Math.min(page * PER_PAGE, sorted.length)} من {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, page - 3), Math.min(totalPages, page + 2)
                ).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</p>
            </div>
          )}
        </div>
      )}

      {/* Duplicate Confirm Modal */}
      <DuplicateConfirmModal
        open={duplicateModal}
        onClose={() => setDuplicateModal(false)}
        onConfirm={confirmDuplicate}
        docType={isReceipt ? "receipt" : "payment"}
        info={{
          contactName: duplicateTarget?.contact_name,
          paymentMethod: duplicateTarget?.payment_label,
          sourceRef: duplicateTarget?.ref_number,
        }}
      />

      {/* Edit Posted Warning */}
      <EditPostedWarningDialog
        open={editWarning}
        onClose={() => setEditWarning(false)}
        onConfirm={confirmEditPosted}
        docNumber={editTarget?.ref_number}
        docAmount={editTarget?.amount_display}
      />

      {/* Delete Dialog */}
      <DeleteDocumentDialog
        open={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        onConfirm={confirmDelete}
        docNumber={deleteTarget?.ref_number}
        docAmount={deleteTarget?.amount_display}
      />
    </div>
    </AccountingShell>
  );
};

export default FinanceVoucherPage;
