import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Truck, X, Receipt, Package, Wallet, Trash2, XCircle } from "lucide-react";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { useToast } from "@/hooks/use-toast";
import { supabase as sb } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ============================================================================
// TODO (post-demo): Replace warehouse_id + 'REP-%' inference with explicit
// invoices.sales_rep_id linkage. See RepNewOrderPage.tsx for full migration plan.
// Current heuristic groups orders by the rep whose default_warehouse_id matches
// the invoice warehouse — incorrect when multiple reps share one warehouse.
// ============================================================================

interface OrderRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  status: string;
  contact_name: string;
  rep_id: string | null;
  rep_name: string;
  warehouse_name: string;
  cash_box_name: string;
}

interface OrderDetail {
  order: any;
  items: { id: string; product_name: string; quantity: number; unit_price: number; total_amount: number }[];
  stockImpact: { product_id: string; quantity: number; type: string; warehouse_id: string }[];
  cashImpact: { id: string; amount: number; debit: string; credit: string; description: string; date: string }[];
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);

const STATUS_LABELS: Record<string, string> = {
  posted: "مرحّل",
  draft: "مسودة",
  cancelled: "ملغي",
  paid: "مدفوع",
};

export default function SalesRepOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ count: 0, total: 0, cash: 0, credit: 0 });

  // Filters
  const [repId, setRepId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  // Detail modal
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("malaki-data", {
        body: {
          action: "sales_rep_orders",
          repId: repId || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          paymentMethod: paymentMethod || null,
          status: status || null,
        },
      });
      if (error) throw error;
      setOrders(data?.orders || []);
      setReps(data?.reps || []);
      setTotals(data?.totals || { count: 0, total: 0, cash: 0, credit: 0 });
    } catch (e) {
      console.error("[SalesRepOrders] load error:", e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [repId, dateFrom, dateTo, paymentMethod, status]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("malaki-data", {
        body: { action: "sales_rep_order_detail", invoiceId: id },
      });
      if (error) throw error;
      setDetail(data);
    } catch (e) {
      console.error("[SalesRepOrders] detail error:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const clearFilters = () => {
    setRepId(""); setDateFrom(""); setDateTo(""); setPaymentMethod(""); setStatus("");
  };

  const hasFilters = useMemo(
    () => Boolean(repId || dateFrom || dateTo || paymentMethod || status),
    [repId, dateFrom, dateTo, paymentMethod, status]
  );

  const isDraftStatus = (s?: string) =>
    ["draft", "pending", "مسودة"].includes((s || "").toLowerCase());
  const isCancelledStatus = (s?: string) =>
    ["cancelled", "void", "ملغي", "ملغى"].includes((s || "").toLowerCase());

  const deleteDraft = async (id: string) => {
    if (!confirm("حذف المسودة نهائياً؟")) return;
    setActionBusy(true);
    try {
      const { data: inv } = await (sb as any)
        .from("invoices").select("linked_transaction_id").eq("id", id).maybeSingle();
      if (inv?.linked_transaction_id) {
        toast({ title: "لا يمكن الحذف", description: "الطلب مرحّل. استخدم إلغاء الطلب.", variant: "destructive" });
        return;
      }
      await (sb as any).from("invoice_items").delete().eq("invoice_id", id);
      const { error } = await (sb as any).from("invoices").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "تم حذف المسودة" });
      setDetail(null);
      await load();
    } catch (e: any) {
      toast({ title: "فشل الحذف", description: e.message, variant: "destructive" });
    } finally { setActionBusy(false); }
  };

  const cancelOrder = async (id: string) => {
    const reason = prompt("سبب إلغاء الطلب (إلزامي):");
    if (!reason || reason.trim().length < 3) {
      toast({ title: "السبب مطلوب (3 حروف على الأقل)", variant: "destructive" });
      return;
    }
    setActionBusy(true);
    try {
      const { data, error } = await (sb as any).rpc("void_rep_sale_atomic", {
        p_invoice_id: id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الإلغاء");
      toast({ title: "تم إلغاء الطلب", description: `قيد عكسي: ${String(data.reverse_transaction_id || "").slice(0,8)}…` });
      setDetail(null);
      await load();
    } catch (e: any) {
      toast({ title: "فشل الإلغاء", description: e.message, variant: "destructive" });
    } finally { setActionBusy(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <Truck className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">طلبيات المندوبين</h1>
            <p className="text-xs text-muted-foreground">متابعة طلبات البيع الميداني للمندوبين</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">عدد الطلبات</div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{totals.count}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي المبيعات</div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{fmt(totals.total)} ₪</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">نقدي</div>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(totals.cash)} ₪</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">آجل</div>
          <div className="text-2xl font-bold text-amber-600 tabular-nums">{fmt(totals.credit)} ₪</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">المندوب</span>
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border border-border/50 bg-card text-foreground outline-none focus:border-primary/50"
            >
              <option value="">الكل</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            compact
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">نوع الدفع</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border border-border/50 bg-card text-foreground outline-none focus:border-primary/50"
            >
              <option value="">الكل</option>
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">الحالة</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border border-border/50 bg-card text-foreground outline-none focus:border-primary/50"
            >
              <option value="">الكل</option>
              <option value="posted">مرحّل</option>
              <option value="draft">مسودة</option>
              <option value="paid">مدفوع</option>
              <option value="cancelled">ملغي</option>
            </select>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="w-3 h-3 ml-1" /> مسح الفلاتر
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الطلبات ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              لا توجد طلبيات مطابقة للفلاتر
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الطلب</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المندوب</TableHead>
                  <TableHead>الزبون</TableHead>
                  <TableHead>نوع الدفع</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>الصندوق</TableHead>
                  <TableHead>المستودع</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow
                    key={o.id}
                    onClick={() => openDetail(o.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell><span className="font-mono text-xs">{o.invoice_number}</span></TableCell>
                    <TableCell className="text-xs">
                      {new Date(o.created_at).toLocaleString("ar-EG", {
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{o.rep_name}</TableCell>
                    <TableCell className="text-xs">{o.contact_name}</TableCell>
                    <TableCell>
                      <Badge variant={o.payment_method === "cash" ? "default" : "secondary"} className="text-[10px]">
                        {o.payment_method === "cash" ? "نقدي" : "آجل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">{fmt(o.total_amount)} ₪</TableCell>
                    <TableCell className="text-xs">{o.cash_box_name}</TableCell>
                    <TableCell className="text-xs">{o.warehouse_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABELS[o.status] || o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <div
          onClick={() => { setDetail(null); }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          dir="rtl"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl border border-border max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">
                  {detail?.order?.invoice_number || "تفاصيل الطلب"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {detail?.order && !isCancelledStatus(detail.order.status) && (
                  isDraftStatus(detail.order.status) ? (
                    <Button variant="outline" size="sm" disabled={actionBusy}
                      onClick={() => deleteDraft(detail.order.id)}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10">
                      {actionBusy ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
                      حذف
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={actionBusy}
                      onClick={() => cancelOrder(detail.order.id)}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10">
                      {actionBusy ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <XCircle className="w-4 h-4 ml-1" />}
                      إلغاء الطلب
                    </Button>
                  )
                )}
                <Button variant="ghost" size="icon" onClick={() => setDetail(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {detailLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="p-4 space-y-5">
                {/* Order header */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">التاريخ</div>
                    <div className="font-medium">
                      {new Date(detail.order.created_at).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">الزبون</div>
                    <div className="font-medium">{detail.order.contact_name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">نوع الدفع</div>
                    <div className="font-medium">
                      {detail.order.payment_method === "cash" ? "نقدي" : "آجل"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">المستودع</div>
                    <div className="font-medium">{detail.order.warehouse_name}</div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" /> البنود
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead>الكمية</TableHead>
                        <TableHead>السعر</TableHead>
                        <TableHead>الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="text-xs">{it.product_name}</TableCell>
                          <TableCell className="tabular-nums">{fmt(it.quantity)}</TableCell>
                          <TableCell className="tabular-nums">{fmt(it.unit_price)}</TableCell>
                          <TableCell className="font-bold tabular-nums">{fmt(it.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-2 flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-bold">إجمالي الطلب</span>
                    <span className="text-lg font-bold tabular-nums">
                      {fmt(detail.order.total_amount)} ₪
                    </span>
                  </div>
                </div>

                {/* Stock impact */}
                <div>
                  <div className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" /> تأثير المخزون
                  </div>
                  {detail.stockImpact.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                      لم يتم تسجيل حركة مخزون لهذا الطلب
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {detail.stockImpact.map((m, i) => {
                        const item = detail.items.find((it: any) => it.product_id === m.product_id);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                            <span>{item?.product_name || m.product_id}</span>
                            <span className="font-mono">{m.type === "out" ? "−" : "+"}{fmt(Math.abs(m.quantity))}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cash impact */}
                {detail.order.payment_method === "cash" && (
                  <div>
                    <div className="text-sm font-bold mb-2 flex items-center gap-2">
                      <Wallet className="w-4 h-4" /> تأثير الصندوق
                    </div>
                    {detail.cashImpact.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                        لم يتم العثور على قيد محاسبي مرتبط بهذا الطلب
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {detail.cashImpact.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-xs p-2 bg-emerald-500/5 rounded">
                            <div>
                              <div className="font-medium">{t.description}</div>
                              <div className="text-muted-foreground text-[10px]">
                                مدين: {t.debit} • دائن: {t.credit}
                              </div>
                            </div>
                            <span className="font-bold tabular-nums text-emerald-600">+{fmt(t.amount)} ₪</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}