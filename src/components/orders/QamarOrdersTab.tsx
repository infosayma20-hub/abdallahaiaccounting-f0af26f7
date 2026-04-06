import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Eye, User, Phone, MapPin, Package, Truck, CreditCard,
  Banknote, Star, Clock, MessageCircle, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle, FileText, RefreshCw, Plus, Settings,
  Trash2, X, Palette,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────
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
  linked_invoice_id: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
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

interface OrderStatus {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  effect: string;
  is_default: boolean;
}

// ─── Owner check ───────────────────────────────────────
const QAMAR_OWNER_ID = "ccdbcaa5-a585-4d84-a559-a4fc94a6075b";

const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي", كاش: "نقدي", card: "بطاقة", transfer: "تحويل", credit: "آجل", نقدي: "نقدي", آجل: "آجل",
};
const paymentStatusLabels: Record<string, string> = {
  pending: "غير مدفوع", partial: "مدفوع جزئياً", paid: "مدفوع",
  "غير مدفوع": "غير مدفوع", "مدفوع جزئياً": "مدفوع جزئياً", "مدفوع": "مدفوع",
};
const paymentStatusColors: Record<string, string> = {
  pending: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "غير مدفوع": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "مدفوع جزئياً": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "مدفوع": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const PER_PAGE = 15;
const STATUS_COLORS = ["#3B82F6","#8B5CF6","#F59E0B","#6366F1","#A855F7","#22C55E","#EAB308","#F97316","#10B981","#EF4444","#EC4899","#14B8A6"];

const QamarOrdersTab = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<QamarOrder[]>([]);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<QamarOrder | null>(null);
  const [orderItems, setOrderItems] = useState<QamarOrderItem[]>([]);
  const [page, setPage] = useState(1);

  // Dialogs
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showStatusSettings, setShowStatusSettings] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#3B82F6");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<"cash"|"credit"|"partial">("credit");
  const [depositAmount, setDepositAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Check if user is the Qamar owner (or team member)
  const isQamarUser = user?.id === QAMAR_OWNER_ID;

  const dataOwnerId = user?.id || "";

  const fetchStatuses = useCallback(async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("qamar_order_statuses" as any)
      .select("*")
      .eq("user_id", QAMAR_OWNER_ID)
      .order("sort_order", { ascending: true });
    setStatuses((data as any as OrderStatus[]) || []);
  }, [dataOwnerId]);

  const fetchOrders = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("qamar_orders" as any)
      .select("*")
      .eq("user_id", QAMAR_OWNER_ID)
      .order("created_at", { ascending: false });
    if (error) console.error("Qamar orders fetch:", error);
    setOrders((data as any as QamarOrder[]) || []);
    setLoading(false);
  }, [dataOwnerId]);

  const fetchItems = async (orderId: string) => {
    const { data } = await supabase
      .from("qamar_order_items" as any)
      .select("*")
      .eq("order_id", orderId);
    setOrderItems((data as any as QamarOrderItem[]) || []);
  };

  useEffect(() => {
    fetchOrders();
    fetchStatuses();
  }, [fetchOrders, fetchStatuses]);

  // ─── Status helpers ──────────────────────────────────
  const getStatusObj = (name: string | null) => statuses.find(s => s.name === name);
  const getStatusColor = (name: string | null) => getStatusObj(name)?.color || "#6B7280";
  const getStatusEffect = (name: string | null) => getStatusObj(name)?.effect || "none";

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from("qamar_orders" as any)
      .update({ status: newStatus } as any)
      .eq("id", orderId);
    if (error) { toast.error("خطأ في تحديث الحالة"); return; }
    toast.success(`تم تحديث الحالة: ${newStatus}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
  };

  // ─── Add new status ──────────────────────────────────
  const addStatus = async () => {
    if (!newStatusName.trim()) return;
    const { error } = await supabase
      .from("qamar_order_statuses" as any)
      .insert({
        user_id: QAMAR_OWNER_ID,
        name: newStatusName.trim(),
        color: newStatusColor,
        sort_order: statuses.length + 1,
        effect: "none",
      } as any);
    if (error) { toast.error("خطأ: " + error.message); return; }
    toast.success("تم إضافة الحالة");
    setNewStatusName("");
    fetchStatuses();
  };

  const deleteStatus = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الحالة؟")) return;
    await supabase.from("qamar_order_statuses" as any).delete().eq("id", id);
    fetchStatuses();
  };

  // ─── Invoice creation ────────────────────────────────
  const handleCreateInvoice = async () => {
    if (!selectedOrder || !user) return;
    setSaving(true);
    try {
      const pmMap: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
      const paidAmount = invoicePaymentMethod === "cash" ? Number(selectedOrder.total) : invoicePaymentMethod === "partial" ? depositAmount : 0;
      const remainingAmount = Number(selectedOrder.total) - paidAmount;

      const { data: inv, error: invErr } = await supabase.from("invoices").insert({
        user_id: QAMAR_OWNER_ID,
        invoice_type: "sale",
        contact_name: selectedOrder.customer_name,
        invoice_date: new Date().toISOString().split("T")[0],
        subtotal: Number(selectedOrder.total),
        discount_amount: 0,
        tax_amount: 0,
        total_amount: Number(selectedOrder.total),
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        payment_status: paidAmount >= Number(selectedOrder.total) ? "مدفوع" : paidAmount > 0 ? "مدفوع جزئياً" : "غير مدفوع",
        payment_method: pmMap[invoicePaymentMethod] || "آجل",
        status: "posted",
        source: "qamar_brand",
        notes: `من طلبية ${selectedOrder.reference_number || ""}`,
        currency: "ILS",
      } as any).select().single();

      if (invErr) throw invErr;

      // Journal entries
      const txDate = new Date().toISOString().split("T")[0];
      const txEntries: any[] = [];

      if (invoicePaymentMethod === "cash") {
        txEntries.push({
          user_id: QAMAR_OWNER_ID, transaction_date: txDate,
          description: `فاتورة مبيعات - ${selectedOrder.customer_name} (${selectedOrder.reference_number || ""})`,
          debit_account_code: "1110", credit_account_code: "4100",
          amount: Number(selectedOrder.total), currency: "شيكل",
          transaction_type: "sale_cash", reference: inv.invoice_number,
          payment_method: "نقدي", idempotency_key: `INV-${inv.id}`,
        });
      } else if (invoicePaymentMethod === "credit") {
        txEntries.push({
          user_id: QAMAR_OWNER_ID, transaction_date: txDate,
          description: `فاتورة مبيعات آجل - ${selectedOrder.customer_name} (${selectedOrder.reference_number || ""})`,
          debit_account_code: "1130", credit_account_code: "4100",
          amount: Number(selectedOrder.total), currency: "شيكل",
          transaction_type: "sale_credit", reference: inv.invoice_number,
          payment_method: "آجل", idempotency_key: `INV-${inv.id}`,
        });
      } else {
        if (depositAmount > 0) {
          txEntries.push({
            user_id: QAMAR_OWNER_ID, transaction_date: txDate,
            description: `عربون فاتورة - ${selectedOrder.customer_name} (${selectedOrder.reference_number || ""})`,
            debit_account_code: "1110", credit_account_code: "4100",
            amount: depositAmount, currency: "شيكل",
            transaction_type: "sale_cash", reference: inv.invoice_number,
            payment_method: "نقدي", idempotency_key: `INV-DEP-${inv.id}`,
          });
        }
        if (remainingAmount > 0) {
          txEntries.push({
            user_id: QAMAR_OWNER_ID, transaction_date: txDate,
            description: `ذمة فاتورة - ${selectedOrder.customer_name} (${selectedOrder.reference_number || ""})`,
            debit_account_code: "1130", credit_account_code: "4100",
            amount: remainingAmount, currency: "شيكل",
            transaction_type: "sale_credit", reference: inv.invoice_number,
            payment_method: "آجل", idempotency_key: `INV-REM-${inv.id}`,
          });
        }
      }

      let linkedTxId: string | null = null;
      for (const tx of txEntries) {
        const { data: txData } = await supabase.from("transactions").insert(tx).select("id").single();
        if (txData && !linkedTxId) linkedTxId = txData.id;
      }
      if (linkedTxId) {
        await supabase.from("invoices").update({ linked_transaction_id: linkedTxId } as any).eq("id", inv.id);
      }

      // Update qamar order
      const newPaymentStatus = paidAmount >= Number(selectedOrder.total) ? "paid" : paidAmount > 0 ? "partial" : "pending";
      await supabase.from("qamar_orders" as any).update({
        status: "مفوتر",
        linked_invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        invoiced_at: new Date().toISOString(),
        amount_paid: paidAmount,
        payment_status: newPaymentStatus,
      } as any).eq("id", selectedOrder.id);

      toast.success(`تم إنشاء الفاتورة ${inv.invoice_number} ✅`);
      setShowInvoiceModal(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtering & Pagination ──────────────────────────
  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.customer_name?.toLowerCase().includes(s) || o.customer_phone?.includes(s) || o.reference_number?.toLowerCase().includes(s) || o.agent_name?.toLowerCase().includes(s);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const openDetail = (order: QamarOrder) => {
    setSelectedOrder(order);
    fetchItems(order.id);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ar-PS", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // Stats
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + Number(o.amount_paid || 0), 0);
  const newCount = orders.filter(o => o.status === "جديد" || o.status === "new").length;

  // If not the Qamar user, show nothing (access control)
  if (!isQamarUser) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">إجمالي الطلبيات</span></div>
          <p className="text-lg font-bold text-foreground">{orders.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Banknote className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">إجمالي المبيعات</span></div>
          <p className="text-lg font-bold text-foreground">₪{totalRevenue.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">المحصّل</span></div>
          <p className="text-lg font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-xs text-muted-foreground">طلبيات جديدة</span></div>
          <p className="text-lg font-bold text-amber-600">{newCount}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم، الرقم، الموظف..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 text-sm" dir="rtl" />
        </div>
        <ScrollArea className="max-w-[600px]">
          <div className="flex gap-1 pb-1">
            <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} className="text-xs h-7 px-2 flex-shrink-0" onClick={() => { setStatusFilter("all"); setPage(1); }}>الكل</Button>
            {statuses.map(s => (
              <Button key={s.id} size="sm" variant={statusFilter === s.name ? "default" : "outline"} className="text-xs h-7 px-2 flex-shrink-0 gap-1" onClick={() => { setStatusFilter(s.name); setPage(1); }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
              </Button>
            ))}
          </div>
        </ScrollArea>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowStatusSettings(true)} title="إدارة الحالات">
          <Settings className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={fetchOrders}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد طلبيات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paged.map(order => (
            <Card key={order.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => openDetail(order)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{order.customer_name}</span>
                      {order.reference_number && <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{order.reference_number}</span>}
                      {order.invoice_number && <span className="text-[10px] font-mono text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">🧾 {order.invoice_number}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {order.customer_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /><span dir="ltr">{order.customer_phone}</span></span>}
                      {order.customer_city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{order.customer_city}</span>}
                      {order.agent_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{order.agent_name}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(order.created_at)}
                      {order.source && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{order.source}</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="font-bold text-sm tabular-nums text-foreground">₪{Number(order.total).toLocaleString()}</span>
                    <Badge className="text-[10px] px-1.5 py-0 h-5 text-white" style={{ backgroundColor: getStatusColor(order.status) }}>
                      {order.status || "جديد"}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 ${paymentStatusColors[order.payment_status || "pending"]}`}>
                      {paymentStatusLabels[order.payment_status || "pending"] || order.payment_status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-xs text-muted-foreground">{Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)} من {filtered.length}</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <span className="text-xs px-2">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ Detail Dialog ═══════ */}
      <Dialog open={!!selectedOrder && !showInvoiceModal} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              تفاصيل طلبية قمر براند
              {selectedOrder?.reference_number && <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{selectedOrder.reference_number}</span>}
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
                    {selectedOrder.customer_phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /><span dir="ltr">{selectedOrder.customer_phone}</span></div>}
                    {selectedOrder.customer_city && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{selectedOrder.customer_city}</div>}
                    {selectedOrder.customer_address && <div className="flex items-center gap-1.5 col-span-2"><Truck className="h-3 w-3" />{selectedOrder.customer_address}</div>}
                  </div>
                </div>

                {/* Status selector + badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedOrder.status || "جديد"} onValueChange={(v) => updateOrderStatus(selectedOrder.id, v)}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => (
                        <SelectItem key={s.id} value={s.name}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedOrder.agent_name && <Badge variant="outline" className="gap-1 text-xs"><User className="h-3 w-3" /> {selectedOrder.agent_name}</Badge>}
                  {selectedOrder.source && <Badge variant="outline" className="text-xs">📍 {selectedOrder.source}</Badge>}
                  {selectedOrder.priority && selectedOrder.priority !== "normal" && (
                    <Badge variant="outline" className="text-xs text-amber-600">⚡ {selectedOrder.priority}</Badge>
                  )}
                </div>

                {/* Items */}
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1"><Package className="h-4 w-4" /> الأصناف</h4>
                  <div className="space-y-2">
                    {orderItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">لا توجد أصناف</p>
                    ) : orderItems.map(item => (
                      <div key={item.id} className="flex gap-3 bg-background border border-border rounded-lg p-2.5">
                        {item.product_image && <img src={item.product_image} alt={item.product_name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span>الكمية: {item.quantity}</span>
                            <span>السعر: ₪{Number(item.price).toLocaleString()}</span>
                            <span className="font-bold text-foreground">₪{Number(item.line_total).toLocaleString()}</span>
                          </div>
                          {item.note && <p className="text-[10px] text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-0.5">📝 {item.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial summary */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span className="tabular-nums">₪{Number(selectedOrder.subtotal).toLocaleString()}</span></div>
                  {Number(selectedOrder.discount) > 0 && <div className="flex justify-between text-red-600"><span>الخصم</span><span className="tabular-nums">-₪{Number(selectedOrder.discount).toLocaleString()}</span></div>}
                  {Number(selectedOrder.shipping_cost) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span className="tabular-nums">₪{Number(selectedOrder.shipping_cost).toLocaleString()}</span></div>}
                  <div className="flex justify-between font-bold text-foreground border-t border-border pt-1.5"><span>الإجمالي</span><span className="tabular-nums">₪{Number(selectedOrder.total).toLocaleString()}</span></div>
                </div>

                {/* Payment info */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" className="gap-1">💳 {paymentMethodLabels[selectedOrder.payment_method || ""] || selectedOrder.payment_method || "غير محدد"}</Badge>
                  <Badge className={paymentStatusColors[selectedOrder.payment_status || "pending"]}>{paymentStatusLabels[selectedOrder.payment_status || "pending"]}</Badge>
                  {Number(selectedOrder.amount_paid) > 0 && <Badge variant="outline" className="text-green-600">المدفوع: ₪{Number(selectedOrder.amount_paid).toLocaleString()}</Badge>}
                  {Number(selectedOrder.total) - Number(selectedOrder.amount_paid) > 0 && selectedOrder.payment_status !== "paid" && selectedOrder.payment_status !== "مدفوع" && (
                    <Badge variant="outline" className="text-red-600">المتبقي: ₪{(Number(selectedOrder.total) - Number(selectedOrder.amount_paid)).toLocaleString()}</Badge>
                  )}
                  {selectedOrder.invoice_number && <Badge variant="outline" className="text-green-600 gap-1">🧾 {selectedOrder.invoice_number}</Badge>}
                </div>

                {/* Notes */}
                {selectedOrder.all_notes && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5">📝 الملاحظات</h4>
                    <div className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line leading-relaxed">{selectedOrder.all_notes}</div>
                  </div>
                )}
                {!selectedOrder.all_notes && (selectedOrder.customer_notes || selectedOrder.production_notes) && (
                  <div className="space-y-2">
                    {selectedOrder.customer_notes && <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3"><h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">🛒 ملاحظات الزبون</h4><p className="text-xs">{selectedOrder.customer_notes}</p></div>}
                    {selectedOrder.production_notes && <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3"><h4 className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">🏭 ملاحظات الإنتاج</h4><p className="text-xs">{selectedOrder.production_notes}</p></div>}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap pt-2">
                  {/* Convert to invoice — only if not yet invoiced */}
                  {!selectedOrder.linked_invoice_id && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setInvoicePaymentMethod("credit"); setDepositAmount(0); setShowInvoiceModal(true); }}>
                      <FileText className="h-3.5 w-3.5" /> 🧾 تحويل لفاتورة مبيعات
                    </Button>
                  )}

                  {/* WhatsApp */}
                  {selectedOrder.customer_phone && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                      let digits = selectedOrder.customer_phone!.replace(/[^0-9]/g, "");
                      if (digits.startsWith("00972")) digits = digits.substring(2);
                      else if (digits.startsWith("0") && digits.length === 10) digits = "972" + digits.substring(1);
                      else if (digits.length === 9 && (digits.startsWith("5") || digits.startsWith("2"))) digits = "972" + digits;
                      window.open(`https://wa.me/${digits}`, "_blank");
                    }}>
                      <MessageCircle className="h-3.5 w-3.5" /> واتساب
                    </Button>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground text-center">{formatDate(selectedOrder.created_at)}</p>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Invoice Modal ═══════ */}
      <Dialog open={showInvoiceModal} onOpenChange={setShowInvoiceModal}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> تأكيد إنشاء فاتورة مبيعات</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">رقم الطلبية</span><span className="font-mono font-medium">{selectedOrder.reference_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الزبون</span><span className="font-medium">{selectedOrder.customer_name}</span></div>
                {orderItems.length > 0 && (
                  <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
                    <span className="text-xs text-muted-foreground">المنتجات:</span>
                    {orderItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span>• {item.product_name} × {item.quantity}</span>
                        <span className="tabular-nums">{Number(item.line_total).toLocaleString()} ₪</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-border/50 pt-2 flex justify-between font-bold">
                  <span>الإجمالي</span><span>{Number(selectedOrder.total).toLocaleString()} ₪</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">طريقة الدفع</label>
                <RadioGroup value={invoicePaymentMethod} onValueChange={(v) => setInvoicePaymentMethod(v as any)} className="space-y-2">
                  <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                    <RadioGroupItem value="cash" id="q-cash" /><Label htmlFor="q-cash" className="flex-1 cursor-pointer">كاش فوري</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                    <RadioGroupItem value="credit" id="q-credit" /><Label htmlFor="q-credit" className="flex-1 cursor-pointer">آجل (ذمة مدينة)</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                    <RadioGroupItem value="partial" id="q-partial" /><Label htmlFor="q-partial" className="flex-1 cursor-pointer">جزئي (عربون + باقي)</Label>
                  </div>
                </RadioGroup>
              </div>

              {invoicePaymentMethod === "partial" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">مبلغ العربون</label>
                  <Input type="number" value={depositAmount} onChange={e => setDepositAmount(Number(e.target.value))} max={Number(selectedOrder.total)} min={0} className="text-left" dir="ltr" />
                  <p className="text-[10px] text-muted-foreground mt-1">المتبقي: {(Number(selectedOrder.total) - depositAmount).toLocaleString()} ₪</p>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowInvoiceModal(false)}>إلغاء</Button>
                <Button onClick={handleCreateInvoice} disabled={saving} className="gap-2">
                  <FileText className="h-4 w-4" />{saving ? "جاري الإنشاء..." : "إنشاء الفاتورة"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Status Settings Dialog ═══════ */}
      <Dialog open={showStatusSettings} onOpenChange={setShowStatusSettings}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> إدارة حالات الطلبية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add new status */}
            <div className="flex items-center gap-2">
              <Input placeholder="اسم الحالة الجديدة..." value={newStatusName} onChange={e => setNewStatusName(e.target.value)} className="text-sm flex-1" dir="rtl" />
              <div className="flex gap-1 flex-shrink-0">
                {STATUS_COLORS.slice(0, 6).map(c => (
                  <button key={c} className={`w-6 h-6 rounded-full border-2 transition-transform ${newStatusColor === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} onClick={() => setNewStatusColor(c)} />
                ))}
              </div>
              <Button size="sm" onClick={addStatus} disabled={!newStatusName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Existing statuses */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {statuses.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm flex-1 font-medium text-foreground">{s.name}</span>
                  {s.effect !== "none" && <Badge variant="outline" className="text-[10px]">{s.effect === "ready_invoice" ? "فوترة" : s.effect === "invoiced" ? "مفوتر" : s.effect === "paid" ? "دفع" : s.effect === "cancelled" ? "إلغاء" : s.effect}</Badge>}
                  <button onClick={() => deleteStatus(s.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground">💡 الحالات المرتبطة بتأثير (فوترة/دفع) تفعّل أزرار إضافية عند اختيارها</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QamarOrdersTab;
