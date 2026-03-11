import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronUp, Eye, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string;
  order_number: string | null;
  created_at: string;
  total: number;
  state: string;
  customer_name: string | null;
  is_return: boolean;
}

interface Props {
  dailySales: { date: string; orders: number; sales: number; returns: number; net: number }[];
  orders?: Order[];
  onRefetch?: () => void;
}

const CHART_GREEN = "#10B981";
const CHART_AMBER = "#F59E0B";
const CHART_RED = "#F43F5E";

const POSSalesReport = ({ dailySales, orders = [], onRefetch }: Props) => {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const totals = useMemo(() => ({
    orders: dailySales.reduce((s, d) => s + d.orders, 0),
    sales: dailySales.reduce((s, d) => s + d.sales, 0),
    returns: dailySales.reduce((s, d) => s + d.returns, 0),
    net: dailySales.reduce((s, d) => s + d.net, 0),
  }), [dailySales]);

  const chartData = useMemo(() =>
    dailySales.map(d => ({ ...d, label: format(new Date(d.date), "dd/MM", { locale: ar }) })), [dailySales]);

  // Group orders by date
  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    orders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = [];
      map[d].push(o);
    });
    return map;
  }, [orders]);

  const handleCancelOrder = async () => {
    if (!cancellingOrder || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      // Update order state to cancelled
      const { error: orderErr } = await supabase
        .from("pos_orders")
        .update({ state: "cancelled", cancel_reason: cancelReason.trim(), cancelled_at: new Date().toISOString() })
        .eq("id", cancellingOrder.id);

      if (orderErr) throw orderErr;
      toast.success(`✅ تم إلغاء الطلب ${cancellingOrder.order_number || ""}`);
      setCancellingOrder(null);
      setCancelReason("");
      onRefetch?.();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">حركة المبيعات</h3>
        </div>
        <div className="p-4">
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v.toLocaleString()}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--primary))", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                  formatter={(val: number, name: string) => [`₪${val.toLocaleString()}`, name === "sales" ? "المبيعات" : name === "returns" ? "المرتجعات" : "الصافي"]}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                />
                <Legend formatter={(val) => val === "sales" ? "المبيعات" : val === "returns" ? "المرتجعات" : "الصافي"} />
                <Line type="monotone" dataKey="sales" stroke={CHART_GREEN} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="returns" stroke={CHART_RED} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="net" stroke={CHART_AMBER} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">التفاصيل اليومية</h3>
          <span className="text-xs text-muted-foreground">{dailySales.length} يوم</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-secondary border-b border-border">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">التاريخ</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الطلبات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المبيعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المرتجعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الصافي</th>
              {orders.length > 0 && (
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">تفاصيل</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {dailySales.length === 0 && (
              <tr><td colSpan={orders.length > 0 ? 6 : 5} className="text-center text-muted-foreground py-12 text-sm">لا توجد بيانات للفترة المحددة</td></tr>
            )}
            {dailySales.map(d => {
              const dateOrders = ordersByDate[d.date] || [];
              const isExpanded = expandedDate === d.date;
              return (
                <>
                  <tr
                    key={d.date}
                    className={`hover:bg-secondary transition-colors ${orders.length > 0 ? "cursor-pointer" : ""}`}
                    onClick={() => orders.length > 0 && setExpandedDate(isExpanded ? null : d.date)}
                  >
                    <td className="px-4 py-3 text-right text-sm text-foreground">{format(new Date(d.date), "dd/MM/yyyy")}</td>
                    <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">{d.orders}</td>
                    <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-foreground">₪{d.sales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-left text-sm font-mono text-destructive">{d.returns > 0 ? `₪${d.returns.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-left text-sm font-mono font-bold text-foreground">₪{d.net.toLocaleString()}</td>
                    {orders.length > 0 && (
                      <td className="px-4 py-3 text-center">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground inline-block" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground inline-block" />
                        )}
                      </td>
                    )}
                  </tr>
                  {/* Expanded order rows */}
                  {isExpanded && dateOrders.length > 0 && (
                    <tr key={`${d.date}-details`}>
                      <td colSpan={orders.length > 0 ? 6 : 5} className="p-0">
                        <div className="bg-muted/30 border-y border-border">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground">رقم الطلب</th>
                                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground">الوقت</th>
                                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground">العميل</th>
                                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground">المبلغ</th>
                                <th className="text-center px-4 py-2 text-[11px] font-medium text-muted-foreground">الحالة</th>
                                <th className="text-center px-4 py-2 text-[11px] font-medium text-muted-foreground w-20">إجراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {dateOrders.map(order => (
                                <tr key={order.id} className="hover:bg-muted/40 transition-colors">
                                  <td className="px-4 py-2.5 text-right text-xs font-mono text-foreground">
                                    {order.order_number || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                                    {format(new Date(order.created_at), "hh:mm a")}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                                    {order.customer_name || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-left text-xs font-mono font-semibold text-foreground">
                                    ₪{order.total.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <Badge
                                      variant={order.state === "paid" ? "default" : order.state === "cancelled" ? "destructive" : "secondary"}
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {order.state === "paid" ? "مكتمل" : order.state === "cancelled" ? "ملغي" : order.state}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {order.state === "paid" && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setCancellingOrder(order); }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                                        title="إلغاء الطلب"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        إلغاء
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          {dailySales.length > 0 && (
            <tfoot>
              <tr className="bg-secondary border-t-2 border-border">
                <td className="px-4 py-3 text-right text-sm font-bold text-foreground">الإجمالي</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-foreground font-mono">{totals.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-foreground font-mono">₪{totals.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-destructive font-mono">{totals.returns > 0 ? `₪${totals.returns.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-foreground font-mono">₪{totals.net.toLocaleString()}</td>
                {orders.length > 0 && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancellingOrder} onOpenChange={(open) => !open && setCancellingOrder(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              إلغاء طلب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              سيتم إلغاء الطلب <strong className="text-foreground">{cancellingOrder?.order_number}</strong> بمبلغ <strong className="text-foreground">₪{cancellingOrder?.total.toLocaleString()}</strong> وإلغاء القيود المحاسبية المرتبطة واسترجاع المخزون.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">سبب الإلغاء *</Label>
              <Input
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="مثال: خطأ في الطلب، إلغاء العميل..."
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCancellingOrder(null); setCancelReason(""); }}>تراجع</Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={!cancelReason.trim() || cancelling}
            >
              {cancelling ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSSalesReport;
