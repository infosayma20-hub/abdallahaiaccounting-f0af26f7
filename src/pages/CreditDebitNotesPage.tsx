import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, FileText, Search, Loader2, Eye, Pencil, Trash2, RefreshCw, Printer, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { assertAccountantPermission } from "@/lib/permissions/assertAccountantPermission";
import {
  FinanceShell, applyFilters,
  type ActionTab, type FilterCondition, type FilterField,
} from "@/components/finance/shell";

interface NoteRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  contact_name: string | null;
  total_amount: number | null;
  status: string | null;
  correction_reason: string | null;
  original_invoice_id: string | null;
  notes: string | null;
}

interface Props {
  noteType: "credit" | "debit";
}

const CreditDebitNotesPage = ({ noteType }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);

  const isCredit = noteType === "credit";
  const isCustomerSide = noteType === "credit";

  const dbInvoiceType = noteType === "credit" ? "credit_note" : "debit_note";

  const titleAr = noteType === "credit" ? "الإشعارات الدائنة" : "الإشعارات المدينة";

  const newPath = noteType === "credit" ? "/credit-notes/new" : "/debit-notes/new";

  const newButtonLabel = noteType === "credit" ? "إنشاء إشعار دائن" : "إنشاء إشعار مدين";

  const headerSubtitle = noteType === "credit"
    ? "إشعارات دائنة للعملاء — تخفيض أو إلغاء جزئي/كلي لفواتير المبيعات"
    : "إشعارات مدينة للموردين — تخفيض على فواتير المشتريات";

  const fetchNotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, contact_name, total_amount, status, correction_reason, original_invoice_id, notes")
      .eq("user_id", user.id)
      .eq("invoice_type", dbInvoiceType)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "خطأ في تحميل الإشعارات", variant: "destructive" });
    } else {
      setRows((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchNotes(); }, [user, noteType]);

  const filterFields: FilterField[] = useMemo(() => [
    { key: "invoice_number", label: "رقم الإشعار", type: "text" },
    { key: "contact_name", label: isCustomerSide ? "العميل" : "المورد", type: "text" },
    { key: "correction_reason", label: "السبب", type: "text" },
    { key: "invoice_date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "option", options: [
      { value: "draft", label: "مسودة" },
      { value: "sent", label: "مرحَّل" },
      { value: "cancelled", label: "ملغى" },
    ]},
  ], [isCustomerSide]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySearch = !q ? rows : rows.filter(r =>
      (r.invoice_number || "").toLowerCase().includes(q) ||
      (r.contact_name || "").toLowerCase().includes(q) ||
      (r.correction_reason || "").toLowerCase().includes(q)
    );
    return applyFilters(bySearch, shellFilters);
  }, [rows, search, shellFilters]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0),
    [filtered]
  );

  const handleDelete = async (row: NoteRow) => {
    try { await assertAccountantPermission("can_delete_invoices"); } catch { return; }
    if (row.status !== "draft") {
      toast({ title: "لا يمكن حذف إشعار مرحَّل", description: "الإشعار المرحّل ثابت محاسبياً", variant: "destructive" });
      return;
    }
    if (!confirm(`حذف الإشعار ${row.invoice_number}؟`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", row.id);
    if (error) toast({ title: "خطأ في الحذف", variant: "destructive" });
    else { toast({ title: "تم الحذف ✅" }); fetchNotes(); }
  };

  const statusBadge = (s: string | null) => {
    if (s === "draft") return <Badge variant="outline">مسودة</Badge>;
    if (s === "cancelled") return <Badge variant="destructive">ملغى</Badge>;
    return <Badge className="bg-primary/10 text-primary border-primary/20">مرحَّل</Badge>;
  };

  const actionTabs: ActionTab[] = useMemo(() => ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "new", label: newButtonLabel, icon: Plus, variant: "primary", onClick: () => navigate(newPath) },
      ]},
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchNotes },
      ]},
      { key: "print", label: "طباعة", items: [
        { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print(), disabled: filtered.length === 0 },
      ]},
    ],
  }]), [filtered.length, newButtonLabel, newPath]);

  return (
    <FinanceShell
      title={titleAr}
      subtitle={headerSubtitle}
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: isCustomerSide ? "المبيعات" : "المشتريات" },
        { label: titleAr },
      ]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey={`credit-debit-notes-${noteType}`}
      rightSlot={
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث سريع..."
            className="h-8 w-56 pr-8 text-xs"
          />
        </div>
      }
    >
      <div className="space-y-4 w-full" dir="rtl">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">إجمالي الإشعارات</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{filtered.length}</p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">إجمالي القيمة</p>
            <p className="text-xl font-bold text-primary tabular-nums">
              ₪{totalAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
            <p className="text-[11px] text-muted-foreground">المسودات</p>
            <p className="text-xl font-bold text-muted-foreground tabular-nums">
              {filtered.filter(r => r.status === "draft").length}
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
            <p className="text-sm text-muted-foreground">لا توجد {titleAr} مطابقة</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="border-b border-border/60 bg-primary text-primary-foreground">
                    <th className="text-right px-3 py-2 text-[11px] font-semibold">رقم الإشعار</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold">التاريخ</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold">{isCustomerSide ? "العميل" : "المورد"}</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold">السبب</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold">المبلغ</th>
                    <th className="text-center px-3 py-2 text-[11px] font-semibold">الحالة</th>
                    <th className="text-center px-2 py-2 text-[11px] font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={`border-b border-border/40 hover:bg-primary/5 transition-colors ${idx % 2 ? "bg-muted/10" : ""}`}
                    >
                      <td className="px-3 py-2 align-middle">
                        <button
                          onClick={() => navigate(`${newPath}?view=${r.id}`)}
                          className="text-primary hover:underline font-mono text-xs bg-transparent border-0 p-0 cursor-pointer text-right"
                        >
                          {r.invoice_number || "—"}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums align-middle">{r.invoice_date || "—"}</td>
                      <td className="px-3 py-2 text-sm align-middle">{r.contact_name || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground align-middle max-w-xs truncate" title={r.correction_reason || ""}>
                        {r.correction_reason || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm font-bold tabular-nums text-left align-middle">
                        ₪{Number(r.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center align-middle">{statusBadge(r.status)}</td>
                      <td className="px-2 py-1 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {r.status === "draft" && (
                            <>
                              <button
                                onClick={() => navigate(`${newPath}?edit=${r.id}`)}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="تعديل"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(r)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => navigate(`${newPath}?view=${r.id}`)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="عرض"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                    <td colSpan={4} className="px-3 py-2 text-right text-foreground">
                      المجموع ({filtered.length} إشعار)
                    </td>
                    <td className="px-3 py-2 text-left tabular-nums text-foreground">
                      ₪{totalAmount.toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </FinanceShell>
  );
};

export default CreditDebitNotesPage;
