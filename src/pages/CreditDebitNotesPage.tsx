import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Plus, FileText, Search, Loader2, Eye, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import AccountingShell from "@/components/layout/AccountingShell";
import { assertAccountantPermission } from "@/lib/permissions/assertAccountantPermission";

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

  const isCredit = noteType === "credit";
  const isCustomerSide = noteType === "credit";

  const dbInvoiceType = noteType === "credit" ? "credit_note" : "debit_note";

  const titleAr = noteType === "credit" ? "الإشعارات الدائنة" : "الإشعارات المدينة";

  const newPath = noteType === "credit" ? "/credit-notes/new" : "/debit-notes/new";

  const accentColor = isCustomerSide ? "text-emerald-600" : "text-rose-600";
  const badgeColor = isCustomerSide
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-rose-100 text-rose-700 border-rose-200";

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

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.invoice_number || "").toLowerCase().includes(q) ||
      (r.contact_name || "").toLowerCase().includes(q) ||
      (r.correction_reason || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

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
    return <Badge className={badgeColor}>مرحَّل</Badge>;
  };

  return (
    <AccountingShell>
    <div className="container mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={titleAr}
        breadcrumb={["الرئيسية", isCustomerSide ? "المبيعات" : "المشتريات", titleAr]}
      />
      <div className="flex justify-between items-start gap-3">
        <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
        <Button onClick={() => navigate(newPath)} className="gap-2">
          <Plus className="h-4 w-4" /> {newButtonLabel}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي الإشعارات</div>
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
              placeholder="بحث برقم الإشعار، الاسم، أو السبب..."
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
                    <TableHead>رقم الإشعار</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>{isCustomerSide ? "العميل" : "المورد"}</TableHead>
                    <TableHead>السبب</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.invoice_number || "—"}</TableCell>
                      <TableCell>{r.invoice_date || "—"}</TableCell>
                      <TableCell>{r.contact_name || "—"}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.correction_reason || ""}>
                        {r.correction_reason || "—"}
                      </TableCell>
                      <TableCell className={`text-left font-bold ${accentColor}`}>
                        ₪{Number(r.total_amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.status === "draft" && (
                            <>
                              <Button size="icon" variant="ghost" onClick={() => navigate(`${newPath}?edit=${r.id}`)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(r)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
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
    </AccountingShell>
  );
};

export default CreditDebitNotesPage;
