import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Search, Loader2, Eye, Pencil, Trash2, RefreshCw, XCircle, Printer, LayoutGrid, Table2, X, FileSpreadsheet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useAccountantPermissions } from "@/hooks/useAccountantPermissions";
import { cancelManagedReturn, isReturnsPilot } from "@/lib/returns";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import * as XLSX from "xlsx";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import { broadcastChange } from "@/lib/crossTabSync";
import { createRoot } from "react-dom/client";
import InvoicePrintView from "@/components/InvoicePrintView";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useTaxEnabled } from "@/hooks/useTaxEnabled";
import { fetchContactStatementBalance } from "@/lib/contact-balance";

interface ReturnRow {
  id: string;
  return_number: string | null;
  return_date: string | null;
  contact_id: string | null;
  contact_name: string | null;
  total_amount: number | null;
  status: string | null;
  reason: string | null;
  related_invoice_id: string | null;
  notes: string | null;
  refund_method: string | null;
  refund_account_code: string | null;
  posting_version: number | null;
  revision: number | null;
  tax_inclusive: boolean | null;
  subtotal: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
}

interface Props {
  returnType: "sales" | "purchase";
}

const ReturnsListPage = ({ returnType }: Props) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const pilot = isReturnsPilot(ownerId);
  const { can, loading: permissionsLoading } = useAccountantPermissions();
  const canProcess = !permissionsLoading && can("can_process_returns");
  const { toast } = useToast();
  const { settings: companySettings } = useCompanySettings();
  const { taxEnabled } = useTaxEnabled();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});

  const isSales = returnType === "sales";

  const titleAr = isSales ? "مردودات المبيعات" : "مردودات المشتريات";
  const newPath = isSales ? "/sales/returns/new" : "/purchases/returns/new";
  const accentColor = "text-primary";
  const badgeColor = "bg-primary/10 text-primary border-primary/20";
  const newButtonLabel = isSales ? "إنشاء مردود مبيعات" : "إنشاء مردود مشتريات";

  const fetchRows = async () => {
    if (!user || !ownerId) return;
    setLoading(true);
    try {
      const data = await fetchAllRows<ReturnRow>((from, to) => supabase.from("returns").select("id,return_number,return_date,contact_id,contact_name,total_amount,status,reason,related_invoice_id,notes,refund_method,refund_account_code,posting_version,revision,tax_inclusive,subtotal,discount_amount,tax_amount").eq("user_id", ownerId).eq("return_type", returnType).eq("is_deleted", false).order("created_at", {ascending: false}).range(from, to));
      setRows(data);
      const ids = [...new Set(data.map(r => r.related_invoice_id).filter((id): id is string => !!id))];
      const names: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data: invoices } = await supabase.from("invoices").select("id,invoice_number").eq("user_id", ownerId).in("id", ids.slice(i, i + 100));
        (invoices || []).forEach(inv => { names[inv.id] = inv.invoice_number || "—"; });
      }
      setInvoiceNumbers(names);
    } catch (error) {
      setRows([]);
      toast({title: "خطأ في تحميل المردودات", description: error instanceof Error ? error.message : "تعذر تحميل القائمة", variant: "destructive"});
    } finally { setLoading(false); }
  };
  useEffect(() => { setRows([]); setPage(1); fetchRows(); }, [user?.id, ownerId, returnType]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => (!q || [r.return_number, r.contact_name, r.reason, r.related_invoice_id ? invoiceNumbers[r.related_invoice_id] : ""].some(v => (v || "").toLowerCase().includes(q))) && (statusFilter === "all" || r.status === statusFilter) && (!dateFrom || (r.return_date || "") >= dateFrom) && (!dateTo || (r.return_date || "") <= dateTo));
  }, [rows, search, statusFilter, dateFrom, dateTo, invoiceNumbers]);
  const paginated = filtered.slice((page - 1) * 50, page * 50);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const resetFilters = () => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); };
  const exportRows = () => {
    const wb = XLSX.utils.book_new();
    const data = filtered.map(r => ({ "رقم المردود": r.return_number, "التاريخ": r.return_date, [isSales ? "العميل" : "المورد"]: r.contact_name, "الفاتورة الأصلية": r.related_invoice_id ? invoiceNumbers[r.related_invoice_id] : "", "السبب": r.reason, "الاسترداد": r.refund_method === "cash" ? "نقدي" : r.refund_method === "bank" ? "بنك" : "آجل", "الحساب": r.refund_account_code || "", "الإجمالي": Number(r.total_amount || 0), "الحالة": r.status === "confirmed" ? "مؤكد" : r.status === "cancelled" ? "ملغى" : "مسودة" }));
    const sheet = XLSX.utils.json_to_sheet(data); sheet["!cols"] = [{wch: 20}, {wch: 14}, {wch: 30}, {wch: 20}, {wch: 35}, {wch: 12}, {wch: 18}, {wch: 16}, {wch: 12}];
    XLSX.utils.book_append_sheet(wb, sheet, "المردودات");
    XLSX.writeFile(wb, `${titleAr}.xlsx`);
  };
  const printList = () => {
    const win = window.open("", "_blank"); if (!win) return;
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[ch] || ch));
    win.document.write(`<html dir="rtl"><head><title>${titleAr}</title><style>body{font-family:Tahoma,Arial}table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px;text-align:right}</style></head><body><h1>${titleAr}</h1><table><thead><tr><th>رقم المردود</th><th>التاريخ</th><th>الجهة</th><th>السبب</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>${filtered.map(r => `<tr><td>${esc(r.return_number)}</td><td>${esc(r.return_date)}</td><td>${esc(r.contact_name)}</td><td>${esc(r.reason)}</td><td>${Number(r.total_amount || 0).toFixed(2)}</td><td>${r.status === "confirmed" ? "مؤكد" : r.status === "cancelled" ? "ملغى" : "مسودة"}</td></tr>`).join("")}</tbody></table></body></html>`);
    win.document.close(); setTimeout(() => win.print(), 300);
  };

  const totalAmount = useMemo(
    () => filtered.filter(r => r.status === "confirmed").reduce((s, r) => s + Number(r.total_amount || 0), 0),
    [filtered]
  );

  const handleDelete = async (row: ReturnRow) => {
    if (!canProcess || busyId || !ownerId) return;
    if (pilot) {
      if (!confirm(`حذف المسودة ${row.return_number}؟`)) return;
      setBusyId(row.id);
      try { await cancelManagedReturn(ownerId, row, true); await fetchRows(); } catch (error) { toast({title: "تعذر الحذف", description: error instanceof Error ? error.message : "أعد المحاولة", variant: "destructive"}); } finally { setBusyId(null); }
      return;
    }
    if (row.status !== "draft") {
      toast({ title: "لا يمكن حذف مردود مرحَّل", description: "المردود المؤكد ثابت محاسبياً ومخزنياً", variant: "destructive" });
      return;
    }
    if (!confirm(`حذف المردود ${row.return_number}؟`)) return;
    const { error } = await supabase.from("returns" as any).update({ is_deleted: true } as any).eq("id", row.id);
    if (error) toast({ title: "خطأ في الحذف", description: error.message, variant: "destructive" });
    else { toast({ title: "تم الحذف ✅" }); fetchRows(); }
  };

  // ─── CANCEL POSTED RETURN (mirrors invoice cancel) ───
  // Flips status → cancelled (trigger reverses stock) then purges the linked
  // accounting transaction + tax ledger so the account statement clears.
  const handleCancel = async (row: ReturnRow) => {
    if (!canProcess || busyId || !ownerId) return;
    if (row.status !== "confirmed") return;
    if (!confirm(`إلغاء المردود ${row.return_number}؟\nسيتم عكس القيد المحاسبي وحركة المخزون تلقائياً.\nيبقى السجل للمراجعة كـ"ملغى".`)) return;
    setBusyId(row.id);
    try {
      if (pilot) {
        await cancelManagedReturn(ownerId, row);
        broadcastChange("transaction", "deleted", row.id);
        toast({ title: "تم إلغاء المردود وعكس آثاره" });
        await fetchRows();
        return;
      }
      const { error: statusErr } = await supabase
        .from("returns" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", row.id);
      if (statusErr) throw statusErr;
      await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("idempotency_key", `RETURN-${row.id}`);
      await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("return_id", row.id).eq("is_deleted", false);
      await supabase
        .from("tax_ledger")
        .delete()
        .eq("reference_id", row.id)
        .in("reference_type", ["sales_return", "purchase_return"]);
      await supabase.from("returns" as any).update({ journal_entry_id: null } as any).eq("id", row.id);
      broadcastChange("transaction", "deleted", row.id);
      toast({ title: `تم إلغاء ${row.return_number} ✅`, description: "تم عكس القيد وحركة المخزون" });
      fetchRows();
    } catch (err: any) {
      toast({ title: "خطأ في الإلغاء", description: err?.message || "حدث خطأ", variant: "destructive" });
    } finally { setBusyId(null); }
  };

  // ─── PRINT SINGLE RETURN DOCUMENT ───
  // Uses the SAME invoice print template (InvoicePrintView) with printMode="return"
  // so returns look pixel-identical to invoices, including the balance box.
  const handlePrint = async (row: ReturnRow) => {
    try {
      const [{ data: items, error: itemsErr }, { data: contact }] = await Promise.all([
        supabase
          .from("return_items" as any)
          .select("description, quantity, unit_price, discount, tax_rate, line_total, product_id")
          .eq("return_id", row.id),
        row.contact_id
          ? supabase
              .from("contacts")
              .select("contact_type, tax_number, phone, email, address")
              .eq("id", row.contact_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (itemsErr) throw itemsErr;

      // الوحدة مصدرها بطاقة الصنف (كيلو/قطعة...) — بنود المردود لا تخزن وحدة
      const productIds = Array.from(new Set(((items as any[]) || []).map((it) => it.product_id).filter(Boolean)));
      const unitByProduct = new Map<string, string>();
      if (productIds.length) {
        const { data: prods } = await supabase.from("products").select("id, unit").in("id", productIds);
        ((prods as any[]) || []).forEach((p) => { if (p.unit) unitByProduct.set(p.id, p.unit); });
      }

      const invoiceItems = ((items as any[]) || []).map((it) => {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.unit_price) || 0;
        const disc = Number(it.discount) || 0;
        const tax = Number(it.tax_rate) || 0;
        const subtotal = Number(it.line_total) || (qty * price - disc) * (1 + tax / 100);
        return {
          description: it.description || "—",
          quantity: qty,
          unitOfMeasure: (it.product_id && unitByProduct.get(it.product_id)) || undefined,
          unitPrice: price,
          discount: disc,
          discountType: "amount" as const,
          taxRate: taxEnabled ? tax : 0,
          taxCategory: (tax > 0 ? "taxable" : "zero") as "taxable" | "zero",
          subtotal,
        };
      });

      const total = Number(row.total_amount) || 0;
      const subtotal = invoiceItems.reduce((s, it) => s + (it.quantity * it.unitPrice - it.discount), 0);
      const totalDiscount = invoiceItems.reduce((s, it) => s + it.discount, 0);
      const totalTax = taxEnabled ? Math.max(0, total - subtotal) : 0;

      // Contact balance: read the canonical live statement balance (NEVER the
      // stale `contacts.current_balance` cache — see contact-balance.ts note).
      // Sign convention (canonical): positive → contact owes us, negative → we owe.
      //  • Sales return REDUCES what the customer owes  → closing = opening − total
      //  • Purchase return REDUCES what we owe supplier → closing = opening + total
      // If the return is already confirmed, the live balance already reflects it,
      // so we rebuild the "before" side by reversing the effect.
      let closingBalance: number | undefined;
      let openingBalance: number | undefined;
      if (row.contact_id && ownerId && row.refund_method === "credit") {
        const liveBalance = await fetchContactStatementBalance({
          contactId: row.contact_id,
          userId: ownerId,
          contactType: (contact as any)?.contact_type,
        });
        closingBalance = liveBalance;
        if (row.status === "confirmed") {
          openingBalance = isSales
            ? closingBalance + total   // sales return reduced AR by total
            : closingBalance - total;  // purchase return reduced AP (negative → toward 0)
        } else {
          // draft/cancelled → return is not posted; before == after
          openingBalance = closingBalance;
        }
      }

      const invoicePayload = {
        type: (isSales ? "sales" : "purchase") as "sales" | "purchase",
        invoiceNumber: row.return_number || "—",
        date: row.return_date || new Date().toISOString().split("T")[0],
        contactName: row.contact_name || "—",
        contactTaxNumber: (contact as any)?.tax_number || undefined,
        contactPhone: (contact as any)?.phone || undefined,
        contactEmail: (contact as any)?.email || undefined,
        contactAddress: (contact as any)?.address || undefined,
        items: invoiceItems,
        notes: row.notes || (row.reason ? `السبب: ${row.reason}` : ""),
        status: row.status || "confirmed",
        paymentMethod: row.refund_method === "bank" ? "transfer" : row.refund_method || "credit",
        taxInclusive: row.tax_inclusive || false,
        subtotal: Number(row.subtotal ?? subtotal),
        totalDiscount: Number(row.discount_amount ?? totalDiscount),
        totalTax: Number(row.tax_amount ?? totalTax),
        total,
        paidAmount: row.refund_method === "credit" ? 0 : total,
        remainingAmount: row.refund_method === "credit" ? total : 0,
        currency: "شيكل",
        contactClosingBalance: closingBalance,
        contactOpeningBalance: openingBalance,
      };

      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<html dir="rtl"><head>
        <title>${titleAr} ${row.return_number || ""}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: white; font-family: 'Cairo', Tahoma, Arial, sans-serif; }
          @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }
        </style>
      </head><body><div id="print-root"></div></body></html>`);
      win.document.close();
      setTimeout(() => {
        const container = win.document.getElementById("print-root");
        if (container) {
          const root = createRoot(container);
          root.render(
            <InvoicePrintView
              invoice={invoicePayload as any}
              settings={companySettings as any}
              copyLabel="أصلية"
              printMode="return"
            />
          );
          setTimeout(() => win.print(), 500);
        }
      }, 200);
    } catch (err: any) {
      toast({ title: "خطأ في الطباعة", description: err?.message || "تعذر تحميل بنود المردود", variant: "destructive" });
    }
  };

  const statusBadge = (s: string | null) => {
    if (s === "draft") return <Badge variant="outline">مسودة</Badge>;
    if (s === "cancelled") return <Badge variant="destructive">ملغى</Badge>;
    return <Badge className={badgeColor}>مؤكد</Badge>;
  };

  return (
    <FinanceShell
      title={titleAr}
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: isSales ? "المبيعات" : "المشتريات" },
        { label: titleAr },
      ]}
      actionTabs={[
        {
          key: "main",
          label: "عام",
          groups: [
            {
              key: "new",
              label: "جديد",
              items: [
                { key: "new", label: newButtonLabel, icon: Plus, variant: "primary", onClick: () => navigate(newPath), disabled: !canProcess },
              ],
            },
            {
              key: "refresh",
              label: "تحديث",
              items: [
                { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchRows },
                { key: "export", label: "تصدير Excel", icon: FileSpreadsheet, onClick: exportRows, disabled: filtered.length === 0 },
                { key: "print-list", label: "طباعة الكشف", icon: Printer, onClick: printList, disabled: filtered.length === 0 },
              ],
            },
          ],
        },
      ] satisfies ActionTab[]}
    >
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{filtered.length} مردود</span><div className="flex items-center gap-2"><div className="flex bg-muted/50 rounded-lg p-0.5"><Button variant="ghost" size="icon" className={`h-8 w-8 ${viewMode === "cards" ? "bg-background text-primary" : "text-muted-foreground"}`} title="عرض بطاقات" aria-label="عرض بطاقات" onClick={() => setViewMode("cards")}><LayoutGrid className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className={`h-8 w-8 ${viewMode === "table" ? "bg-background text-primary" : "text-muted-foreground"}`} title="عرض جدول" aria-label="عرض جدول" onClick={() => setViewMode("table")}><Table2 className="h-4 w-4" /></Button></div><Button size="sm" className="gap-1" disabled={!canProcess} onClick={() => navigate(newPath)}><Plus className="h-4 w-4" />{newButtonLabel}</Button></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي المردودات</div>
          <div className={`text-2xl font-bold ${accentColor}`}>{filtered.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">قيمة المردودات المؤكدة</div>
          <div className={`text-2xl font-bold ${accentColor}`}>₪{totalAmount.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">المسودات</div>
          <div className="text-2xl font-bold">{filtered.filter(r => r.status === "draft").length}</div>
        </CardContent></Card>
      </div>

      <section className="border border-border rounded-lg bg-background">
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end"><div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم المردود، الاسم، أو السبب..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10 bg-muted/30"
            />
          </div>
          <Select dir="rtl" value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الحالات</SelectItem><SelectItem value="draft">مسودة</SelectItem><SelectItem value="confirmed">مؤكد</SelectItem><SelectItem value="cancelled">ملغى</SelectItem></SelectContent></Select>
          </div><div className="flex flex-wrap gap-2 items-end"><div className="space-y-1"><Label className="text-xs text-muted-foreground">من تاريخ</Label><Input type="date" aria-label="من تاريخ" className="h-8 w-40 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div><div className="space-y-1"><Label className="text-xs text-muted-foreground">إلى تاريخ</Label><Input type="date" aria-label="إلى تاريخ" className="h-8 w-40 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div><Button size="sm" variant="ghost" className="gap-1 h-8" onClick={resetFilters}><X className="h-3 w-3" />مسح الفلاتر</Button></div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{rows.length ? "لا توجد نتائج مطابقة" : `لا توجد ${titleAr} بعد`}</p>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{paginated.map(r => <Card key={r.id}><CardContent className="p-4 space-y-3"><div className="flex items-center justify-between"><Button variant="link" className="p-0 h-auto font-mono" onClick={() => navigate(`${newPath}?view=${r.id}`)}>{r.return_number || "—"}</Button>{statusBadge(r.status)}</div><p className="font-semibold text-sm truncate">{r.contact_name || "—"}</p><div className="flex justify-between text-xs text-muted-foreground"><span>{r.return_date}</span><span>{r.refund_method === "cash" ? "نقدي" : r.refund_method === "bank" ? "بنك" : "آجل"}</span></div><p className="text-xs text-muted-foreground truncate">{r.reason || "—"}</p><div className="flex items-center justify-between border-t border-border pt-3"><span className="font-bold text-primary tabular-nums">₪{Number(r.total_amount || 0).toLocaleString()}</span><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title="طباعة" onClick={() => handlePrint(r)}><Printer className="h-4 w-4" /></Button>{canProcess && r.status !== "cancelled" && (!pilot || r.posting_version === 1) && <Button variant="ghost" size="icon" className="h-8 w-8" title="تعديل" onClick={() => navigate(`${newPath}?edit=${r.id}`)}><Pencil className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" className="h-8 w-8" title="عرض" onClick={() => navigate(`${newPath}?view=${r.id}`)}><Eye className="h-4 w-4" /></Button></div></div></CardContent></Card>)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم المردود</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>{isSales ? "العميل" : "المورد"}</TableHead>
                    <TableHead>الفاتورة الأصلية</TableHead>
                    <TableHead>الاسترداد</TableHead>
                    <TableHead>السبب</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        {r.return_number ? (
                          <Button
                            variant="link"
                            onClick={() => navigate(`${newPath}?view=${r.id}`)}
                            className="text-primary hover:underline h-auto p-0"
                            title="عرض السند"
                          >
                            {r.return_number}
                          </Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.return_date || "—"}</TableCell>
                      <TableCell>{r.contact_name || "—"}</TableCell>
                      <TableCell>{r.related_invoice_id ? <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate(`/invoices/new?edit=${r.related_invoice_id}`)}>{invoiceNumbers[r.related_invoice_id] || "عرض الفاتورة"}</Button> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.refund_method === "cash" ? "نقدي" : r.refund_method === "bank" ? "بنك" : "آجل"}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.reason || ""}>
                        {r.reason || "—"}
                      </TableCell>
                      <TableCell className={`text-left font-bold ${accentColor}`}>
                        ₪{Number(r.total_amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="طباعة"
                            onClick={() => handlePrint(r)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {canProcess && r.status !== "cancelled" && (!pilot || r.posting_version === 1) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={r.status === "confirmed" ? "تعديل مردود مرحَّل (إلغاء الترحيل ثم إعادته)" : "تعديل المسودة"}
                              onClick={() => navigate(`${newPath}?edit=${r.id}`)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canProcess && r.status === "confirmed" && (!pilot || r.posting_version === 1) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="إلغاء المردود (عكس القيد والمخزون)"
                              disabled={!!busyId}
                              onClick={() => handleCancel(r)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {canProcess && r.status === "draft" && (!pilot || r.posting_version === 1) && (
                            <Button size="icon" variant="ghost" title="حذف المسودة" aria-label="حذف المسودة" onClick={() => handleDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="عرض السند" aria-label="عرض السند" onClick={() => navigate(`${newPath}?view=${r.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pageCount > 1 && <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button><span className="text-xs text-muted-foreground">{page} / {pageCount}</span><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>التالي</Button></div>}
        </div>
      </section>
    </div>
    </FinanceShell>
  );
};

export default ReturnsListPage;