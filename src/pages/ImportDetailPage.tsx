import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Package } from "lucide-react";
import { format } from "date-fns";

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "مسودة", bg: "#F1F5F9", text: "#64748B" },
  items_entered: { label: "تم إدخال البنود", bg: "#FEF9C3", text: "#CA8A04" },
  costs_entered: { label: "تم إدخال التكاليف", bg: "#EFF6FF", text: "#0A2342" },
  distributed: { label: "تم التوزيع", bg: "#DCFCE7", text: "#16A34A" },
  posted: { label: "مرحّل محاسبياً", bg: "#0A2342", text: "#FFFFFF" },
};

const ImportDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["import-shipment", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_shipments")
        .select("*, contacts(contact_name), currencies(code, name_ar, symbol)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["import-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("import_shipment_items").select("*").eq("shipment_id", id!).order("line_number");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: costs = [] } = useQuery({
    queryKey: ["import-costs", id],
    queryFn: async () => {
      const { data } = await supabase.from("import_costs").select("*").eq("shipment_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const fmt = (n: number | null) => (n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading) return <div className="p-6"><div className="h-8 bg-muted animate-pulse rounded-lg w-48 mb-4" /><div className="h-64 bg-muted animate-pulse rounded-lg" /></div>;
  if (!shipment) return <div className="p-6 text-center text-muted-foreground">الشحنة غير موجودة</div>;

  const st = statusMap[shipment.status] || statusMap.draft;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <Package className="h-7 w-7 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{shipment.shipment_name || shipment.shipment_number}</h1>
              <Badge style={{ background: st.bg, color: st.text }}>{st.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{shipment.shipment_number}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">المورد</p><p className="font-medium text-sm">{(shipment as any).contacts?.contact_name || "—"}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">التاريخ</p><p className="font-medium text-sm">{shipment.invoice_date ? format(new Date(shipment.invoice_date), "dd/MM/yyyy") : "—"}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">قيمة البضاعة</p><p className="font-mono font-bold">₪ {fmt(shipment.total_items_cost_local)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">تكاليف الاستيراد</p><p className="font-mono font-bold text-primary">₪ {fmt(shipment.total_import_costs)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">التكلفة الإجمالية</p><p className="font-mono font-bold text-lg">₪ {fmt(shipment.total_landed_cost)}</p></Card>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">بنود الشحنة</TabsTrigger>
          <TabsTrigger value="costs">التكاليف</TabsTrigger>
          <TabsTrigger value="distribution">توزيع التكاليف</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>كود الموديل</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>اللون</TableHead>
                <TableHead>الأبعاد</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>سعر الوحدة</TableHead>
                <TableHead>الإجمالي المحلي</TableHead>
                <TableHead>التكاليف الموزعة</TableHead>
                <TableHead className="bg-accent/30">التكلفة الحقيقية/وحدة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.line_number}</TableCell>
                  <TableCell className="font-mono text-xs">{item.model_code || "—"}</TableCell>
                  <TableCell>{item.description_en || item.description_ar || "—"}</TableCell>
                  <TableCell>{item.color || "—"}</TableCell>
                  <TableCell className="text-xs">{item.size_mm || "—"}</TableCell>
                  <TableCell className="font-mono">{item.quantity}</TableCell>
                  <TableCell className="font-mono">{fmt(item.unit_price_foreign)}</TableCell>
                  <TableCell className="font-mono">₪ {fmt(item.total_price_local)}</TableCell>
                  <TableCell className="font-mono text-primary">₪ {fmt(item.total_allocated_costs)}</TableCell>
                  <TableCell className="font-mono font-bold bg-accent/10">₪ {fmt(item.landed_cost_per_unit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-bold">الإجمالي</TableCell>
                <TableCell className="font-mono font-bold">{items.reduce((s: number, i: any) => s + (i.quantity || 0), 0)}</TableCell>
                <TableCell></TableCell>
                <TableCell className="font-mono font-bold">₪ {fmt(items.reduce((s: number, i: any) => s + (i.total_price_local || 0), 0))}</TableCell>
                <TableCell className="font-mono font-bold text-primary">₪ {fmt(items.reduce((s: number, i: any) => s + (i.total_allocated_costs || 0), 0))}</TableCell>
                <TableCell className="font-mono font-bold bg-accent/10">₪ {fmt(items.reduce((s: number, i: any) => s + (i.landed_cost_total || 0), 0))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نوع التكلفة</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>بالشيكل</TableHead>
                <TableHead>طريقة التوزيع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.cost_type}</TableCell>
                  <TableCell>{c.cost_name_ar}</TableCell>
                  <TableCell className="font-mono">{fmt(c.amount)}</TableCell>
                  <TableCell className="font-mono">₪ {fmt(c.amount_local)}</TableCell>
                  <TableCell>{c.distribution_method}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-bold">الإجمالي</TableCell>
                <TableCell className="font-mono font-bold">₪ {fmt(costs.reduce((s: number, c: any) => s + (c.amount_local || 0), 0))}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البند</TableHead>
                  <TableHead>شحن</TableHead>
                  <TableHead>جمارك</TableHead>
                  <TableHead>أخرى</TableHead>
                  <TableHead className="font-bold">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description_en || item.model_code || `بند ${item.line_number}`}</TableCell>
                    <TableCell className="font-mono">₪ {fmt(item.allocated_shipping)}</TableCell>
                    <TableCell className="font-mono">₪ {fmt(item.allocated_customs)}</TableCell>
                    <TableCell className="font-mono">₪ {fmt(item.allocated_other_costs)}</TableCell>
                    <TableCell className="font-mono font-bold">₪ {fmt(item.total_allocated_costs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImportDetailPage;
