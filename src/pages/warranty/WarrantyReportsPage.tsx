import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, AlertTriangle, TrendingDown, Package, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

export default function WarrantyReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expiring, setExpiring] = useState<any[]>([]);
  const [topFailing, setTopFailing] = useState<any[]>([]);
  const [coverageReport, setCoverageReport] = useState<any[]>([]);
  const [costByProduct, setCostByProduct] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);

      // 1. Expiring this month
      const { data: exp } = await supabase
        .from("warranty_cards")
        .select("*, product:products(name_ar)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("end_date", todayStr)
        .lte("end_date", monthEndStr)
        .order("end_date");
      setExpiring(exp || []);

      // 2. Top failing items (most claims)
      const { data: claims } = await supabase
        .from("warranty_claims")
        .select("warranty_card_id, cost, card:warranty_cards(product:products(id, name_ar))")
        .eq("user_id", user.id);
      const productMap: Record<string, { name: string; count: number; total_cost: number }> = {};
      (claims || []).forEach((c: any) => {
        const pid = c.card?.product?.id;
        const name = c.card?.product?.name_ar || "—";
        if (!pid) return;
        if (!productMap[pid]) productMap[pid] = { name, count: 0, total_cost: 0 };
        productMap[pid].count += 1;
        productMap[pid].total_cost += Number(c.cost || 0);
      });
      setTopFailing(Object.values(productMap).sort((a, b) => b.count - a.count).slice(0, 10));
      setCostByProduct(Object.values(productMap).sort((a, b) => b.total_cost - a.total_cost).slice(0, 10));

      // 3. Supplier coverage ratio
      const { data: sup } = await supabase
        .from("warranty_supplier_claims")
        .select("*, supplier:contacts(contact_name)")
        .eq("user_id", user.id);
      const supMap: Record<string, { name: string; total: number; covered: number; ours: number }> = {};
      (sup || []).forEach((s: any) => {
        const id = s.supplier_id;
        const name = s.supplier?.contact_name || "—";
        if (!supMap[id]) supMap[id] = { name, total: 0, covered: 0, ours: 0 };
        supMap[id].total += Number(s.total_cost || 0);
        supMap[id].covered += Number(s.supplier_coverage_amount || 0);
        supMap[id].ours += Number(s.our_cost || 0);
      });
      setCoverageReport(Object.values(supMap));
    })();
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/warranty")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <BarChart3 className="h-6 w-6 text-sky-600" />
        <div>
          <h1 className="text-2xl font-bold">تقارير الكفالات</h1>
          <p className="text-sm text-muted-foreground">تحليلات وتنبيهات</p>
        </div>
      </div>

      <Tabs defaultValue="expiring" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="expiring">
            <AlertTriangle className="h-4 w-4 ml-1" /> ستنتهي هذا الشهر
          </TabsTrigger>
          <TabsTrigger value="failing">
            <TrendingDown className="h-4 w-4 ml-1" /> أكثر خراباً
          </TabsTrigger>
          <TabsTrigger value="coverage">
            <Package className="h-4 w-4 ml-1" /> تغطية الموردين
          </TabsTrigger>
          <TabsTrigger value="cost">
            <DollarSign className="h-4 w-4 ml-1" /> التكلفة الإجمالية
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expiring">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم البطاقة</TableHead>
                  <TableHead>الصنف</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>تاريخ الانتهاء</TableHead>
                  <TableHead>أيام متبقية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد كفالات تنتهي هذا الشهر</TableCell></TableRow>
                ) : expiring.map((c: any) => {
                  const days = Math.ceil((new Date(c.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.card_number}</TableCell>
                      <TableCell>{c.product?.name_ar || "—"}</TableCell>
                      <TableCell>{c.contact_name || "—"}</TableCell>
                      <TableCell>{format(new Date(c.end_date), "yyyy-MM-dd")}</TableCell>
                      <TableCell><span className={days <= 7 ? "text-destructive font-bold" : "text-orange-600"}>{days} يوم</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="failing">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead>عدد المطالبات</TableHead>
                  <TableHead>إجمالي التكلفة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topFailing.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
                ) : topFailing.map((p: any, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><span className="font-bold text-destructive">{p.count}</span></TableCell>
                    <TableCell>{p.total_cost.toFixed(2)} ₪</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المورد</TableHead>
                  <TableHead>إجمالي التكاليف</TableHead>
                  <TableHead>تعويض المورد</TableHead>
                  <TableHead>تكلفتنا الفعلية</TableHead>
                  <TableHead>نسبة التغطية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد مطالبات</TableCell></TableRow>
                ) : coverageReport.map((s: any, i) => {
                  const pct = s.total > 0 ? (s.covered / s.total) * 100 : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.total.toFixed(2)} ₪</TableCell>
                      <TableCell className="text-emerald-600">{s.covered.toFixed(2)} ₪</TableCell>
                      <TableCell className="text-orange-600">{s.ours.toFixed(2)} ₪</TableCell>
                      <TableCell><span className={pct >= 75 ? "text-emerald-600 font-bold" : pct >= 40 ? "text-orange-600" : "text-destructive"}>{pct.toFixed(1)}%</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="cost">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead>عدد المطالبات</TableHead>
                  <TableHead>تكلفة الضمان</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costByProduct.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
                ) : costByProduct.map((p: any, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.count}</TableCell>
                    <TableCell className="font-bold">{p.total_cost.toFixed(2)} ₪</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
