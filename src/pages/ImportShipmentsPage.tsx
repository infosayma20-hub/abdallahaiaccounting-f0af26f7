import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { multiWordMatchAny } from "@/lib/utils";

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "مسودة", bg: "#F1F5F9", text: "#64748B" },
  items_entered: { label: "تم إدخال البنود", bg: "#FEF9C3", text: "#CA8A04" },
  costs_entered: { label: "تم إدخال التكاليف", bg: "#EFF6FF", text: "#0A2342" },
  distributed: { label: "تم التوزيع", bg: "#DCFCE7", text: "#16A34A" },
  posted: { label: "مرحّل محاسبياً", bg: "#0A2342", text: "#FFFFFF" },
};

const ImportShipmentsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: shipments = [], isLoading, refetch } = useQuery({
    queryKey: ["import-shipments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_shipments")
        .select("*, contacts(contact_name), currencies(code, symbol)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = shipments.filter((s: any) => {
    const matchSearch = !search || 
      s.shipment_number?.includes(search) || 
      s.shipment_name?.includes(search) ||
      s.contacts?.contact_name?.includes(search);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: shipments.length,
    processing: shipments.filter((s: any) => s.status !== "posted" && s.status !== "draft").length,
    totalCost: shipments.reduce((sum: number, s: any) => sum + (s.total_landed_cost || 0), 0),
    avgCostRatio: shipments.length > 0 
      ? shipments.reduce((sum: number, s: any) => {
          const itemsCost = s.total_items_cost_local || 0;
          const importCosts = s.total_import_costs || 0;
          return sum + (itemsCost > 0 ? (importCosts / itemsCost) * 100 : 0);
        }, 0) / shipments.length 
      : 0,
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الشحنة؟")) return;
    const { error } = await supabase.from("import_shipments").delete().eq("id", id);
    if (error) { toast.error("فشل الحذف"); return; }
    toast.success("تم حذف الشحنة");
    refetch();
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>ملفات الاستيراد</h1>
            <p className="text-xs text-muted-foreground">إدارة شحنات الاستيراد وحساب التكلفة الحقيقية</p>
          </div>
        </div>
        <Button onClick={() => navigate("/purchases/import/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          استيراد جديد
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الشحنات", value: stats.total, color: "#0A2342" },
          { label: "قيد المعالجة", value: stats.processing, color: "#CA8A04" },
          { label: "إجمالي التكلفة", value: `₪ ${stats.totalCost.toLocaleString("en", { minimumFractionDigits: 2 })}`, color: "#16A34A" },
          { label: "متوسط نسبة الأعباء", value: `${stats.avgCostRatio.toFixed(1)}%`, color: "#006D8F" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className="text-lg font-bold" style={{ color: kpi.color, fontFamily: "JetBrains Mono, monospace" }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {Object.entries(statusMap).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">لا توجد شحنات استيراد</p>
          <p className="text-xs text-muted-foreground mt-1">ابدأ بإنشاء شحنة استيراد جديدة</p>
          <Button className="mt-4" onClick={() => navigate("/purchases/import/new")}>
            <Plus className="h-4 w-4 ml-2" /> استيراد جديد
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الشحنة</TableHead>
              <TableHead>اسم الشحنة</TableHead>
              <TableHead>المورد</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>البنود</TableHead>
              <TableHead>قيمة البضاعة</TableHead>
              <TableHead>تكاليف الاستيراد</TableHead>
              <TableHead>التكلفة الإجمالية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s: any) => {
              const st = statusMap[s.status] || statusMap.draft;
              return (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/purchases/import/${s.id}`)}>
                  <TableCell className="font-mono text-xs">{s.shipment_number}</TableCell>
                  <TableCell>{s.shipment_name || "—"}</TableCell>
                  <TableCell>{s.contacts?.contact_name || "—"}</TableCell>
                  <TableCell>{s.invoice_date ? format(new Date(s.invoice_date), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="font-mono">₪ {(s.total_items_cost_local || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="font-mono">₪ {(s.total_import_costs || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="font-mono font-bold">₪ {(s.total_landed_cost || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge style={{ background: st.bg, color: st.text }} className="text-[11px]">{st.label}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/purchases/import/${s.id}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {s.status !== "posted" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default ImportShipmentsPage;
