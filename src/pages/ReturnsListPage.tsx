import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Search, Loader2, Eye, Pencil, Trash2, RefreshCw, XCircle, Printer } from "lucide-react";
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
}

interface Props {
  returnType: "sales" | "purchase";
}

const ReturnsListPage = ({ returnType }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: companySettings } = useCompanySettings();
  const { taxEnabled } = useTaxEnabled();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const isSales = returnType === "sales";

  const titleAr = isSales ? "مردودات المبيعات" : "مردودات المشتريات";
  const newPath = isSales ? "/sales/returns/new" : "/purchases/returns/new";
  const accentColor = isSales ? "text-emerald-600" : "text-rose-600";
  const badgeColor = isSales
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-rose-100 text-rose-700 border-rose-200";
  const newButtonLabel = isSales ? "إنشاء مردود مبيعات" : "إنشاء مردود مشتريات";
  const headerSubtitle = isSales
    ? "مردودات المبيعات — إرجاع بضاعة من العميل وإعادتها للمخزون (كيان مستقل عن الفواتير)"
    : "مردودات المشتريات — إرجاع بضاعة للمورد وخصمها من المخزون (كيان مستقل عن الفواتير)";

  const fetchRows = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("returns" as any)
      .select("id, return_number, return_date, contact_id, contact_name, total_amount, status, reason, related_invoice_id, notes")
      .eq("user_id", user.id)
      .eq("return_type", returnType)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "خطأ في تحميل المردودات", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, [user, returnType]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.return_number || "").toLowerCase().includes(q) ||
      (r.contact_name || "").toLowerCase().includes(q) ||
      (r.reason || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0),
    [filtered]
  );

  const handleDelete = async (row: ReturnRow) => {
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
    if (row.status !== "confirmed") return;
    if (!confirm(`إلغاء المردود ${row.return_number}؟\nسيتم عكس القيد المحاسبي وحركة المخزون تلقائياً.\nيبقى السجل للمراجعة كـ"ملغى".`)) return;
    try {
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
    }
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

      const invoiceItems = ((items as any[]) || []).map((it) => {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.unit_price) || 0;
        const disc = Number(it.discount) || 0;
        const tax = Number(it.tax_rate) || 0;
        const subtotal = Number(it.line_total) || (qty * price - disc) * (1 + tax / 100);
        return {
          description: it.description || "—",
          quantity: qty,
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
      if (row.contact_id && user?.id) {
        const liveBalance = await fetchContactStatementBalance({
          contactId: row.contact_id,
          userId: user.id,
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
        paymentMethod: "credit",
        subtotal,
        totalDiscount,
        totalTax,
        total,
        paidAmount: 0,
        remainingAmount: total,
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
      subtitle={headerSubtitle}
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
                { key: "new", label: newButtonLabel, icon: Plus, variant: "primary", onClick: () => navigate(newPath) },
              ],
            },
            {
              key: "refresh",
              label: "تحديث",
              items: [
                { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchRows },
              ],
            },
          ],
        },
      ] satisfies ActionTab[]}
    >
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي المردودات</div>
          <div className={`text-2xl font-bold ${accentColor}`}>{filtered.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي القيمة</div>
          <div className={`text-2xl font-bold ${accentColor}`}>₪{totalAmount.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">المسودات</div>
          <div className="text-2xl font-bold">{filtered.filter(r => r.status === "draft").length}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم المردود، الاسم، أو السبب..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد {titleAr} بعد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم المردود</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>{isSales ? "العميل" : "المورد"}</TableHead>
                    <TableHead>السبب</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        {r.return_number ? (
                          <button
                            type="button"
                            onClick={() => navigate(`${newPath}?view=${r.id}`)}
                            className="text-primary hover:underline"
                            title="عرض السند"
                          >
                            {r.return_number}
                          </button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.return_date || "—"}</TableCell>
                      <TableCell>{r.contact_name || "—"}</TableCell>
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
                          {r.status !== "cancelled" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={r.status === "confirmed" ? "تعديل مردود مرحَّل (إلغاء الترحيل ثم إعادته)" : "تعديل المسودة"}
                              onClick={() => navigate(`${newPath}?edit=${r.id}`)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {r.status === "confirmed" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="إلغاء المردود (عكس القيد والمخزون)"
                              onClick={() => handleCancel(r)}
                            >
                              <XCircle className="h-4 w-4 text-rose-600" />
                            </Button>
                          )}
                          {r.status === "draft" && (
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => navigate(`${newPath}?view=${r.id}`)}>
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
        </CardContent>
      </Card>
    </div>
    </FinanceShell>
  );
};

export default ReturnsListPage;