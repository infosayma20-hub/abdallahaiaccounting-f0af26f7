import { useState, useEffect, useMemo, Fragment } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, ShoppingCart, Package, Truck, CheckCircle, Trash2, Eye,
  MessageCircle, CreditCard, BarChart3, TrendingUp, DollarSign, CalendarDays,
  Send, Gift, Star, Phone, ArrowUpDown, ChevronLeft, ChevronRight, X
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const statusColors: Record<string, string> = {
  "جديد": "bg-info/10 text-info",
  "مؤكد": "bg-primary/10 text-primary",
  "قيد التجهيز": "bg-warning/10 text-warning",
  "جاهز للشحن": "bg-accent/10 text-accent",
  "تم الشحن": "bg-primary/10 text-primary",
  "تم التسليم": "bg-primary/10 text-primary",
  "مرتجع": "bg-destructive/10 text-destructive",
  "ملغي": "bg-muted text-muted-foreground",
};

const ALL_STATUSES = ["جديد", "مؤكد", "قيد التجهيز", "جاهز للشحن", "تم الشحن", "تم التسليم", "مرتجع", "ملغي"];
const PAYMENT_METHODS = ["كاش", "تحويل بنكي", "شيك", "دفع إلكتروني", "آجل"];
const SOURCES = ["يدوي", "متجر إلكتروني", "واتساب", "هاتف", "أخرى"];

const REGIONS: Record<string, string[]> = {
  "الداخل 48": ["حيفا", "يافا", "عكا", "الناصرة", "اللد", "الرملة", "أم الفحم", "الطيبة", "باقة الغربية", "سخنين", "شفاعمرو", "طمرة", "عرعرة", "كفر قاسم", "كفر كنا", "المغار", "دبورية", "عرابة", "كفر ياسيف"],
  "القدس": ["القدس", "أبو ديس", "العيزرية", "بيت حنينا", "شعفاط", "العيسوية", "سلوان", "الطور", "بيت صفافا", "صور باهر"],
  "الضفة الغربية": ["رام الله", "نابلس", "الخليل", "بيت لحم", "جنين", "طولكرم", "قلقيلية", "أريحا", "سلفيت", "طوباس", "يطا", "دورا", "حلحول", "بيت جالا", "بيت ساحور", "العروب", "عزون", "قباطية", "بيتا", "حوارة", "بلاطة", "عصيرة الشمالية", "بيت فوريك", "ترمسعيا", "بيرزيت", "سلواد", "دير دبوان", "بيتونيا"],
  "النقب والجنوب": ["بئر السبع", "رهط", "تل السبع", "حورة", "كسيفة", "اللقية", "عرعرة النقب", "شقيب السلام"],
};
const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--info))", "hsl(var(--destructive))"];

type Order = {
  id: string; order_number: string | null; customer_name: string; customer_phone: string | null;
  customer_address: string | null; order_date: string; delivery_date: string | null; status: string;
  subtotal: number; discount: number; shipping_cost: number; total: number; payment_status: string;
  payment_method: string | null; shipping_method: string | null; tracking_number: string | null;
  source: string | null; notes: string | null; created_at: string; user_id: string;
  linked_invoice_id?: string | null;
};

const defaultForm = {
  customer_name: "", customer_phone: "", customer_address: "", order_date: new Date().toISOString().split("T")[0],
  delivery_date: "", status: "جديد", subtotal: 0, discount: 0, shipping_cost: 0, total: 0,
  payment_status: "غير مدفوع", payment_method: "كاش", shipping_method: "", tracking_number: "", source: "يدوي", notes: "",
};

const OrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("orders");

  // Sort, pagination, selection
  type SortKey = 'order_number' | 'customer_name' | 'order_date' | 'total' | 'status' | 'source';
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PER_PAGE = 20;

  // Dialogs
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<Order | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState<Order | null>(null);
  const [showPayment, setShowPayment] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);

  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<{ product_name: string; quantity: number; unit_price: number; discount: number; total: number }[]>([]);

  // WhatsApp message state
  const [waMessage, setWaMessage] = useState("");
  const [waTemplate, setWaTemplate] = useState("feedback");

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const [ordRes, prodRes] = await Promise.all([
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("user_id", user.id),
    ]);
    if (ordRes.error) console.error("Orders fetch error:", ordRes.error);
    setOrders((ordRes.data as Order[]) || []);
    setProducts((prodRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const fetchOrderItems = async (orderId: string) => {
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    setOrderItems((data as any[]) || []);
  };

  const recalcTotal = (updatedItems: typeof items) => {
    const subtotal = updatedItems.reduce((s, i) => s + i.total, 0);
    setForm(prev => ({ ...prev, subtotal, total: subtotal - prev.discount + prev.shipping_cost }));
  };

  const addItem = () => {
    const newItems = [...items, { product_name: "", quantity: 1, unit_price: 0, discount: 0, total: 0 }];
    setItems(newItems);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[idx] as any)[field] = value;
    if (field === "product_name") {
      const prod = products.find(p => p.name === value);
      if (prod) newItems[idx].unit_price = Number(prod.sell_price);
    }
    newItems[idx].total = newItems[idx].quantity * newItems[idx].unit_price - newItems[idx].discount;
    setItems(newItems);
    recalcTotal(newItems);
  };

  const removeItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);
    recalcTotal(newItems);
  };

  const handleSave = async () => {
    if (!user || !form.customer_name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    const orderNum = editingId ? undefined : `ORD-${Date.now().toString(36).toUpperCase()}`;
    const payload: any = { ...form, user_id: user.id };
    if (orderNum) payload.order_number = orderNum;

    if (editingId) {
      const { error } = await supabase.from("orders").update(payload).eq("id", editingId);
      if (error) { console.error("Update error:", error); toast.error("خطأ في التحديث: " + error.message); }
      else { toast.success("تم التحديث"); setShowForm(false); setEditingId(null); fetchOrders(); }
    } else {
      const { data, error } = await supabase.from("orders").insert(payload).select();
      if (error || !data?.[0]) {
        console.error("Insert error:", error);
        toast.error("خطأ في إنشاء الطلبية: " + (error?.message || "غير معروف"));
        return;
      }
      if (items.length > 0) {
        const orderItemsPayload = items.map(i => ({ ...i, order_id: data[0].id, user_id: user.id }));
        const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload as any);
        if (itemsError) console.error("Items insert error:", itemsError);
      }
      toast.success("تم إنشاء الطلبية بنجاح ✅");
      setShowForm(false); setItems([]); fetchOrders();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الطلبية؟")) return;
    await supabase.from("order_items").delete().eq("order_id", id);
    await supabase.from("orders").delete().eq("id", id);
    toast.success("تم الحذف"); fetchOrders();
  };

  const createInvoiceFromOrder = async (order: Order) => {
    if (!user) return;
    // Fetch order items
    const { data: oItems } = await supabase.from("order_items").select("*").eq("order_id", order.id);
    const orderItemsList = (oItems as any[]) || [];

    // Generate invoice number
    const existingInvoices = JSON.parse(localStorage.getItem(`invoices_${user.id}`) || "[]");
    const salesCount = existingInvoices.filter((i: any) => i.type === "sales").length + 1;
    const invoiceNumber = `INV-${String(salesCount).padStart(4, "0")}`;

    const invoiceItems = orderItemsList.map((item: any) => ({
      id: crypto.randomUUID(),
      productId: item.product_id || undefined,
      description: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount || 0),
      taxRate: 0,
      subtotal: Number(item.total),
    }));

    // Fallback if no items - create single item from order total
    if (invoiceItems.length === 0) {
      invoiceItems.push({
        id: crypto.randomUUID(),
        productId: undefined,
        description: `طلبية ${order.order_number || order.id.slice(0, 8)}`,
        quantity: 1,
        unitPrice: Number(order.total),
        discount: 0,
        taxRate: 0,
        subtotal: Number(order.total),
      });
    }

    const subtotal = invoiceItems.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
    const totalDiscount = invoiceItems.reduce((s: number, i: any) => s + i.discount, 0);
    const total = subtotal - totalDiscount;

    const paymentMethodMap: Record<string, string> = {
      "كاش": "cash", "تحويل بنكي": "transfer", "شيك": "cheque", "دفع إلكتروني": "transfer", "آجل": "credit"
    };

    const invoice = {
      id: crypto.randomUUID(),
      type: "sales",
      invoiceNumber,
      date: new Date().toISOString().split("T")[0],
      dueDate: order.payment_method === "آجل" ? order.delivery_date : undefined,
      contactName: order.customer_name,
      items: invoiceItems,
      notes: `تم الإنشاء تلقائياً من طلبية ${order.order_number || ""} • ${order.notes || ""}`.trim(),
      status: "sent",
      paymentMethod: paymentMethodMap[order.payment_method || "كاش"] || "cash",
      subtotal,
      totalDiscount,
      totalTax: 0,
      total,
      paidAmount: order.payment_method === "آجل" ? 0 : total,
      remainingAmount: order.payment_method === "آجل" ? total : 0,
      currency: "ILS",
    };

    const updatedInvoices = [invoice, ...existingInvoices];
    localStorage.setItem(`invoices_${user.id}`, JSON.stringify(updatedInvoices));

    // Link invoice to order
    await supabase.from("orders").update({ linked_invoice_id: invoice.id } as any).eq("id", order.id);

    return invoice;
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status } as any).eq("id", id);
    if (error) { toast.error("خطأ في تحديث الحالة"); return; }

    // Auto-create invoice when confirming order
    if (status === "مؤكد") {
      const order = orders.find(o => o.id === id);
      if (order && !order.linked_invoice_id) {
        const invoice = await createInvoiceFromOrder(order);
        if (invoice) {
          toast.success(`تم تأكيد الطلبية وإنشاء فاتورة ${invoice.invoiceNumber} تلقائياً ✅`);
        }
      } else {
        toast.success(`تم تحديث الحالة: ${status}`);
      }
    } else {
      toast.success(`تم تحديث الحالة: ${status}`);
    }
    fetchOrders();
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    const { error } = await supabase.from("orders").update({ payment_status: paymentStatus } as any).eq("id", orderId);
    if (error) { toast.error("خطأ في تحديث حالة الدفع"); return; }
    toast.success(`تم تحديث حالة الدفع: ${paymentStatus}`);
    setShowPayment(null); fetchOrders();
  };

  // WhatsApp templates
  const getWhatsAppMessage = (order: Order, template: string) => {
    const companyName = "عبدالله AI للمحاسبة";
    switch (template) {
      case "feedback":
        return `مرحباً ${order.customer_name} 👋\n\nشكراً لتعاملك معنا في ${companyName}! 🙏\n\nنتمنى أن المنتج نال إعجابك ❤️\n\n🎁 عرض خاص لك:\nشاركنا تجربتك وصورة المنتج على وسائل التواصل واعمل منشن لحسابنا واحصل على خصم 5% على طلبيتك القادمة!\n\nرقم طلبيتك: ${order.order_number}\n\nنتطلع لسماع رأيك! ⭐`;
      case "delivery":
        return `مرحباً ${order.customer_name} 👋\n\nطلبيتك رقم ${order.order_number} في الطريق إليك! 🚚\n\nتفاصيل الطلبية:\n📦 الإجمالي: ${Number(order.total).toLocaleString()} ₪\n📍 العنوان: ${order.customer_address || "—"}\n\nللاستفسار تواصل معنا مباشرة 📞\n\nشكراً لثقتك بـ ${companyName}`;
      case "followup":
        return `مرحباً ${order.customer_name} 👋\n\nنتمنى أنك بخير!\n\nهل وصلتك الطلبية رقم ${order.order_number} بحالة جيدة؟\n\nإذا كان عندك أي ملاحظة أو استفسار، نحنا هنا لخدمتك 🤝\n\n${companyName}`;
      case "promo":
        return `مرحباً ${order.customer_name} 👋\n\n🎉 عرض خاص لعملائنا المميزين!\n\nبمناسبة تعاملك معنا، نقدم لك خصم 5% على طلبيتك القادمة!\n\nفقط اذكر كود الخصم: VIP5\n\nنتطلع لخدمتك مجدداً! ❤️\n\n${companyName}`;
      default:
        return "";
    }
  };

  const sendWhatsApp = (order: Order, message: string) => {
    if (!order.customer_phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
    const phone = order.customer_phone.replace(/\D/g, "").replace(/^0/, "972");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    toast.success("تم فتح واتساب ✅");
  };

  const filtered = orders.filter(o => {
    const matchSearch = o.customer_name?.includes(search) || o.order_number?.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    new: orders.filter(o => o.status === "جديد").length,
    processing: orders.filter(o => o.status === "قيد التجهيز").length,
    shipped: orders.filter(o => o.status === "تم الشحن").length,
    delivered: orders.filter(o => o.status === "تم التسليم").length,
  };

  // ─── Reports data ───
  const reportData = useMemo(() => {
    const totalRevenue = orders.filter(o => o.status !== "ملغي" && o.status !== "مرتجع").reduce((s, o) => s + Number(o.total), 0);
    const paidOrders = orders.filter(o => o.payment_status === "مدفوع");
    const unpaidOrders = orders.filter(o => o.payment_status !== "مدفوع" && o.status !== "ملغي");
    const totalPaid = paidOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalUnpaid = unpaidOrders.reduce((s, o) => s + Number(o.total), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.filter(o => o.status !== "ملغي").length : 0;

    // Status distribution
    const statusDist = ALL_STATUSES.map(s => ({ name: s, value: orders.filter(o => o.status === s).length })).filter(d => d.value > 0);

    // Payment distribution
    const paymentDist = [
      { name: "مدفوع", value: paidOrders.length },
      { name: "غير مدفوع", value: unpaidOrders.length },
    ].filter(d => d.value > 0);

    // Source distribution
    const sourceDist = SOURCES.map(s => ({ name: s, value: orders.filter(o => o.source === s).length })).filter(d => d.value > 0);

    // Monthly trend (last 6 months)
    const monthlyTrend: { month: string; orders: number; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthOrders = orders.filter(o => {
        const od = new Date(o.order_date);
        return od.getFullYear() === year && od.getMonth() === month && o.status !== "ملغي";
      });
      monthlyTrend.push({
        month: d.toLocaleDateString("ar-EG", { month: "short" }),
        orders: monthOrders.length,
        revenue: monthOrders.reduce((s, o) => s + Number(o.total), 0),
      });
    }

    // Top customers
    const customerMap = new Map<string, { count: number; total: number }>();
    orders.filter(o => o.status !== "ملغي").forEach(o => {
      const existing = customerMap.get(o.customer_name) || { count: 0, total: 0 };
      customerMap.set(o.customer_name, { count: existing.count + 1, total: existing.total + Number(o.total) });
    });
    const topCustomers = Array.from(customerMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { totalRevenue, totalPaid, totalUnpaid, avgOrderValue, statusDist, paymentDist, sourceDist, monthlyTrend, topCustomers };
  }, [orders]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <PageHeader title="الطلبيات" breadcrumb={["المبيعات", "الطلبيات"]} />
        <Button onClick={() => { setForm({ ...defaultForm }); setItems([]); setEditingId(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> طلبية جديدة
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="orders" className="gap-1"><ShoppingCart className="h-3.5 w-3.5" /> الطلبيات</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> التقارير</TabsTrigger>
        </TabsList>

        {/* ═══════ Orders Tab ═══════ */}
        <TabsContent value="orders" className="space-y-6 mt-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="cursor-pointer hover:border-info/50 transition-colors" onClick={() => setStatusFilter("جديد")}>
              <CardContent className="p-4 text-center">
                <ShoppingCart className="h-5 w-5 mx-auto text-info mb-1" />
                <p className="text-2xl font-bold text-foreground">{counts.new}</p>
                <p className="text-xs text-muted-foreground">جديدة</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-warning/50 transition-colors" onClick={() => setStatusFilter("قيد التجهيز")}>
              <CardContent className="p-4 text-center">
                <Package className="h-5 w-5 mx-auto text-warning mb-1" />
                <p className="text-2xl font-bold text-foreground">{counts.processing}</p>
                <p className="text-xs text-muted-foreground">قيد التجهيز</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-accent/50 transition-colors" onClick={() => setStatusFilter("تم الشحن")}>
              <CardContent className="p-4 text-center">
                <Truck className="h-5 w-5 mx-auto text-accent mb-1" />
                <p className="text-2xl font-bold text-foreground">{counts.shipped}</p>
                <p className="text-xs text-muted-foreground">تم الشحن</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("تم التسليم")}>
              <CardContent className="p-4 text-center">
                <CheckCircle className="h-5 w-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold text-foreground">{counts.delivered}</p>
                <p className="text-xs text-muted-foreground">تم التسليم</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو رقم الطلبية..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ background: '#0D1B2E', color: '#fff' }}>
                    <th className="px-3 py-3 text-right text-xs font-semibold">رقم الطلبية</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">العميل</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">التاريخ</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">الإجمالي</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">الحالة</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">الدفع</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">المصدر</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد طلبيات</td></tr>
                ) : filtered.map((o, i) => (
                  <tr key={o.id} className="border-b transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: '#E2E8F0', background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{o.order_number || "—"}</td>
                    <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#1E293B' }}>{o.customer_name}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>{fmtDateDisplay(o.order_date)}</td>
                    <td className="px-3 py-3 text-sm font-bold tabular-nums" style={{ color: '#1E293B' }}>{Number(o.total).toLocaleString()} ₪</td>
                    <td className="px-3 py-3">
                      <Select value={o.status} onValueChange={v => updateStatus(o.id, v)}>
                        <SelectTrigger className={`h-7 text-xs w-[120px] border-0 ${statusColors[o.status] || ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant={o.payment_status === "مدفوع" ? "default" : "secondary"}
                        className="text-[10px] cursor-pointer"
                        onClick={() => setShowPayment(o)}
                      >
                        {o.payment_status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>{o.source}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="عرض التفاصيل"
                          onClick={() => { setShowDetail(o); fetchOrderItems(o.id); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="واتساب"
                          onClick={() => {
                            setShowWhatsApp(o);
                            setWaTemplate("feedback");
                            setWaMessage(getWhatsAppMessage(o, "feedback"));
                          }}>
                          <MessageCircle className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="قبض"
                          onClick={() => setShowPayment(o)}>
                          <CreditCard className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="حذف"
                          onClick={() => handleDelete(o.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
        </TabsContent>

        {/* ═══════ Reports Tab ═══════ */}
        <TabsContent value="reports" className="space-y-6 mt-4">
          {/* Report KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">إجمالي الإيرادات</span>
                </div>
                <p className="text-xl font-bold text-foreground">{reportData.totalRevenue.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">المحصّل</span>
                </div>
                <p className="text-xl font-bold text-primary">{reportData.totalPaid.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">غير محصّل</span>
                </div>
                <p className="text-xl font-bold text-warning">{reportData.totalUnpaid.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <span className="text-xs text-muted-foreground">متوسط قيمة الطلبية</span>
                </div>
                <p className="text-xl font-bold text-foreground">{Math.round(reportData.avgOrderValue).toLocaleString()} ₪</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Monthly Trend */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">📈 اتجاه الطلبيات الشهري</h3>
                {reportData.monthlyTrend.some(m => m.orders > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={reportData.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="orders" name="طلبيات" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات كافية</p>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">📊 توزيع حالات الطلبيات</h3>
                {reportData.statusDist.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={reportData.statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {reportData.statusDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            {/* Revenue Trend */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">💰 الإيرادات الشهرية</h3>
                {reportData.monthlyTrend.some(m => m.revenue > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reportData.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="revenue" name="الإيرادات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات كافية</p>
                )}
              </CardContent>
            </Card>

            {/* Top Customers */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">⭐ أفضل الزبائن</h3>
                {reportData.topCustomers.length > 0 ? (
                  <div className="space-y-3">
                    {reportData.topCustomers.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                          <span className="text-sm text-foreground">{c.name}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">{c.total.toLocaleString()} ₪</p>
                          <p className="text-[10px] text-muted-foreground">{c.count} طلبية</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            {/* Source Distribution */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">📱 مصادر الطلبيات</h3>
                {reportData.sourceDist.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reportData.sourceDist} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="value" name="عدد الطلبيات" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            {/* Payment Status */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">💳 حالة التحصيل</h3>
                {reportData.paymentDist.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={reportData.paymentDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        <Cell fill="hsl(var(--primary))" />
                        <Cell fill="hsl(var(--warning))" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════ Order Detail Dialog ═══════ */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الطلبية {showDetail?.order_number}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {([["العميل", showDetail.customer_name], ["الهاتف", showDetail.customer_phone], ["العنوان", showDetail.customer_address], ["الحالة", showDetail.status], ["الدفع", showDetail.payment_status], ["طريقة الدفع", showDetail.payment_method], ["طريقة الشحن", showDetail.shipping_method], ["رقم التتبع", showDetail.tracking_number]] as [string, string | null][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-medium">{v || "—"}</span>
                  </div>
                ))}
              </div>

              <h4 className="font-medium text-foreground text-sm">البنود</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map(i => (
                    <TableRow key={i.id}>
                      <TableCell>{i.product_name}</TableCell>
                      <TableCell>{i.quantity}</TableCell>
                      <TableCell>{Number(i.unit_price).toLocaleString()}</TableCell>
                      <TableCell>{Number(i.total).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {orderItems.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs">لا توجد بنود</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="text-sm space-y-1 border-t border-border pt-2">
                <div className="flex justify-between"><span className="text-muted-foreground">المجموع</span><span>{Number(showDetail.subtotal).toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الخصم</span><span>{Number(showDetail.discount).toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span>{Number(showDetail.shipping_cost).toLocaleString()} ₪</span></div>
                <div className="flex justify-between font-bold text-foreground"><span>الإجمالي</span><span>{Number(showDetail.total).toLocaleString()} ₪</span></div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap pt-2">
                {showDetail.payment_status !== "مدفوع" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowDetail(null); setShowPayment(showDetail); }}>
                    <CreditCard className="h-3 w-3" /> قبض الطلبية
                  </Button>
                )}
                {showDetail.customer_phone && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                    setShowDetail(null);
                    setShowWhatsApp(showDetail);
                    setWaTemplate("feedback");
                    setWaMessage(getWhatsAppMessage(showDetail, "feedback"));
                  }}>
                    <MessageCircle className="h-3 w-3" /> إرسال واتساب
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ WhatsApp Dialog ═══════ */}
      <Dialog open={!!showWhatsApp} onOpenChange={() => setShowWhatsApp(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" /> إرسال رسالة واتساب
            </DialogTitle>
          </DialogHeader>
          {showWhatsApp && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg p-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">العميل:</span>
                <span className="font-medium">{showWhatsApp.customer_name}</span>
                <span className="text-muted-foreground">—</span>
                <span className="font-mono text-xs">{showWhatsApp.customer_phone || "لا يوجد رقم"}</span>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">قالب الرسالة</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "feedback", label: "طلب فيدباك + خصم 5%", icon: Star },
                    { id: "delivery", label: "إشعار شحن", icon: Truck },
                    { id: "followup", label: "متابعة بعد التسليم", icon: CheckCircle },
                    { id: "promo", label: "عرض ترويجي", icon: Gift },
                  ].map(t => (
                    <Button
                      key={t.id}
                      variant={waTemplate === t.id ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5 text-xs justify-start"
                      onClick={() => {
                        setWaTemplate(t.id);
                        setWaMessage(getWhatsAppMessage(showWhatsApp, t.id));
                      }}
                    >
                      <t.icon className="h-3.5 w-3.5" /> {t.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">محتوى الرسالة (يمكنك تعديلها)</label>
                <Textarea
                  value={waMessage}
                  onChange={e => setWaMessage(e.target.value)}
                  rows={8}
                  className="text-sm leading-relaxed"
                  dir="rtl"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowWhatsApp(null)}>إلغاء</Button>
                <Button className="gap-2" onClick={() => sendWhatsApp(showWhatsApp, waMessage)}>
                  <Send className="h-4 w-4" /> إرسال عبر واتساب
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Payment Dialog ═══════ */}
      <Dialog open={!!showPayment} onOpenChange={() => setShowPayment(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> تحديث حالة الدفع
            </DialogTitle>
          </DialogHeader>
          {showPayment && (
            <div className="space-y-4">
              <div className="text-sm bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">الطلبية</span><span className="font-mono text-xs">{showPayment.order_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">العميل</span><span>{showPayment.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي</span><span className="font-bold">{Number(showPayment.total).toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الحالة الحالية</span>
                  <Badge variant={showPayment.payment_status === "مدفوع" ? "default" : "secondary"}>{showPayment.payment_status}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {[
                  { status: "مدفوع", label: "✅ تم القبض بالكامل", variant: "default" as const },
                  { status: "مدفوع جزئياً", label: "🔄 مدفوع جزئياً", variant: "outline" as const },
                  { status: "غير مدفوع", label: "⏳ غير مدفوع", variant: "outline" as const },
                ].map(p => (
                  <Button
                    key={p.status}
                    variant={p.variant}
                    className="justify-start gap-2"
                    onClick={() => updatePaymentStatus(showPayment.id, p.status)}
                    disabled={showPayment.payment_status === p.status}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ New Order Dialog ═══════ */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "تعديل الطلبية" : "طلبية جديدة"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">اسم العميل *</label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الهاتف</label><Input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">المنطقة</label>
              <Select value={form.customer_address?.split(" - ")[0] || ""} onValueChange={v => setForm({ ...form, customer_address: v })}>
                <SelectTrigger><SelectValue placeholder="اختر المنطقة" /></SelectTrigger>
                <SelectContent>{Object.keys(REGIONS).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">المدينة</label>
              <Select value={form.customer_address?.split(" - ")[1] || ""} onValueChange={v => { const region = form.customer_address?.split(" - ")[0] || ""; setForm({ ...form, customer_address: `${region} - ${v}` }); }}>
                <SelectTrigger><SelectValue placeholder="اختر المدينة" /></SelectTrigger>
                <SelectContent>{(REGIONS[form.customer_address?.split(" - ")[0] || ""] || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">تاريخ الطلبية</label><Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">تاريخ التسليم</label><Input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">طريقة الدفع</label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">المصدر</label>
              <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">طريقة الشحن</label><Input value={form.shipping_method} onChange={e => setForm({ ...form, shipping_method: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground">ملاحظات</label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-foreground text-sm">بنود الطلبية</h4>
              <Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> إضافة بند</Button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-2 mb-2 items-end">
                <div>
                  <Select value={item.product_name} onValueChange={v => updateItem(idx, "product_name", v)}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="المنتج" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Input type="number" placeholder="الكمية" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="text-xs" />
                <Input type="number" placeholder="السعر" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} className="text-xs" />
                <p className="text-sm font-medium text-foreground text-center">{item.total.toLocaleString()}</p>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><label className="text-xs text-muted-foreground">الخصم</label><Input type="number" value={form.discount} onChange={e => { const d = Number(e.target.value); setForm(f => ({ ...f, discount: d, total: f.subtotal - d + f.shipping_cost })); }} /></div>
            <div><label className="text-xs text-muted-foreground">تكلفة الشحن</label><Input type="number" value={form.shipping_cost} onChange={e => { const s = Number(e.target.value); setForm(f => ({ ...f, shipping_cost: s, total: f.subtotal - f.discount + s })); }} /></div>
            <div><label className="text-xs text-muted-foreground">الإجمالي</label><Input type="number" value={form.total} readOnly className="bg-muted font-bold" /></div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave}>{editingId ? "حفظ التعديلات" : "إنشاء الطلبية"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
