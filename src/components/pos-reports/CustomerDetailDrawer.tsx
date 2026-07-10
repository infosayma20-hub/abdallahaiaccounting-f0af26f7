import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, MapPin, ShoppingBag, TrendingUp, Calendar, Loader2, Eye } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  customer: {
    name: string | null;
    phone: string | null;
    posCustomerId?: string | null;
    address?: string | null;
    totalVisits?: number;
    totalSpent?: number;
  } | null;
}

interface OrderRow {
  id: string;
  source: "pos" | "callcenter";
  number: string;
  created_at: string;
  total: number;
  status?: string | null;
  note?: string | null;
  items?: any[];
}

const normalizePhone = (p?: string | null) =>
  (p || "").replace(/\D/g, "").replace(/^0+/, "");

const CustomerDetailDrawer = ({ open, onOpenChange, dataOwnerId, customer }: Props) => {
  const [loading, setLoading] = useState(false);
  const [posOrders, setPosOrders] = useState<OrderRow[]>([]);
  const [ccOrders, setCcOrders] = useState<OrderRow[]>([]);
  const [lineItems, setLineItems] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [orderDetail, setOrderDetail] = useState<{ lines: any[]; payments: any[] } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (!selectedOrder) { setOrderDetail(null); return; }
    let cancelled = false;
    (async () => {
      setOrderLoading(true);
      setOrderDetail(null);
      try {
        if (selectedOrder.source === "pos") {
          const [linesRes, paysRes] = await Promise.all([
            supabase.from("pos_order_lines").select("product_name, qty, unit_price, total, note").eq("order_id", selectedOrder.id),
            supabase.from("pos_payments").select("payment_method, amount").eq("order_id", selectedOrder.id),
          ]);
          if (!cancelled) setOrderDetail({ lines: (linesRes.data as any[]) || [], payments: (paysRes.data as any[]) || [] });
        } else {
          if (!cancelled) setOrderDetail({ lines: selectedOrder.items || [], payments: [] });
        }
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOrder]);

  useEffect(() => {
    if (!open || !customer || !dataOwnerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPosOrders([]);
      setCcOrders([]);
      setLineItems([]);
      try {
        const phoneNorm = normalizePhone(customer.phone);
        const name = (customer.name || "").trim();

        // 1) POS orders — link by pos_customer_id, customer_name, or guest_name
        const posFilters: string[] = [];
        if (customer.posCustomerId) posFilters.push(`pos_customer_id.eq.${customer.posCustomerId}`);
        if (name) {
          const safe = name.replace(/[,()]/g, " ");
          posFilters.push(`customer_name.ilike.%${safe}%`);
          posFilters.push(`guest_name.ilike.%${safe}%`);
        }
        let posQuery: any = supabase
          .from("pos_orders")
          .select("id, order_number, created_at, total, state, order_note, customer_name, guest_name, pos_customer_id")
          .eq("user_id", dataOwnerId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (posFilters.length > 0) posQuery = posQuery.or(posFilters.join(","));
        else posQuery = posQuery.eq("id", "00000000-0000-0000-0000-000000000000");

        // 2) Call-center orders — link by phone or name
        const ccFilters: string[] = [];
        if (phoneNorm) ccFilters.push(`customer_phone.ilike.%${phoneNorm}%`);
        if (name) ccFilters.push(`customer_name.ilike.%${name.replace(/[,()]/g, " ")}%`);
        let ccQuery: any = supabase
          .from("call_center_orders" as any)
          .select("id, created_at, total, status, customer_name, customer_phone, items, order_note")
          .eq("user_id", dataOwnerId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (ccFilters.length > 0) ccQuery = ccQuery.or(ccFilters.join(","));
        else ccQuery = ccQuery.eq("id", "00000000-0000-0000-0000-000000000000");

        const [posRes, ccRes] = await Promise.all([posQuery, ccQuery]);
        if (cancelled) return;

        const posList: OrderRow[] = ((posRes.data as any[]) || []).map((o) => ({
          id: o.id,
          source: "pos" as const,
          number: o.order_number || o.id.slice(0, 8),
          created_at: o.created_at,
          total: Number(o.total) || 0,
          status: o.state,
          note: o.order_note,
        }));
        const ccList: OrderRow[] = ((ccRes.data as any[]) || []).map((o) => ({
          id: o.id,
          source: "callcenter" as const,
          number: o.id.slice(0, 8),
          created_at: o.created_at,
          total: Number(o.total) || 0,
          status: o.status,
          note: o.order_note,
          items: Array.isArray(o.items) ? o.items : [],
        }));
        setPosOrders(posList);
        setCcOrders(ccList);

        // 3) Top items from pos_order_lines for the matched POS orders
        const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
        if (posList.length > 0) {
          const ids = posList.map((o) => o.id);
          const { data: lines } = await supabase
            .from("pos_order_lines")
            .select("product_name, qty, total, order_id")
            .in("order_id", ids);
          ((lines as any[]) || []).forEach((l) => {
            const k = (l.product_name || "غير معروف").trim();
            const prev = itemMap.get(k) || { name: k, qty: 0, revenue: 0 };
            prev.qty += Number(l.qty) || 0;
            prev.revenue += Number(l.total) || 0;
            itemMap.set(k, prev);
          });
        }
        // Also aggregate from call-center items JSON
        ccList.forEach((o) => {
          (o.items || []).forEach((it: any) => {
            const k = (it?.name || "غير معروف").toString().trim();
            const q = Number(it?.qty) || 0;
            const up = Number(it?.unit_price) || 0;
            const t = Number(it?.total);
            const rev = Number.isFinite(t) && t > 0 ? t : up * q;
            const prev = itemMap.get(k) || { name: k, qty: 0, revenue: 0 };
            prev.qty += q;
            prev.revenue += rev;
            itemMap.set(k, prev);
          });
        });
        const items = Array.from(itemMap.values())
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 10);
        setLineItems(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, customer, dataOwnerId]);

  const totals = useMemo(() => {
    const all = [...posOrders, ...ccOrders];
    const orders = all.length;
    const revenue = all.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const avg = orders > 0 ? revenue / orders : 0;
    return { orders, revenue, avg };
  }, [posOrders, ccOrders]);

  const allOrders = useMemo(
    () =>
      [...posOrders, ...ccOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [posOrders, ccOrders],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle className="text-right">
            تفاصيل الزبون — {customer?.name || "بدون اسم"}
          </SheetTitle>
        </SheetHeader>

        {/* Basic info */}
        <div className="mt-4 bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono" dir="ltr">{customer?.phone || "—"}</span>
          </div>
          {customer?.address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <span>{customer.address}</span>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kpi icon={ShoppingBag} label="عدد الطلبات" value={totals.orders.toString()} />
          <Kpi icon={TrendingUp} label="إجمالي المشتريات" value={`₪${totals.revenue.toLocaleString()}`} />
          <Kpi icon={Calendar} label="متوسط الطلب" value={`₪${Math.round(totals.avg).toLocaleString()}`} />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
          </div>
        )}

        {/* Top items */}
        {!loading && lineItems.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">الأصناف الأكثر طلباً</h3>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary">
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">الصنف</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">الكمية</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">الإيراد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary">
                  {lineItems.map((it, i) => (
                    <tr key={i} className="hover:bg-secondary/50">
                      <td className="px-3 py-2 text-right">{it.name}</td>
                      <td className="px-3 py-2 text-center font-mono">{it.qty}</td>
                      <td className="px-3 py-2 text-left font-mono">₪{it.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* All orders */}
        {!loading && (
          <div className="mt-4 pb-8">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              كل الطلبات ({allOrders.length})
            </h3>
            {allOrders.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">لا توجد طلبات مسجلة</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">رقم</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">المصدر</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">التاريخ</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">الحالة</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {allOrders.map((o) => (
                      <tr
                        key={`${o.source}-${o.id}`}
                        onClick={() => setSelectedOrder(o)}
                        className="hover:bg-secondary/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          <span className="inline-flex items-center gap-1.5 text-primary hover:underline">
                            <Eye className="w-3 h-3" />
                            {o.number}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {o.source === "pos" ? (
                            <span className="text-emerald-600">كاشير</span>
                          ) : (
                            <span className="text-blue-600">كول سنتر</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("en-GB")}{" "}
                          {new Date(o.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">{o.status || "—"}</td>
                        <td className="px-3 py-2 text-left font-mono font-semibold">₪{(Number(o.total) || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-right">تفاصيل الطلب — {selectedOrder?.number}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {new Date(selectedOrder.created_at).toLocaleDateString("en-GB")}{" "}
                    {new Date(selectedOrder.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>المصدر: {selectedOrder.source === "pos" ? "كاشير" : "كول سنتر"}</span>
                  {selectedOrder.status && <span>الحالة: {selectedOrder.status}</span>}
                </div>
                {selectedOrder.note && (
                  <div className="rounded-md bg-secondary/50 px-3 py-2 text-xs">{selectedOrder.note}</div>
                )}
                {orderLoading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
                  </div>
                ) : (
                  <>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary">
                          <tr>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">الصنف</th>
                            <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">الكمية</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">السعر</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary">
                          {(orderDetail?.lines || []).length === 0 ? (
                            <tr><td colSpan={4} className="text-center text-muted-foreground py-4 text-xs">لا توجد أصناف</td></tr>
                          ) : (
                            (orderDetail?.lines || []).map((l: any, i: number) => {
                              const name = l.product_name || l.name || "—";
                              const qty = Number(l.qty) || 0;
                              const up = Number(l.unit_price) || 0;
                              const total = Number(l.total) || qty * up;
                              return (
                                <tr key={i}>
                                  <td className="px-3 py-2 text-right">
                                    {name}
                                    {l.note ? <div className="text-[10px] text-muted-foreground">{l.note}</div> : null}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono">{qty}</td>
                                  <td className="px-3 py-2 text-left font-mono text-xs">₪{up.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-left font-mono font-semibold">₪{total.toLocaleString()}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot className="bg-secondary/50">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold">الإجمالي</td>
                            <td className="px-3 py-2 text-left font-mono font-bold">₪{(Number(selectedOrder.total) || 0).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {(orderDetail?.payments?.length || 0) > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold mb-1">طرق الدفع</div>
                        <div className="flex flex-wrap gap-2">
                          {orderDetail!.payments.map((p: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
                              <span>{p.payment_method}</span>
                              <span className="font-mono">₪{(Number(p.amount) || 0).toLocaleString()}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
};

const Kpi = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="bg-card border border-border rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
      <Icon className="w-3 h-3" />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </div>
    <div className="text-base font-semibold text-foreground font-mono tabular-nums">{value}</div>
  </div>
);

export default CustomerDetailDrawer;