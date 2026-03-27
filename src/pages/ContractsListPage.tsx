import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FileText, Eye, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { multiWordMatchAny } from "@/lib/utils";

interface Contract {
  id: string;
  contract_number: string;
  project_name: string;
  client_name: string;
  contract_value: number;
  status: string;
  created_at: string;
  start_date: string | null;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  signed: { label: "موقّع", variant: "default" },
  completed: { label: "مكتمل", variant: "outline" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

export default function ContractsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchContracts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_contracts" as any)
      .select("id, contract_number, project_name, client_name, contract_value, status, created_at, start_date")
      .order("created_at", { ascending: false });
    if (data) setContracts(data as any);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const deleteContract = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العقد؟")) return;
    await supabase.from("project_contracts" as any).delete().eq("id", id);
    toast.success("تم حذف العقد");
    fetchContracts();
  };

  const filtered = contracts.filter(c =>
    multiWordMatchAny(search, c.project_name, c.client_name, c.contract_number)
  );

  const fmtNum = (n: number) => n?.toLocaleString("en-US", { minimumFractionDigits: 0 }) || "0";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="إدارة العقود" breadcrumb={["الرئيسية", "إدارة العقود"]} />
        <Button onClick={() => navigate("/contracts/new")}>
          <Plus className="h-4 w-4 ml-1" /> عقد جديد
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي العقود</p>
          <p className="text-2xl font-bold text-foreground">{contracts.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">مسودات</p>
          <p className="text-2xl font-bold text-muted-foreground">{contracts.filter(c => c.status === "draft").length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">موقّعة</p>
          <p className="text-2xl font-bold text-primary">{contracts.filter(c => c.status === "signed").length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي القيمة</p>
          <p className="text-2xl font-bold text-primary">{fmtNum(contracts.reduce((s, c) => s + (c.contract_value || 0), 0))} ₪</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="ابحث بالرقم أو اسم المشروع أو العميل..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم العقد</TableHead>
                <TableHead className="text-right">المشروع</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">القيمة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">أفعال</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{loading ? "جاري التحميل..." : "لا توجد عقود بعد"}</p>
                    {!loading && (
                      <Button variant="outline" className="mt-3" onClick={() => navigate("/contracts/new")}>
                        <Plus className="h-4 w-4 ml-1" /> إنشاء عقد جديد
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : filtered.map(c => {
                const st = statusMap[c.status] || statusMap.draft;
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}/preview`)}>
                    <TableCell className="font-mono text-sm">{c.contract_number}</TableCell>
                    <TableCell className="font-medium">{c.project_name}</TableCell>
                    <TableCell>{c.client_name}</TableCell>
                    <TableCell className="font-medium">{fmtNum(c.contract_value)} ₪</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.start_date ? format(new Date(c.start_date), "dd/MM/yyyy") : format(new Date(c.created_at), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/contracts/${c.id}/preview`); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/contracts/${c.id}/edit`); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); deleteContract(c.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
