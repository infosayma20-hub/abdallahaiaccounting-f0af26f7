import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SERVICE_LABELS: Record<string, string> = {
  flight: "✈️ تذاكر طيران", hotel: "🏨 فنادق", visa: "📋 تأشيرة", package: "📦 باقة",
  honeymoon: "💍 شهر عسل", umrah: "🕋 عمرة", hajj: "🕌 حج", transfer: "🚐 ترانسفير", insurance: "🛡️ تأمين",
};

export default function TravelReportsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (!user) return;
    supabase.from("travel_bookings").select("*").gte("booking_date", dateFrom).lte("booking_date", dateTo)
      .then(({ data }) => { if (data) setBookings(data); });
  }, [user, dateFrom, dateTo]);

  const active = bookings.filter(b => b.status !== "cancelled");

  // Report 1: Service profitability
  const serviceMap: Record<string, { count: number; sales: number; cost: number; profit: number }> = {};
  active.forEach(b => {
    if (!serviceMap[b.service_type]) serviceMap[b.service_type] = { count: 0, sales: 0, cost: 0, profit: 0 };
    const m = serviceMap[b.service_type];
    m.count++;
    m.sales += b.selling_price || 0;
    m.cost += b.cost_price_ils || 0;
    m.profit += (b.selling_price || 0) - (b.cost_price_ils || 0);
  });

  // Report 2: Supplier analysis
  const supplierMap: Record<string, { count: number; paid: number; balance: number }> = {};
  active.forEach(b => {
    const sid = b.supplier_id || "none";
    if (!supplierMap[sid]) supplierMap[sid] = { count: 0, paid: 0, balance: 0 };
    supplierMap[sid].count++;
    supplierMap[sid].paid += b.supplier_paid ? (b.cost_price_ils || 0) : 0;
    supplierMap[sid].balance += b.supplier_paid ? 0 : (b.cost_price_ils || 0);
  });

  // Report 3: Customer receivables
  const customerMap: Record<string, { name: string; total: number; paid: number; balance: number; bookings: number }> = {};
  active.forEach(b => {
    const key = b.customer_name || "بدون اسم";
    if (!customerMap[key]) customerMap[key] = { name: key, total: 0, paid: 0, balance: 0, bookings: 0 };
    customerMap[key].total += b.selling_price || 0;
    customerMap[key].paid += b.amount_paid || 0;
    customerMap[key].balance += (b.selling_price || 0) - (b.amount_paid || 0);
    customerMap[key].bookings++;
  });

  // Report 4: Cash flow
  const totalReceipts = active.reduce((s, b) => s + (b.amount_paid || 0), 0);
  const totalSupplierPaid = active.filter(b => b.supplier_paid).reduce((s, b) => s + (b.cost_price_ils || 0), 0);
  const netCashFlow = totalReceipts - totalSupplierPaid;

  const totalSales = active.reduce((s, b) => s + (b.selling_price || 0), 0);
  const totalCost = active.reduce((s, b) => s + (b.cost_price_ils || 0), 0);
  const totalProfit = totalSales - totalCost;

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>📊 تقارير السياحة</h1>

      {/* Date range */}
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="text-xs">من</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">إلى</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" /></div>
        <Badge variant="secondary" className="h-8">{active.length} حجز</Badge>
      </div>

      <Tabs defaultValue="services" dir="rtl">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="services">ربحية الخدمات</TabsTrigger>
          <TabsTrigger value="suppliers">الموردون</TabsTrigger>
          <TabsTrigger value="customers">ذمم العملاء</TabsTrigger>
          <TabsTrigger value="cashflow">التدفق النقدي</TabsTrigger>
        </TabsList>

        {/* Report 1 */}
        <TabsContent value="services">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-right py-3 px-3">الخدمة</th>
                  <th className="text-right py-3 px-2">عدد الحجوزات</th>
                  <th className="text-right py-3 px-2">إجمالي المبيعات</th>
                  <th className="text-right py-3 px-2">إجمالي التكلفة</th>
                  <th className="text-right py-3 px-2">صافي الربح</th>
                  <th className="text-right py-3 px-2">هامش %</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(serviceMap).sort((a, b) => b[1].profit - a[1].profit).map(([type, d]) => (
                  <tr key={type} className="border-b last:border-0">
                    <td className="py-2.5 px-3">{SERVICE_LABELS[type] || type}</td>
                    <td className="py-2.5 px-2">{d.count}</td>
                    <td className="py-2.5 px-2">₪{d.sales.toLocaleString()}</td>
                    <td className="py-2.5 px-2">₪{d.cost.toLocaleString()}</td>
                    <td className="py-2.5 px-2 font-medium" style={{ color: d.profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{d.profit.toLocaleString()}</td>
                    <td className="py-2.5 px-2">{d.sales > 0 ? ((d.profit / d.sales) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold text-sm">
                  <td className="py-3 px-3">الإجمالي</td>
                  <td className="py-3 px-2">{active.length}</td>
                  <td className="py-3 px-2">₪{totalSales.toLocaleString()}</td>
                  <td className="py-3 px-2">₪{totalCost.toLocaleString()}</td>
                  <td className="py-3 px-2" style={{ color: totalProfit >= 0 ? "#16A34A" : "#DC2626" }}>₪{totalProfit.toLocaleString()}</td>
                  <td className="py-3 px-2">{totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0}%</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </TabsContent>

        {/* Report 2 */}
        <TabsContent value="suppliers">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-right py-3 px-3">المورد</th>
                  <th className="text-right py-3 px-2">عدد الحجوزات</th>
                  <th className="text-right py-3 px-2">إجمالي المدفوع</th>
                  <th className="text-right py-3 px-2">الرصيد المستحق</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(supplierMap).map(([sid, d]) => (
                    <tr key={sid} className="border-b last:border-0">
                      <td className="py-2.5 px-3">{sid === "none" ? "بدون مورد" : sid.slice(0, 8)}</td>
                      <td className="py-2.5 px-2">{d.count}</td>
                      <td className="py-2.5 px-2">₪{d.paid.toLocaleString()}</td>
                      <td className="py-2.5 px-2 font-medium" style={{ color: d.balance > 0 ? "#DC2626" : "#16A34A" }}>₪{d.balance.toLocaleString()}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* Report 3 */}
        <TabsContent value="customers">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-right py-3 px-3">العميل</th>
                  <th className="text-right py-3 px-2">الحجوزات</th>
                  <th className="text-right py-3 px-2">الإجمالي</th>
                  <th className="text-right py-3 px-2">المدفوع</th>
                  <th className="text-right py-3 px-2">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(customerMap).filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance).map(c => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2.5 px-3">{c.name}</td>
                    <td className="py-2.5 px-2">{c.bookings}</td>
                    <td className="py-2.5 px-2">₪{c.total.toLocaleString()}</td>
                    <td className="py-2.5 px-2">₪{c.paid.toLocaleString()}</td>
                    <td className="py-2.5 px-2 font-medium text-red-600">₪{c.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.values(customerMap).filter(c => c.balance > 0).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد ذمم مستحقة</p>
            )}
          </Card>
        </TabsContent>

        {/* Report 4 */}
        <TabsContent value="cashflow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">المقبوضات من العملاء</p>
              <p className="text-2xl font-bold text-green-600">₪{totalReceipts.toLocaleString()}</p>
            </Card>
            <Card className="p-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">المدفوعات للموردين</p>
              <p className="text-2xl font-bold text-red-600">₪{totalSupplierPaid.toLocaleString()}</p>
            </Card>
            <Card className="p-6 text-center border-2" style={{ borderColor: netCashFlow >= 0 ? "#16A34A" : "#DC2626" }}>
              <p className="text-xs text-muted-foreground mb-2">صافي التدفق النقدي</p>
              <p className="text-2xl font-bold" style={{ color: netCashFlow >= 0 ? "#16A34A" : "#DC2626" }}>₪{netCashFlow.toLocaleString()}</p>
            </Card>
          </div>

          <Card className="p-4 mt-4">
            <h3 className="font-semibold text-sm mb-3">ملخص الفترة</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>إجمالي المبيعات</span><span className="font-medium">₪{totalSales.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>إجمالي التكلفة</span><span className="font-medium">₪{totalCost.toLocaleString()}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">صافي الربح</span><span className="font-bold" style={{ color: totalProfit >= 0 ? "#16A34A" : "#DC2626" }}>₪{totalProfit.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>هامش الربح</span><span className="font-medium">{totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0}%</span></div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
