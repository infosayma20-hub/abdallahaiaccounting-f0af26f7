import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Phone, BarChart3, TrendingUp, Users, DollarSign, Truck, ShoppingBag,
  CreditCard, Banknote, Calendar, Clock, ArrowUpDown, FileText,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface CCOrder {
  id: string;
  source_app: string;
  target_branch_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  payment_method: string;
  total: number;
  status: string;
  dispatched_by_name: string;
  created_at: string;
  accepted_at: string | null;
  items: any[];
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

const CallCenterReportsPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CCOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId(data || user.id);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!dataOwnerId) return;
    setLoading(true);
    supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .neq("status", "cancelled")
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as any as CCOrder[]) || []);
        setLoading(false);
      });
  }, [dataOwnerId, dateFrom, dateTo]);

  // KPIs
  const totalOrders = orders.length;
  const totalSales = orders.filter(o => o.status === "accepted").reduce((s, o) => s + (o.total || 0), 0);
  const avgOrder = totalOrders > 0 ? totalSales / orders.filter(o => o.status === "accepted").length || 0 : 0;
  const deliveryCount = orders.filter(o => o.delivery_type === "delivery").length;
  const pickupCount = orders.filter(o => o.delivery_type === "pickup").length;

  // By source app
  const bySourceApp = useMemo(() => {
    const map: Record<string, { count: number; total: number; delivery: number; pickup: number }> = {};
    orders.forEach(o => {
      if (!map[o.source_app]) map[o.source_app] = { count: 0, total: 0, delivery: 0, pickup: 0 };
      map[o.source_app].count++;
      map[o.source_app].total += o.total || 0;
      if (o.delivery_type === "delivery") map[o.source_app].delivery++;
      else map[o.source_app].pickup++;
    });
    return Object.entries(map).map(([name, d]) => ({ name, ...d, avg: d.count > 0 ? d.total / d.count : 0 }));
  }, [orders]);

  // By branch
  const byBranch = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    orders.forEach(o => {
      const b = o.target_branch_name || "غير محدد";
      if (!map[b]) map[b] = { count: 0, total: 0 };
      map[b].count++;
      map[b].total += o.total || 0;
    });
    return Object.entries(map).map(([name, d]) => ({ name, ...d }));
  }, [orders]);

  // By staff
  const byStaff = useMemo(() => {
    const map: Record<string, { count: number; total: number; branches: Set<string> }> = {};
    orders.forEach(o => {
      const s = o.dispatched_by_name || "غير معروف";
      if (!map[s]) map[s] = { count: 0, total: 0, branches: new Set() };
      map[s].count++;
      map[s].total += o.total || 0;
      map[s].branches.add(o.target_branch_name);
    });
    return Object.entries(map).map(([name, d]) => ({
      name,
      count: d.count,
      total: d.total,
      branchCount: d.branches.size,
      branches: Array.from(d.branches).join("، "),
    }));
  }, [orders]);

  // By payment
  const byPayment = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    orders.forEach(o => {
      const pm = o.payment_method || "cash";
      const label = pm === "cash" ? "نقدي" : pm === "visa" ? "فيزا" : pm.replace("visa_", "فيزا ").replace(/_/g, " ");
      if (!map[label]) map[label] = { count: 0, total: 0 };
      map[label].count++;
      map[label].total += o.total || 0;
    });
    return Object.entries(map).map(([name, d]) => ({ name, ...d }));
  }, [orders]);

  const fmt = (n: number) => `₪${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              تقارير الكول سنتر
            </h1>
            <p className="text-xs text-muted-foreground">{totalOrders} طلب في الفترة المحددة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-36 text-xs" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "إجمالي الطلبات", value: totalOrders, icon: FileText, color: "text-blue-500" },
          { label: "إجمالي المبيعات", value: fmt(totalSales), icon: DollarSign, color: "text-green-500" },
          { label: "متوسط الطلب", value: fmt(avgOrder), icon: TrendingUp, color: "text-amber-500" },
          { label: "توصيل", value: deliveryCount, icon: Truck, color: "text-orange-500" },
          { label: "استلام", value: pickupCount, icon: ShoppingBag, color: "text-sky-500" },
        ].map((kpi, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="daily" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> الطلبات اليومي</TabsTrigger>
          <TabsTrigger value="apps" className="gap-1.5 text-xs"><Truck className="h-3.5 w-3.5" /> شركات التوصيل</TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" /> مالي</TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> الموظفين</TabsTrigger>
        </TabsList>

        {/* Daily Orders */}
        <TabsContent value="daily">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="p-3 text-right font-medium text-muted-foreground">الوقت</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">المصدر</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">الزبون</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">الفرع</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">النوع</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">الدفع</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">المبلغ</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">الحالة</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">الموظف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                    ) : orders.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">لا توجد طلبات في هذه الفترة</td></tr>
                    ) : orders.map(order => (
                      <tr key={order.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-3 text-xs font-mono">{new Date(order.created_at).toLocaleString("ar-PS", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{order.source_app}</Badge></td>
                        <td className="p-3">
                          <div className="text-sm font-medium">{order.customer_name}</div>
                          <div className="text-[10px] text-muted-foreground" dir="ltr">{order.customer_phone}</div>
                        </td>
                        <td className="p-3 text-xs">{order.target_branch_name}</td>
                        <td className="p-3">
                          <Badge className={`text-[10px] ${order.delivery_type === "delivery" ? "bg-orange-500/10 text-orange-600 border-orange-200" : "bg-blue-500/10 text-blue-600 border-blue-200"}`} variant="outline">
                            {order.delivery_type === "delivery" ? "توصيل" : "استلام"}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs">
                          {order.payment_method === "cash" ? "نقدي" : order.payment_method === "visa" ? "فيزا" : order.payment_method.replace("visa_", "فيزا ").replace(/_/g, " ")}
                        </td>
                        <td className="p-3 font-bold font-mono text-xs">{fmt(order.total)}</td>
                        <td className="p-3">
                          <Badge className={`text-[10px] ${order.status === "accepted" ? "bg-green-500/10 text-green-600" : order.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`} variant="outline">
                            {order.status === "accepted" ? "تم القبول" : order.status === "pending" ? "معلق" : order.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{order.dispatched_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {orders.length > 0 && (
                <div className="p-3 border-t border-border bg-muted/20 flex justify-between text-sm font-bold">
                  <span>المجموع: {totalOrders} طلب</span>
                  <span>{fmt(totalSales)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Apps Performance */}
        <TabsContent value="apps" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-bold mb-3">عدد الطلبات حسب المصدر</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={bySourceApp} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => [v, "طلب"]} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-bold mb-3">توزيع المبيعات حسب المصدر</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={bySourceApp} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {bySourceApp.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), "مبيعات"]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-3 text-right font-medium text-muted-foreground">الشركة</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">إجمالي المبيعات</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">متوسط الطلب</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">توصيل</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">استلام</th>
                  </tr>
                </thead>
                <tbody>
                  {bySourceApp.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="p-3 font-bold">{row.name}</td>
                      <td className="p-3">{row.count}</td>
                      <td className="p-3 font-mono font-bold">{fmt(row.total)}</td>
                      <td className="p-3 font-mono">{fmt(row.avg)}</td>
                      <td className="p-3">{row.delivery}</td>
                      <td className="p-3">{row.pickup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial */}
        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-bold mb-3">توزيع طرق الدفع</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={byPayment} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), "مبلغ"]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-bold mb-3">المبيعات حسب الفرع</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={byBranch}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [fmt(v), "مبيعات"]} />
                    <Bar dataKey="total" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-3 text-right font-medium text-muted-foreground">طريقة الدفع</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">إجمالي المبلغ</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {byPayment.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="p-3 font-bold flex items-center gap-2">
                        {row.name.includes("فيزا") ? <CreditCard className="h-4 w-4 text-purple-500" /> : <Banknote className="h-4 w-4 text-green-500" />}
                        {row.name}
                      </td>
                      <td className="p-3">{row.count}</td>
                      <td className="p-3 font-mono font-bold">{fmt(row.total)}</td>
                      <td className="p-3 text-muted-foreground">{totalSales > 0 ? ((row.total / totalSales) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
                {byPayment.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/20 font-bold">
                      <td className="p-3">المجموع</td>
                      <td className="p-3">{byPayment.reduce((s, r) => s + r.count, 0)}</td>
                      <td className="p-3 font-mono">{fmt(byPayment.reduce((s, r) => s + r.total, 0))}</td>
                      <td className="p-3">100%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff Performance */}
        <TabsContent value="staff">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-3 text-right font-medium text-muted-foreground">الموظف</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">إجمالي المبيعات</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">متوسط الطلب</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">الفروع</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : byStaff.sort((a, b) => b.count - a.count).map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3 font-bold flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {row.name.charAt(0)}
                        </div>
                        {row.name}
                      </td>
                      <td className="p-3">{row.count}</td>
                      <td className="p-3 font-mono font-bold">{fmt(row.total)}</td>
                      <td className="p-3 font-mono">{fmt(row.count > 0 ? row.total / row.count : 0)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{row.branches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallCenterReportsPage;
