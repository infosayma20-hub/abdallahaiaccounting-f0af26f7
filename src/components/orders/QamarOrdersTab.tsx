import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Eye, User, Phone, MapPin, Package, Truck, CreditCard,
  Banknote, Star, Clock, MessageCircle, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle, FileText, RefreshCw,
} from "lucide-react";

interface QamarOrder {
  id: string;
  reference_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_city: string | null;
  customer_address: string | null;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  source: string | null;
  source_key: string | null;
  payment_method: string | null;
  payment_status: string | null;
  amount_paid: number;
  customer_notes: string | null;
  production_notes: string | null;
  all_notes: string | null;
  agent_name: string | null;
  agent_id: string | null;
  priority: string | null;
  status: string | null;
  type: string | null;
  created_at: string;
}

interface QamarOrderItem {
  id: string;
  product_name: string;
  product_id: string | null;
  price: number;
  quantity: number;
  line_total: number;
  note: string | null;
  product_image: string | null;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  ready: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  shipped: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabels: Record<string, string> = {
  new: "جديد",
  processing: "قيد التجهيز",
  ready: "جاهز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  normal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  low: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
};

const priorityLabels: Record<string, string> = {
  urgent: "عاجل",
  high: "مرتفع",
  normal: "عادي",
  low: "منخفض",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل",
  credit: "آجل",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "غير مدفوع",
  partial: "مدفوع جزئياً",
  paid: "مدفوع",
};

const paymentStatusColors: Record<string, string> = {
  pending: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const PER_PAGE = 15;

const QamarOrdersTab = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<QamarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<QamarOrder | null>(null);
  const [orderItems, setOrderItems] = useState<QamarOrderItem[]>([]);
  const [page, setPage] = useState(1);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("qamar_orders" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) console.error("Qamar orders fetch error:", error);
    setOrders((data as any as QamarOrder[]) || []);
    setLoading(false);
  };

  const fetchItems = async (orderId: string) => {
    const { data } = await supabase
      .from("qamar_order_items" as any)
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setOrderItems((data as any as QamarOrderItem[]) || []);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        o.customer_name?.toLowerCase().includes(s) ||
        o.customer_phone?.includes(s) ||
        o.reference_number?.toLowerCase().includes(s) ||
        o.agent_name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const openDetail = (order: QamarOrder) => {
    setSelectedOrder(order);
    fetchItems(order.id);
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("ar-PS", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  // Stats
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + Number(o.amount_paid || 0), 0);
  const newCount = orders.filter(o => o.status === "new").length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">إجمالي الطلبيات</span>
            </div>
            <p className="text-lg font-bold text-foreground">{orders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">إجمالي المبيعات</span>
            </div>
            <p className="text-lg font-bold text-foreground">₪{totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">المحصّل</span>
            </div>
            <p className="text-lg font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">طلبيات جديدة</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{newCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم، الرقم، الموظف..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pr-9 text-sm"
            dir="rtl"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", "new", "processing", "shipped", "delivered", "cancelled"].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className="text-xs h-8"
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s === "all" ? "الكل" : statusLabels[s] || s}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-8" onClick={fetchOrders}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد طلبيات من قمر براند</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paged.map(order => (
            <Card
              key={order.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => openDetail(order)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  {/* Right side info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Row 1: name + ref */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{order.customer_name}</span>
                      {order.reference_number && (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {order.reference_number}
                        </span>
                      )}
                    </div>
                    {/* Row 2: phone + city */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {order.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span dir="ltr">{order.customer_phone}</span>
                        </span>
                      )}
                      {order.customer_city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {order.customer_city}
                        </span>
                      )}
                      {order.agent_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {order.agent_name}
                        </span>
                      )}
                    </div>
                    {/* Row 3: date + source */}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(order.created_at)}
                      {order.source && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {order.source}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Left side: total + badges */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="font-bold text-sm tabular-nums text-foreground">₪{Number(order.total).toLocaleString()}</span>
                    <div className="flex gap-1">
                      <Badge className={`text-[10px] px-1.5 py-0 h-5 ${statusColors[order.status || "new"]}`}>
                        {statusLabels[order.status || "new"] || order.status}
                      </Badge>
                      {order.priority && order.priority !== "normal" && (
                        <Badge className={`text-[10px] px-1.5 py-0 h-5 ${priorityColors[order.priority]}`}>
                          {priorityLabels[order.priority] || order.priority}
                        </Badge>
                      )}
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 ${paymentStatusColors[order.payment_status || "pending"]}`}>
                      {paymentStatusLabels[order.payment_status || "pending"] || order.payment_status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-xs text-muted-foreground">
                {Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)} من {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-2">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              تفاصيل طلبية قمر براند
              {selectedOrder?.reference_number && (
                <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {selectedOrder.reference_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <ScrollArea className="max-h-[calc(90vh-60px)]">
              <div className="p-4 space-y-4">
                {/* Customer info */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-bold text-foreground">{selectedOrder.customer_name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {selectedOrder.customer_phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span dir="ltr">{selectedOrder.customer_phone}</span>
                      </div>
                    )}
                    {selectedOrder.customer_city && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {selectedOrder.customer_city}
                      </div>
                    )}
                    {selectedOrder.customer_address && (
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Truck className="h-3 w-3" />
                        {selectedOrder.customer_address}
                      </div>
                    )}
                  </div>
                </div>

                {/* Agent + Source + Priority row */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {selectedOrder.agent_name && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <User className="h-3 w-3" />
                      👤 {selectedOrder.agent_name}
                    </Badge>
                  )}
                  {selectedOrder.source && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      📍 {selectedOrder.source}
                    </Badge>
                  )}
                  <Badge className={`text-xs ${priorityColors[selectedOrder.priority || "normal"]}`}>
                    ⚡ {priorityLabels[selectedOrder.priority || "normal"]}
                  </Badge>
                  <Badge className={`text-xs ${statusColors[selectedOrder.status || "new"]}`}>
                    {statusLabels[selectedOrder.status || "new"]}
                  </Badge>
                </div>

                {/* Items */}
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1">
                    <Package className="h-4 w-4" /> الأصناف
                  </h4>
                  <div className="space-y-2">
                    {orderItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">لا توجد أصناف</p>
                    ) : (
                      orderItems.map(item => (
                        <div key={item.id} className="flex gap-3 bg-background border border-border rounded-lg p-2.5">
                          {item.product_image && (
                            <img
                              src={item.product_image}
                              alt={item.product_name}
                              className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>الكمية: {item.quantity}</span>
                              <span>السعر: ₪{Number(item.price).toLocaleString()}</span>
                              <span className="font-bold text-foreground">₪{Number(item.line_total).toLocaleString()}</span>
                            </div>
                            {item.note && (
                              <p className="text-[10px] text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-0.5">
                                📝 {item.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Financial summary */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المجموع الفرعي</span>
                    <span className="tabular-nums">₪{Number(selectedOrder.subtotal).toLocaleString()}</span>
                  </div>
                  {Number(selectedOrder.discount) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>الخصم</span>
                      <span className="tabular-nums">-₪{Number(selectedOrder.discount).toLocaleString()}</span>
                    </div>
                  )}
                  {Number(selectedOrder.shipping_cost) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">الشحن</span>
                      <span className="tabular-nums">₪{Number(selectedOrder.shipping_cost).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-foreground border-t border-border pt-1.5">
                    <span>الإجمالي</span>
                    <span className="tabular-nums">₪{Number(selectedOrder.total).toLocaleString()}</span>
                  </div>
                </div>

                {/* Payment info */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" className="gap-1">
                    💳 {paymentMethodLabels[selectedOrder.payment_method || ""] || selectedOrder.payment_method || "غير محدد"}
                  </Badge>
                  <Badge className={paymentStatusColors[selectedOrder.payment_status || "pending"]}>
                    {paymentStatusLabels[selectedOrder.payment_status || "pending"]}
                  </Badge>
                  {Number(selectedOrder.amount_paid) > 0 && (
                    <Badge variant="outline" className="text-green-600">
                      المدفوع: ₪{Number(selectedOrder.amount_paid).toLocaleString()}
                    </Badge>
                  )}
                  {Number(selectedOrder.total) - Number(selectedOrder.amount_paid) > 0 && selectedOrder.payment_status !== "paid" && (
                    <Badge variant="outline" className="text-red-600">
                      المتبقي: ₪{(Number(selectedOrder.total) - Number(selectedOrder.amount_paid)).toLocaleString()}
                    </Badge>
                  )}
                </div>

                {/* Notes */}
                {selectedOrder.all_notes && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5">📝 الملاحظات</h4>
                    <div className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line leading-relaxed">
                      {selectedOrder.all_notes}
                    </div>
                  </div>
                )}

                {/* Individual notes if all_notes not present */}
                {!selectedOrder.all_notes && (selectedOrder.customer_notes || selectedOrder.production_notes) && (
                  <div className="space-y-2">
                    {selectedOrder.customer_notes && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">🛒 ملاحظات الزبون</h4>
                        <p className="text-xs text-blue-800 dark:text-blue-300">{selectedOrder.customer_notes}</p>
                      </div>
                    )}
                    {selectedOrder.production_notes && (
                      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <h4 className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">🏭 ملاحظات الإنتاج</h4>
                        <p className="text-xs text-purple-800 dark:text-purple-300">{selectedOrder.production_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* WhatsApp button */}
                {selectedOrder.customer_phone && (
                  <Button
                    className="w-full gap-2"
                    style={{ backgroundColor: "#25D366" }}
                    onClick={() => {
                      let digits = selectedOrder.customer_phone!.replace(/[^0-9]/g, "");
                      if (digits.startsWith("00972")) digits = digits.substring(2);
                      else if (digits.startsWith("0") && digits.length === 10) digits = "972" + digits.substring(1);
                      else if (digits.length === 9 && (digits.startsWith("5") || digits.startsWith("2"))) digits = "972" + digits;
                      window.open(`https://wa.me/${digits}`, "_blank");
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    تواصل واتساب
                  </Button>
                )}

                {/* Timestamp */}
                <p className="text-[10px] text-muted-foreground text-center">
                  تاريخ الإنشاء: {formatDate(selectedOrder.created_at)}
                </p>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QamarOrdersTab;
