import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, RefreshCw, Printer, FileSpreadsheet, Calculator, Loader2,
  Pencil, Trash2, Copy, Search, FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDocumentPermissions } from "@/hooks/useDocumentPermissions";
import { useCostCenters } from "@/hooks/useCostCenters";
import { assertPermission } from "@/lib/permissions/assertPermission";
import { Can } from "@/components/permissions/Can";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SmartTextCell } from "@/components/ui/smart-text-cell";
import {
  FinanceShell, applyFilters,
  type ActionTab, type FilterCondition, type FilterField,
} from "@/components/finance/shell";
import { ColumnVisibilityMenu } from "@/components/finance/shell/ColumnVisibilityMenu";
import { useColumnVisibility, type ColumnDef } from "@/components/finance/shell/useColumnVisibility";
import { printVoucherList } from "@/components/print/buildVoucherListPrint";
import { onCrossTabChange } from "@/lib/crossTabSync";
import DuplicateConfirmModal from "@/components/DuplicateConfirmModal";
import DeleteDocumentDialog from "@/components/documents/DeleteDocumentDialog";
import EditPostedWarningDialog from "@/components/documents/EditPostedWarningDialog";
import { setNextExportBranding } from "@/lib/excel-export";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل",
  "نقدي": "نقدي", "بنك": "بنك", "شيك": "شيك", "تحويل": "تحويل", "بطاقة": "بطاقة",
};
const STATUS_LABELS: Record<string, string> = {
  posted: "مرحّل", draft: "مسودة", cancelled: "ملغي",
};

interface Row {
  id: string;
  ref_number: string;
  date: string | null;
  contact_id: string | null;
  contact_name: string;
  payment_method: string;
  payment_label: string;
  cash_box_id: string | null;
  bank_account_id: string | null;
  account_label: string;
  cost_center_id: string | null;
  cost_center_name: string;
  currency: string;
  amount: number;
  status: string;
  status_label: string;
  notes: string | null;
  raw: any;
}

export default function FinancePaymentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const { canEdit, canDelete } = useDocumentPermissions();
  const { data: costCenters = [] } = useCostCenters({ includeInactive: true });

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);

  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState<Row | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Row | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnTarget, setWarnTarget] = useState<Row | null>(null);

  // Column visibility (localStorage per page)
  const columnDefs: ColumnDef[] = useMemo(() => ([
    { key: "ref_number", label: "رقم السند", required: true },
    { key: "date", label: "التاريخ" },
    { key: "contact_name", label: "الجهة" },
    { key: "payment_label", label: "طريقة الدفع" },
    { key: "account_label", label: "الصندوق/البنك" },
    { key: "cost_center_name", label: "مركز التكلفة" },
    { key: "currency", label: "العملة" },
    { key: "notes", label: "الملاحظات", defaultVisible: false },
    { key: "amount", label: "المبلغ", required: true },
    { key: "status_label", label: "الحالة" },
    { key: "actions", label: "إجراءات", required: true },
  ]), []);
  const colState = useColumnVisibility("finance-payments-page", columnDefs);
  const show = colState.isVisible;

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [rvRes, cRes, cbRes, baRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", "payment")
        .order("date", { ascending: false }),
      supabase.from("contacts").select("id, contact_name").eq("user_id", user.id),
      supabase.from("cash_boxes").select("id, name, currency").eq("user_id", user.id),
      supabase.from("bank_accounts").select("id, name, currency").eq("user_id", user.id),
    ]);
    const cMap = new Map<string, string>((cRes.data || []).map((c: any) => [c.id, c.contact_name]));
    const cbMap = new Map<string, any>((cbRes.data || []).map((b: any) => [b.id, b]));
    const baMap = new Map<string, any>((baRes.data || []).map((b: any) => [b.id, b]));

    // fetch cost_center_id from linked transactions
    const txIds = (rvRes.data || []).map((rv: any) => rv.linked_transaction_id).filter(Boolean);
    const txMap = new Map<string, string | null>();
    if (txIds.length) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("id, cost_center_id")
        .in("id", txIds);
      for (const t of (tx || [])) txMap.set(t.id, (t as any).cost_center_id || null);
    }
    const ccMap = new Map<string, string>(
      costCenters.map((c) => [c.id, `${c.code} - ${c.name_ar || c.name}`]),
    );

    const mapped: Row[] = (rvRes.data || []).map((rv: any) => {
      const cb = rv.cash_box_id ? cbMap.get(rv.cash_box_id) : null;
      const ba = rv.bank_account_id ? baMap.get(rv.bank_account_id) : null;
      const ccId = rv.linked_transaction_id ? (txMap.get(rv.linked_transaction_id) || null) : null;
      const currency = cb?.currency || ba?.currency || "ILS";
      return {
        id: rv.id,
        ref_number: rv.ref_number || "",
        date: rv.date || null,
        contact_id: rv.contact_id,
        contact_name: rv.contact_name || cMap.get(rv.contact_id || "") || "—",
        payment_method: rv.payment_method || "",
        payment_label: PAYMENT_LABELS[rv.payment_method] || rv.payment_method || "—",
        cash_box_id: rv.cash_box_id,
        bank_account_id: rv.bank_account_id,
        account_label: cb?.name || ba?.name || "—",
        cost_center_id: ccId,
        cost_center_name: ccId ? (ccMap.get(ccId) || "—") : "بدون مركز تكلفة",
        currency,
        amount: Number(rv.amount || 0),
        status: rv.status || "posted",
        status_label: STATUS_LABELS[rv.status] || rv.status || "—",
        notes: rv.notes || null,
        raw: rv,
      };
    });
    setRows(mapped);
    setLoading(false);
  }, [user, costCenters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh when the page regains focus, or another tab broadcasts a change.
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener("focus", onFocus);
    const off = onCrossTabChange((e) => {
      if (e.entity === "voucher") fetchData();
    });
    return () => { window.removeEventListener("focus", onFocus); off(); };
  }, [fetchData]);

  // distinct option lists
  const contactOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.contact_name) m.set(r.contact_name, r.contact_name); });
    return Array.from(m.values()).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);
  const paymentOptions = useMemo(() => {
    const s = new Set<string>(); rows.forEach((r) => r.payment_label && s.add(r.payment_label));
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);
  const accountOptions = useMemo(() => {
    const s = new Set<string>(); rows.forEach((r) => r.account_label && r.account_label !== "—" && s.add(r.account_label));
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);
  const currencyOptions = useMemo(() => {
    const s = new Set<string>(); rows.forEach((r) => r.currency && s.add(r.currency));
    const a = Array.from(s).sort();
    return (a.length ? a : ["ILS"]).map((v) => ({ value: v, label: v }));
  }, [rows]);
  const ccOptions = useMemo(() => {
    const s = new Set<string>(); rows.forEach((r) => s.add(r.cost_center_name));
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);

  const filterFields: FilterField[] = useMemo(() => ([
    { key: "date", label: "التاريخ", type: "date" },
    { key: "contact_name", label: "العميل / الجهة", type: "option", options: contactOptions },
    { key: "payment_label", label: "طريقة الدفع", type: "option", options: paymentOptions },
    { key: "account_label", label: "الصندوق / البنك", type: "option", options: accountOptions },
    { key: "currency", label: "العملة", type: "option", options: currencyOptions },
    { key: "cost_center_name", label: "مركز التكلفة", type: "option", options: ccOptions },
    { key: "status_label", label: "الحالة", type: "option", options: [
      { value: "مرحّل", label: "مرحّل" },
      { value: "مسودة", label: "مسودة" },
      { value: "ملغي", label: "ملغي" },
    ]},
    { key: "ref_number", label: "الرقم المرجعي", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
  ]), [contactOptions, paymentOptions, accountOptions, currencyOptions, ccOptions]);

  // Apply filters
  const filtered = useMemo(() => {
    let data = applyFilters(rows, shellFilters);
    if (searchQuery.trim()) {
      data = data.filter((r) =>
        multiWordMatchAny(searchQuery, r.ref_number, r.contact_name, r.notes, r.payment_label, r.account_label),
      );
    }
    return data;
  }, [rows, shellFilters, searchQuery]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + (r.status !== "cancelled" ? r.amount : 0), 0),
    [filtered],
  );

  // Actions
  const handleNew = () => navigate("/finance/payment/new");
  const handleOpenCenter = () => navigate("/accounting-center");
  const handlePrint = () => {
    const visibleCols = columnDefs.filter((c) => c.key !== "actions" && show(c.key));
    printVoucherList<Row>({
      title: "سندات الصرف",
      subtitle: "كشف بسندات الصرف المُفلترة",
      companyName: settings.company_name || undefined,
      rows: filtered,
      info: periodLabel ? [{ label: "الفترة", value: periodLabel }] : [],
      summary: [
        { label: "عدد السندات", value: String(filtered.length) },
        { label: "إجمالي المدفوعات", value: `₪${totalAmount.toLocaleString()}` },
      ],
      columns: visibleCols.map((c) => ({
        key: c.key,
        label: c.label,
        align: c.key === "amount" ? "left" : "right",
        render: (r: Row) => {
          switch (c.key) {
            case "ref_number": return r.ref_number || "—";
            case "date": return fmtDateDisplay(r.date) || "—";
            case "contact_name": return r.contact_name || "—";
            case "payment_label": return r.payment_label;
            case "account_label": return r.account_label;
            case "cost_center_name": return r.cost_center_name;
            case "currency": return r.currency;
            case "amount": return r.amount.toLocaleString();
            case "status_label": return r.status_label;
            default: return "";
          }
        },
      })),
      totalsLabel: `المجموع (${filtered.length} سند)`,
      totalsCells: visibleCols.map((c) =>
        c.key === "amount" ? `₪${totalAmount.toLocaleString()}` : null,
      ),
      isCancelled: (r) => r.status === "cancelled",
    });
  };

  const handleExport = () => {
    const data = filtered.map((r) => ({
      "رقم السند": r.ref_number,
      "التاريخ": fmtDateDisplay(r.date) || "",
      "الجهة": r.contact_name,
      "طريقة الدفع": r.payment_label,
      "الصندوق/البنك": r.account_label,
      "مركز التكلفة": r.cost_center_name,
      "العملة": r.currency,
      "المبلغ": r.amount,
      "الحالة": r.status_label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سندات الصرف");
    setNextExportBranding({
      title: "سندات الصرف",
      extraInfo: [`عدد السندات: ${data.length.toLocaleString()}`],
    });
    XLSX.writeFile(wb, `سندات_صرف_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleEdit = async (r: Row) => {
    try { await assertPermission("finance", "payments", "update"); } catch { return; }
    // Open in read-only view first; the EditPostedWarningDialog will be
    // triggered from inside VoucherFormPage when the user explicitly
    // presses "تعديل" on a posted voucher.
    navigate(`/finance/payment/${r.id}/edit`);
  };
  const confirmEditPosted = () => {
    if (!warnTarget) return;
    if (user) {
      supabase.from("document_edit_history" as any).insert({
        document_id: warnTarget.id, document_type: "payment",
        old_data: warnTarget.raw, edit_reason: "فتح تعديل مستند مرحّل",
        edited_by: user.id, user_id: user.id,
      } as any);
    }
    setWarnOpen(false);
    navigate(`/finance/payment/${warnTarget.id}/edit`);
  };

  const handleDelete = async (r: Row) => {
    try { await assertPermission("finance", "payments", "delete"); } catch { return; }
    setDelTarget(r); setDelOpen(true);
  };
  const confirmDelete = async (reason: string) => {
    if (!delTarget || !user) return;
    try {
      const { data: links } = await supabase.from("payment_invoice_links" as any)
        .select("invoice_id, allocated_amount").eq("payment_id", delTarget.id);
      if (links && links.length) {
        for (const link of links as any[]) {
          const { data: inv } = await supabase.from("invoices")
            .select("paid_amount, total_amount").eq("id", link.invoice_id).maybeSingle();
          if (inv) {
            const newPaid = Math.max(0, (inv.paid_amount || 0) - (link.allocated_amount || 0));
            await supabase.from("invoices").update({
              paid_amount: newPaid,
              remaining_amount: inv.total_amount - newPaid,
              payment_status: newPaid <= 0 ? "unpaid" : "partial",
            }).eq("id", link.invoice_id);
          }
        }
        await supabase.from("payment_invoice_links" as any).delete().eq("payment_id", delTarget.id);
      }
      const { error } = await supabase.from("vouchers")
        .update({ status: "cancelled" } as any).eq("id", delTarget.id);
      if (error) throw error;
      await supabase.from("document_edit_history" as any).insert({
        document_id: delTarget.id, document_type: "payment",
        old_data: delTarget.raw, edit_reason: reason,
        edited_by: user.id, user_id: user.id,
        changes: { action: "delete", reason },
      } as any);
      toast({ title: "تم إلغاء السند وعكس تأثيره ✅" });
      setDelOpen(false);
      fetchData();
    } catch (e: any) {
      toast({ title: "خطأ في الحذف", description: e.message, variant: "destructive" });
    }
  };

  const handleDuplicate = (r: Row) => { setDupTarget(r); setDupOpen(true); };
  const confirmDuplicate = () => {
    if (!dupTarget) return;
    const draft = {
      _sourceRef: dupTarget.ref_number,
      paymentMethod: PAYMENT_LABELS[dupTarget.payment_method] || "نقدي",
      notes: dupTarget.notes || "",
      contactId: dupTarget.contact_id || null,
      depositType: dupTarget.cash_box_id ? "cash_box" : "bank",
      selectedCashBox: dupTarget.cash_box_id || "",
      selectedBankAccount: dupTarget.bank_account_id || "",
    };
    localStorage.setItem("draft_payment_new", JSON.stringify(draft));
    setDupOpen(false);
    navigate("/finance/payment/new?from_duplicate=true");
  };

  const actionTabs: ActionTab[] = useMemo(() => ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "new", label: "سند صرف جديد", icon: Plus, variant: "primary", onClick: handleNew },
      ]},
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchData },
        { key: "center", label: "فتح مركز المالية", icon: Calculator, onClick: handleOpenCenter },
      ]},
      { key: "print", label: "طباعة", items: [
        { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint, disabled: filtered.length === 0 },
      ]},
      { key: "export", label: "تصدير", items: [
        { key: "excel", label: "Excel", icon: FileSpreadsheet, onClick: handleExport, disabled: filtered.length === 0 },
      ]},
    ],
  }]), [filtered.length, fetchData]);

  const dateCond = shellFilters.find((c) => c.fieldKey === "date");
  const periodLabel = dateCond
    ? dateCond.operator === "between"
      ? `${dateCond.value || "—"} → ${dateCond.valueTo || "—"}`
      : `${dateCond.operator}: ${dateCond.value || "—"}`
    : null;

  return (
    <FinanceShell
      title="سندات الصرف"
      subtitle="إدارة سندات الصرف والمدفوعات"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "سندات الصرف" },
      ]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey="finance-payments-page"
      rightSlot={
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث سريع..."
              className="h-8 w-56 pr-8 text-xs"
            />
          </div>
          <ColumnVisibilityMenu state={colState} />
        </div>
      }
    >
      <div className="space-y-4 w-full" dir="rtl">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">عدد السندات</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{filtered.length}</p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">إجمالي المدفوعات (نشطة)</p>
            <p className="text-xl font-bold text-destructive tabular-nums">
              ₪{totalAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">مراكز التكلفة المستخدمة</p>
            <p className="text-xl font-bold text-primary tabular-nums">
              {new Set(filtered.filter(r => r.cost_center_id).map(r => r.cost_center_id)).size}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">لا توجد سندات صرف مطابقة</p>
          </div>
        ) : (
          <div data-print-area className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden print:shadow-none print:border-0">
            {/* Print header */}
            <div className="hidden print:block px-4 py-3 border-b border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-base font-bold text-foreground">سندات الصرف</h1>
                  {settings.company_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{settings.company_name}</p>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground text-left">
                  <p>تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</p>
                  <p>عدد السندات: {filtered.length}</p>
                  {periodLabel && <p>الفترة: {periodLabel}</p>}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed" dir="rtl">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "5%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border/60 bg-primary text-primary-foreground print:bg-muted print:text-foreground">
                    <th className="text-right px-3 py-2 text-[11px] font-semibold">رقم السند</th>
                    {show("date") && <th className="text-right px-3 py-2 text-[11px] font-semibold">التاريخ</th>}
                    {show("contact_name") && <th className="text-right px-3 py-2 text-[11px] font-semibold">الجهة</th>}
                    {show("payment_label") && <th className="text-right px-3 py-2 text-[11px] font-semibold">طريقة الدفع</th>}
                    {show("account_label") && <th className="text-right px-3 py-2 text-[11px] font-semibold">الصندوق/البنك</th>}
                    {show("cost_center_name") && <th className="text-right px-3 py-2 text-[11px] font-semibold">مركز التكلفة</th>}
                    {show("currency") && <th className="text-right px-3 py-2 text-[11px] font-semibold">العملة</th>}
                    {show("notes") && <th className="text-right px-3 py-2 text-[11px] font-semibold">الملاحظات</th>}
                    <th className="text-left px-3 py-2 text-[11px] font-semibold">المبلغ</th>
                    {show("status_label") && <th className="text-right px-3 py-2 text-[11px] font-semibold">الحالة</th>}
                    <th className="text-center px-2 py-2 text-[11px] font-semibold print:hidden">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const cancelled = r.status === "cancelled";
                    const statusStyle = cancelled
                      ? "bg-red-100 text-red-700"
                      : r.status === "draft"
                        ? "bg-muted text-muted-foreground"
                        : "bg-emerald-100 text-emerald-700";
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-border/40 hover:bg-primary/5 transition-colors ${idx % 2 ? "bg-muted/10" : ""}`}
                        style={cancelled ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
                      >
                        <td className="px-3 py-2 align-middle">
                          <button
                            onClick={() => handleEdit(r)}
                            className="text-primary hover:underline font-mono text-xs bg-transparent border-0 p-0 cursor-pointer truncate block max-w-full text-right"
                            title={r.ref_number}
                          >
                            {r.ref_number || "—"}
                          </button>
                        </td>
                        {show("date") && <td className="px-3 py-2 text-xs tabular-nums align-middle">{fmtDateDisplay(r.date) || "—"}</td>}
                        {show("contact_name") && (
                          <td className="px-3 py-2 align-middle">
                            <SmartTextCell value={r.contact_name} className="text-sm font-medium" />
                          </td>
                        )}
                        {show("payment_label") && <td className="px-3 py-2 text-xs text-muted-foreground align-middle">{r.payment_label}</td>}
                        {show("account_label") && (
                          <td className="px-3 py-2 align-middle">
                            <SmartTextCell value={r.account_label} className="text-xs" />
                          </td>
                        )}
                        {show("cost_center_name") && (
                          <td className="px-3 py-2 align-middle">
                            <SmartTextCell
                              value={r.cost_center_name}
                              className={`text-xs ${r.cost_center_id ? "" : "text-muted-foreground/70 italic"}`}
                            />
                          </td>
                        )}
                        {show("currency") && <td className="px-3 py-2 text-xs font-mono text-muted-foreground align-middle">{r.currency}</td>}
                        {show("notes") && (
                          <td className="px-3 py-2 align-middle">
                            <SmartTextCell value={r.notes || "—"} className="text-xs text-muted-foreground" />
                          </td>
                        )}
                        <td className="px-3 py-2 text-sm font-bold tabular-nums text-left align-middle">
                          {r.amount.toLocaleString()}
                        </td>
                        {show("status_label") && (
                          <td className="px-3 py-2 align-middle">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle}`}>
                              {r.status_label}
                            </span>
                          </td>
                        )}
                        <td className="px-2 py-1 align-middle print:hidden">
                          <div className="flex items-center justify-center gap-0.5">
                            {canEdit(r.raw) && (
                              <Can app="finance" feature="payments" perm="update">
                                <button onClick={() => handleEdit(r)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="تعديل">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </Can>
                            )}
                            {canDelete(r.raw) && r.status !== "cancelled" && (
                              <Can app="finance" feature="payments" perm="delete">
                                <button onClick={() => handleDelete(r)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="حذف">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </Can>
                            )}
                            <button onClick={() => handleDuplicate(r)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="جديد مشابه">
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
                    <td colSpan={1 + [show("date"),show("contact_name"),show("payment_label"),show("account_label"),show("cost_center_name"),show("currency"),show("notes")].filter(Boolean).length} className="px-3 py-2 text-right text-foreground">
                      المجموع ({filtered.length} سند)
                    </td>
                    <td className="px-3 py-2 text-left tabular-nums text-foreground">
                      ₪{totalAmount.toLocaleString()}
                    </td>
                    <td colSpan={1 + (show("status_label") ? 1 : 0)} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      <DuplicateConfirmModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        onConfirm={confirmDuplicate}
        docType="payment"
        info={{
          contactName: dupTarget?.contact_name,
          paymentMethod: dupTarget?.payment_label,
          sourceRef: dupTarget?.ref_number,
        }}
      />
      <EditPostedWarningDialog
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        onConfirm={confirmEditPosted}
        docNumber={warnTarget?.ref_number}
        docAmount={warnTarget?.amount}
      />
      <DeleteDocumentDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={confirmDelete}
        docNumber={delTarget?.ref_number}
        docAmount={delTarget?.amount}
      />
    </FinanceShell>
  );
}