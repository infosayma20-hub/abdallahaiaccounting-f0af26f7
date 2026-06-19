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
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";

interface ReturnRow {
  id: string;
  return_number: string | null;
  return_date: string | null;
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
      .select("id, return_number, return_date, contact_name, total_amount, status, reason, related_invoice_id, notes")
      .eq("user_id", dataOwnerId!)
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

  const statusBadge = (s: string | null) => {
    if (s === "draft") return <Badge variant="outline">مسودة</Badge>;
    if (s === "cancelled") return <Badge variant="destructive">ملغى</Badge>;
    return <Badge className={badgeColor}>مؤكد</Badge>;
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={titleAr}
        breadcrumb={["الرئيسية", isSales ? "المبيعات" : "المشتريات", titleAr]}
      />
      <div className="flex justify-between items-start gap-3">
        <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
        <Button onClick={() => navigate(newPath)} className="gap-2">
          <Plus className="h-4 w-4" /> {newButtonLabel}
        </Button>
      </div>

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
                      <TableCell className="font-mono">{r.return_number || "—"}</TableCell>
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
  );
};

export default ReturnsListPage;