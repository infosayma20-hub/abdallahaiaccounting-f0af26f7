import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Send, Gift, Star, Phone, ArrowUpDown, ChevronLeft, ChevronRight, X,
  Download, Printer, Hash, FileText, Pencil, Banknote, Factory, LayoutGrid, LayoutList
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import ConvertToInvoiceModal from "@/components/orders/ConvertToInvoiceModal";

import RecordReceiptModal from "@/components/orders/RecordReceiptModal";
import ProductionCostSection from "@/components/orders/ProductionCostSection";
import { syncContactFromOrder, syncProductsFromOrderItems, retroactiveSyncOrders } from "@/lib/order-contact-sync";

import { setNextExportBranding } from "@/lib/excel-export";
/* ─── Status configs ─── */
const STATUS_CONFIGS: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  "جديد":        { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE", dot: "#3B82F6" },
  "مؤكد":        { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0", dot: "#22C55E" },
  "قيد التجهيز":  { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", dot: "#F59E0B" },
  "جاهز للفوترة": { bg: "#F5F3FF", color: "#7C3AED", border: "#DDD6FE", dot: "#8B5CF6" },
  "مفوتر":       { bg: "#ECFEFF", color: "#0891B2", border: "#A5F3FC", dot: "#06B6D4" },
  "جاهز للشحن":  { bg: "#F0FDFA", color: "#0D9488", border: "#99F6E4", dot: "#14B8A6" },
  "تم الشحن":    { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0", dot: "#22C55E" },
  "تم التسليم":   { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", dot: "#16A34A" },
  "مؤجل":        { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", dot: "#EF4444" },
  "مدفوع جزئياً": { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", dot: "#D97706" },
  "مدفوع كاملاً": { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", dot: "#059669" },
  "ملغي":        { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", dot: "#EF4444" },
  "مرتجع":       { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", dot: "#EF4444" },
};
const getStatusConfig = (s: string) => STATUS_CONFIGS[s] || STATUS_CONFIGS["جديد"];

const PAYMENT_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  "غير مدفوع":   { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  "مدفوع":       { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  "مدفوع كاملاً": { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  "مدفوع جزئياً": { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
};
const getPaymentConfig = (s: string) => PAYMENT_BADGE[s] || PAYMENT_BADGE["غير مدفوع"];

const ALL_STATUSES = ["جديد", "قيد التجهيز", "جاهز للفوترة", "مفوتر", "مدفوع جزئياً", "مدفوع كاملاً", "ملغي"];
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
  production_status?: string; production_cost?: number; cost_breakdown?: any[];
  invoice_id?: string | null; invoiced_at?: string; paid_amount?: number; remaining_amount?: number;
};

const defaultForm = {
  customer_name: "", customer_phone: "", customer_address: "", order_date: new Date().toISOString().split("T")[0],
  delivery_date: "", status: "جديد", subtotal: 0, discount: 0, shipping_cost: 0, total: 0,
  payment_status: "غير مدفوع", payment_method: "كاش", shipping_method: "", tracking_number: "", source: "يدوي", notes: "",
};

const OrdersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("orders");
  const [viewMode, setViewMode] = useState<"table" | "cards">(window.innerWidth < 1024 ? "cards" : "table");
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  type SortKey = 'order_number' | 'customer_name' | 'order_date' | 'total' | 'status' | 'source';
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PER_PAGE = 20;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<Order | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState<Order | null>(null);
  const [showPayment, setShowPayment] = useState<Order | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<{ product_name: string; quantity: number; unit_price: number; discount: number; total: number }[]>([]);
  const [waMessage, setWaMessage] = useState("");
  const [waTemplate, setWaTemplate] = useState("feedback");

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const [ordRes, qamarRes, prodRes] = await Promise.all([
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("qamar_orders" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("user_id", user.id),
    ]);
    if (ordRes.error) console.error("Orders fetch error:", ordRes.error);
    
    const legacyOrders = ((ordRes.data as any[]) || []) as Order[];
    
    // Map qamar_orders to Order type and merge, avoiding duplicates by reference_number
    const qamarOrders: Order[] = ((qamarRes.data as any[]) || []).map((q: any) => ({
      id: q.id,
      order_number: q.reference_number,
      customer_name: q.customer_name || "",
      customer_phone: q.customer_phone,
      customer_address: q.customer_address,
      order_date: q.created_at,
      delivery_date: null,
      status: q.status || "جديد",
      subtotal: q.subtotal || 0,
      discount: q.discount || 0,
      shipping_cost: q.shipping_cost || 0,
      total: q.total || 0,
      payment_status: q.payment?.method === "partial" ? "مدفوع جزئياً" : q.payment_status === "paid" ? "مدفوع كاملاً" : q.payment_status === "partial" ? "مدفوع جزئياً" : "غير مدفوع",
      payment_method: q.payment_method,
      shipping_method: null,
      tracking_number: null,
      source: q.source || "قمر براند",
      notes: q.all_notes || q.customer_notes || null,
      created_at: q.created_at,
      user_id: q.user_id,
      linked_invoice_id: q.linked_invoice_id,
      paid_amount: q.amount_paid || q.deposit_amount || 0,
      remaining_amount: q.remaining_amount || ((q.total || 0) - (q.amount_paid || 0)),
      deposit_amount: q.deposit_amount || 0,
      deposit_paid_at: q.deposit_paid_at || null,
      _payment: q.payment || {},
      _source_table: "qamar_orders",
    } as any));
    
    // Deduplicate: if a legacy order has the same order_number as a qamar order, keep only the qamar one
    const qamarNumbers = new Set(qamarOrders.map(q => q.order_number).filter(Boolean));
    const filteredLegacy = legacyOrders.filter(o => !o.order_number || !qamarNumbers.has(o.order_number));
    
    const merged = [...filteredLegacy, ...qamarOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    setOrders(merged);
    setProducts((prodRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const fetchOrderItems = async (orderId: string) => {
    // Try order_items first, then qamar_order_items
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (data && data.length > 0) {
      setOrderItems(data as any[]);
      return;
    }
    // Fallback: qamar_order_items
    const { data: qamarItems } = await supabase.from("qamar_order_items").select("*").eq("order_id", orderId);
    setOrderItems(((qamarItems as any[]) || []).map((q: any) => ({
      ...q,
      unit_price: q.price || q.unit_price || 0,
      total: q.line_total || q.total || (q.quantity || 1) * (q.price || 0),
    })));
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
    
    // Auto-sync contact before invoicing
    const sourceTable = (order as any)._source_table === "qamar_orders" ? "qamar_orders" : "orders";
    const contactId = await syncContactFromOrder({
      id: order.id,
      user_id: order.user_id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address,
      order_number: order.order_number,
      source: order.source,
    }, sourceTable as any);
    
    // Auto-sync products
    await syncProductsFromOrderItems(order.id, user.id);
    
    const { data: oItems } = await supabase.from("order_items").select("*").eq("order_id", order.id);
    const orderItemsList = (oItems as any[]) || [];
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
    if (invoiceItems.length === 0) {
      invoiceItems.push({
        id: crypto.randomUUID(), productId: undefined,
        description: `طلبية ${order.order_number || order.id.slice(0, 8)}`,
        quantity: 1, unitPrice: Number(order.total), discount: 0, taxRate: 0, subtotal: Number(order.total),
      });
    }
    const subtotal = invoiceItems.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
    const totalDiscount = invoiceItems.reduce((s: number, i: any) => s + i.discount, 0);
    const total = subtotal - totalDiscount;
    const paymentMethodMap: Record<string, string> = {
      "كاش": "cash", "تحويل بنكي": "transfer", "شيك": "cheque", "دفع إلكتروني": "transfer", "آجل": "credit"
    };
    const invoice = {
      id: crypto.randomUUID(), type: "sales", invoiceNumber, date: new Date().toISOString().split("T")[0],
      dueDate: order.payment_method === "آجل" ? order.delivery_date : undefined,
      contactName: order.customer_name, contactId, items: invoiceItems,
      notes: `تم الإنشاء تلقائياً من طلبية ${order.order_number || ""} • ${order.notes || ""}`.trim(),
      status: "sent", paymentMethod: paymentMethodMap[order.payment_method || "كاش"] || "cash",
      subtotal, totalDiscount, totalTax: 0, total,
      paidAmount: order.payment_method === "آجل" ? 0 : total,
      remainingAmount: order.payment_method === "آجل" ? total : 0, currency: "ILS",
    };
    const updatedInvoices = [invoice, ...existingInvoices];
    localStorage.setItem(`invoices_${user.id}`, JSON.stringify(updatedInvoices));
    await supabase.from("orders").update({ linked_invoice_id: invoice.id } as any).eq("id", order.id);
    return invoice;
  };

  const handleRetroactiveSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const result = await retroactiveSyncOrders(user.id);
      toast.success(`تمت المزامنة: تم ربط ${result.contactsLinked} زبون و ${result.productsLinked} منتج ✅`);
      fetchOrders();
    } catch (err: any) {
      toast.error("خطأ في المزامنة: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status } as any).eq("id", id);
    if (error) { toast.error("خطأ في تحديث الحالة"); return; }
    if (status === "مؤكد") {
      const order = orders.find(o => o.id === id);
      if (order && !order.linked_invoice_id) {
        const invoice = await createInvoiceFromOrder(order);
        if (invoice) { toast.success(`تم تأكيد الطلبية وإنشاء فاتورة ${invoice.invoiceNumber} تلقائياً ✅`); }
      } else { toast.success(`تم تحديث الحالة: ${status}`); }
    } else { toast.success(`تم تحديث الحالة: ${status}`); }
    fetchOrders();
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    const { error } = await supabase.from("orders").update({ payment_status: paymentStatus } as any).eq("id", orderId);
    if (error) { toast.error("خطأ في تحديث حالة الدفع"); return; }
    toast.success(`تم تحديث حالة الدفع: ${paymentStatus}`);
    setShowPayment(null); fetchOrders();
  };

  const getWhatsAppMessage = (order: Order, template: string) => {
    const companyName = "عبدالله AI للمحاسبة";
    switch (template) {
      case "feedback": return `مرحباً ${order.customer_name} 👋\n\nشكراً لتعاملك معنا في ${companyName}! 🙏\n\nنتمنى أن المنتج نال إعجابك ❤️\n\n🎁 عرض خاص لك:\nشاركنا تجربتك وصورة المنتج على وسائل التواصل واعمل منشن لحسابنا واحصل على خصم 5% على طلبيتك القادمة!\n\nرقم طلبيتك: ${order.order_number}\n\nنتطلع لسماع رأيك! ⭐`;
      case "delivery": return `مرحباً ${order.customer_name} 👋\n\nطلبيتك رقم ${order.order_number} في الطريق إليك! 🚚\n\nتفاصيل الطلبية:\n📦 الإجمالي: ${Number(order.total).toLocaleString()} ₪\n📍 العنوان: ${order.customer_address || "—"}\n\nللاستفسار تواصل معنا مباشرة 📞\n\nشكراً لثقتك بـ ${companyName}`;
      case "followup": return `مرحباً ${order.customer_name} 👋\n\nنتمنى أنك بخير!\n\nهل وصلتك الطلبية رقم ${order.order_number} بحالة جيدة؟\n\nإذا كان عندك أي ملاحظة أو استفسار، نحنا هنا لخدمتك 🤝\n\n${companyName}`;
      case "promo": return `مرحباً ${order.customer_name} 👋\n\n🎉 عرض خاص لعملائنا المميزين!\n\nبمناسبة تعاملك معنا، نقدم لك خصم 5% على طلبيتك القادمة!\n\nفقط اذكر كود الخصم: VIP5\n\nنتطلع لخدمتك مجدداً! ❤️\n\n${companyName}`;
      default: return "";
    }
  };

  const sendWhatsApp = (order: Order, message: string) => {
    if (!order.customer_phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
    const phone = order.customer_phone.replace(/\D/g, "").replace(/^0/, "972");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    toast.success("تم فتح واتساب ✅");
  };

  const filtered = useMemo(() => orders.filter(o => {
    const matchSearch = o.customer_name?.includes(search) || o.order_number?.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  }), [orders, search, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === 'string') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (typeof av === 'number' || sortKey === 'total') { av = Number(av) || 0; bv = Number(bv) || 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const allPageSelected = paged.length > 0 && paged.every(p => selected.has(p.id));
  const toggleAllPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) paged.forEach(p => next.delete(p.id)); else paged.forEach(p => next.add(p.id));
      return next;
    });
  };

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const exportToExcel = () => {
    import("xlsx").then(XLSX => {
      const rows = filtered.map(o => ({
        "رقم الطلبية": o.order_number || "", "العميل": o.customer_name || "",
        "التاريخ": o.order_date || "", "الإجمالي": Number(o.total) || 0,
        "الحالة": o.status || "", "الدفع": o.payment_status || "", "المصدر": o.source || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
      setNextExportBranding({ title: "الطلبيات" });
      XLSX.writeFile(wb, `الطلبيات-${new Date().toISOString().split("T")[0]}.xlsx`);
    });
  };

  const handlePrint = () => {
    const rows = filtered.map(o => `
      <tr>
        <td>${o.order_number || "—"}</td><td>${o.customer_name || "—"}</td>
        <td>${o.order_date || "—"}</td><td class="font-mono font-bold">₪${Number(o.total).toLocaleString()}</td>
        <td>${o.status || "—"}</td><td>${o.payment_status || "—"}</td><td>${o.source || "—"}</td>
      </tr>`).join("");
    const totalVal = fmt(filtered.reduce((s, o) => s + Number(o.total), 0));
    const contentHtml = `
      <div class="print-header"><div><div class="company-name">أموالي</div><div class="report-title">الطلبيات</div></div><div class="print-date">${filtered.length} طلبية</div></div>
      <table><thead><tr><th>رقم الطلبية</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>الدفع</th><th>المصدر</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">المجموع (${filtered.length} طلبية)</td><td class="font-mono font-bold">${totalVal}</td><td colspan="3"></td></tr></tfoot></table>`;
    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({ title: "الطلبيات", companyName: "أموالي", contentHtml });
    });
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    ALL_STATUSES.forEach(s => { map[s] = orders.filter(o => o.status === s).length; });
    return map;
  }, [orders]);

  // ─── KPI data ───
  const kpiData = useMemo(() => {
    const active = orders.filter(o => o.status !== "ملغي" && o.status !== "مرتجع");
    const totalAll = active.reduce((s, o) => s + Number(o.total), 0);
    const now = new Date();
    const thisMonth = active.filter(o => { const d = new Date(o.order_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const thisMonthTotal = thisMonth.reduce((s, o) => s + Number(o.total), 0);
    const avgOrder = active.length > 0 ? totalAll / active.length : 0;
    return { totalAll, thisMonthTotal, count: orders.length, avgOrder };
  }, [orders]);

  // ─── Reports data ───
  const reportData = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== "ملغي");
    const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalPaid = activeOrders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
    const totalUnpaid = totalRevenue - totalPaid;
    const totalProductionCost = activeOrders.reduce((s, o) => s + Number(o.production_cost || 0), 0);
    const totalMargin = totalRevenue - totalProductionCost;
    const marginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : "0";
    const statusDist = ALL_STATUSES.map(s => ({ name: s, value: orders.filter(o => o.status === s).length })).filter(d => d.value > 0);
    const paidOrders = orders.filter(o => o.payment_status === "مدفوع");
    const unpaidOrders = orders.filter(o => o.payment_status !== "مدفوع" && o.status !== "ملغي");
    const paymentDist = [{ name: "مدفوع", value: paidOrders.length }, { name: "غير مدفوع", value: unpaidOrders.length }].filter(d => d.value > 0);
    const sourceDist = SOURCES.map(s => ({ name: s, value: orders.filter(o => o.source === s).length })).filter(d => d.value > 0);
    const monthlyTrend: { month: string; orders: number; revenue: number; cost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const year = d.getFullYear(), month = d.getMonth();
      const monthOrders = orders.filter(o => { const od = new Date(o.order_date); return od.getFullYear() === year && od.getMonth() === month && o.status !== "ملغي"; });
      monthlyTrend.push({ month: d.toLocaleDateString("ar-EG", { month: "short" }), orders: monthOrders.length, revenue: monthOrders.reduce((s, o) => s + Number(o.total), 0), cost: monthOrders.reduce((s, o) => s + Number(o.production_cost || 0), 0) });
    }
    const customerMap = new Map<string, { count: number; total: number; remaining: number }>();
    activeOrders.forEach(o => {
      const existing = customerMap.get(o.customer_name) || { count: 0, total: 0, remaining: 0 };
      customerMap.set(o.customer_name, { count: existing.count + 1, total: existing.total + Number(o.total), remaining: existing.remaining + Math.max(0, Number(o.total) - Number(o.paid_amount || 0)) });
    });
    const topCustomers = Array.from(customerMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total).slice(0, 5);
    const receivables = Array.from(customerMap.entries()).map(([name, data]) => ({ name, ...data })).filter(c => c.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    const orderMargins = activeOrders.filter(o => Number(o.production_cost || 0) > 0).map(o => ({ name: o.order_number || o.id.slice(0, 8), revenue: Number(o.total), cost: Number(o.production_cost || 0), margin: Number(o.total) - Number(o.production_cost || 0) }));
    return { totalRevenue, totalPaid, totalUnpaid, totalProductionCost, totalMargin, marginPct, statusDist, paymentDist, sourceDist, monthlyTrend, topCustomers, receivables, orderMargins };
  }, [orders]);

  /* ─── Styles ─── */
  const F = "Cairo, sans-serif";
  const NAVY = "#0D1B2E";

  const kpiCards = [
    { label: "إجمالي الطلبيات", value: fmt(kpiData.totalAll), accent: NAVY, icon: "💰" },
    { label: "هذا الشهر", value: fmt(kpiData.thisMonthTotal), accent: "#3B82F6", icon: "📅" },
    { label: "عدد الطلبيات", value: String(kpiData.count), accent: "#8B5CF6", icon: "#" },
    { label: "متوسط قيمة الطلب", value: fmt(kpiData.avgOrder), accent: "#F59E0B", icon: "📊" },
  ];

  const openEdit = (o: Order) => {
    setEditingId(o.id);
    setForm({
      customer_name: o.customer_name, customer_phone: o.customer_phone || "",
      customer_address: o.customer_address || "", order_date: o.order_date,
      delivery_date: o.delivery_date || "", status: o.status, subtotal: o.subtotal,
      discount: o.discount, shipping_cost: o.shipping_cost, total: o.total,
      payment_status: o.payment_status, payment_method: o.payment_method || "كاش",
      shipping_method: o.shipping_method || "", tracking_number: o.tracking_number || "",
      source: o.source || "يدوي", notes: o.notes || "",
    });
    setItems([]);
    setShowForm(true);
  };

  return (
    <div style={{ direction: "rtl", textAlign: "right", fontFamily: F, padding: "16px 24px 96px", maxWidth: "1400px", margin: "0 auto" }}>
      <PageHeader title="الطلبيات" breadcrumb={["المبيعات", "الطلبيات"]} />

      {/* ─── Actions bar ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "20px", marginTop: "12px" }}>
        <p style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F }}>إدارة الطلبيات والمبيعات</p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {user?.email === "alaaabedps1987@gmail.com" && (
            <button onClick={handleRetroactiveSync} disabled={syncing} style={{ background: "#ECFDF5", color: "#065F46", border: "1.5px solid #A7F3D0", borderRadius: "12px", padding: "10px 18px", fontSize: "13px", fontWeight: "600", fontFamily: F, cursor: syncing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease", opacity: syncing ? 0.6 : 1 }}>
              🔄 {syncing ? "جاري المزامنة..." : "مزامنة الزبائن والأصناف"}
            </button>
          )}
          {filtered.length > 0 && (
            <>
              <button onClick={handlePrint} style={{ background: "white", color: "#475569", border: "1.5px solid #E2E8F0", borderRadius: "12px", padding: "10px 18px", fontSize: "13px", fontWeight: "600", fontFamily: F, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease" }}>
                <Printer style={{ width: 14, height: 14 }} /> طباعة
              </button>
              <button onClick={exportToExcel} style={{ background: "white", color: "#475569", border: "1.5px solid #E2E8F0", borderRadius: "12px", padding: "10px 18px", fontSize: "13px", fontWeight: "600", fontFamily: F, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease" }}>
                <Download style={{ width: 14, height: 14 }} /> تصدير Excel
              </button>
            </>
          )}
          <button onClick={() => { setForm({ ...defaultForm }); setItems([]); setEditingId(null); setShowForm(true); }} style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a5f 100%)`, color: "white", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", fontFamily: F, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 12px rgba(13,27,46,0.2)", transition: "all 0.2s ease" }}>
            <Plus style={{ width: 16, height: 16 }} /> طلبية جديدة
          </button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div style={{ display: "flex", gap: "4px", direction: "rtl", background: "#F1F5F9", borderRadius: "12px", padding: "4px", marginBottom: "24px", width: "fit-content" }}>
        {[
          { id: "orders", label: "الطلبيات", icon: <ShoppingCart style={{ width: 14, height: 14 }} /> },
          { id: "reports", label: "التقارير", icon: <BarChart3 style={{ width: 14, height: 14 }} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 24px", borderRadius: "10px", border: "none", cursor: "pointer",
            fontFamily: F, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.2s ease",
            ...(activeTab === tab.id
              ? { background: "white", color: NAVY, fontWeight: "700", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
              : { background: "transparent", color: "#94A3B8", fontWeight: "500" }),
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ Orders Tab ═══════ */}
      {activeTab === "orders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ─── KPI Cards ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {kpiCards.map((card, i) => (
              <div key={i} onMouseEnter={() => setHoveredCard(i)} onMouseLeave={() => setHoveredCard(null)} style={{
                background: "white", borderRadius: "16px", padding: "24px", position: "relative",
                overflow: "hidden", border: "1px solid #F1F5F9", transition: "all 0.3s ease",
                borderTop: `3px solid ${card.accent}`, cursor: "default",
                ...(hoveredCard === i ? { transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.08)", borderColor: NAVY } : {}),
              }}>
                <p style={{ fontSize: "28px", fontWeight: "800", color: NAVY, fontFamily: F, lineHeight: "1.2", marginBottom: "4px" }}>{card.value}</p>
                <p style={{ fontSize: "13px", fontWeight: "500", color: "#64748B", fontFamily: F }}>{card.label}</p>
                <span style={{ position: "absolute", left: "16px", bottom: "12px", fontSize: "32px", opacity: 0.08, color: NAVY }}>{card.icon}</span>
              </div>
            ))}
          </div>

          {/* ─── Search + View Toggle ─── */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px", maxWidth: "400px", position: "relative", direction: "rtl" }}>
              <Search style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none", width: 16, height: 16 }} />
              <input
                placeholder="ابحث بالاسم أو رقم الطلبية..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "12px 44px 12px 36px", borderRadius: "12px", border: "1.5px solid #E2E8F0",
                  fontSize: "14px", fontFamily: F, color: "#1E293B", background: "#FAFBFC", outline: "none",
                  textAlign: "right", transition: "all 0.2s ease",
                }}
                onFocus={e => { e.target.style.borderColor = NAVY; e.target.style.background = "white"; e.target.style.boxShadow = "0 0 0 3px rgba(13,27,46,0.08)"; }}
                onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.background = "#FAFBFC"; e.target.style.boxShadow = "none"; }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {/* View toggle */}
            <div style={{ display: "inline-flex", borderRadius: "10px", overflow: "hidden", border: "1.5px solid #E2E8F0" }}>
              {([{ id: "table" as const, icon: <LayoutList style={{ width: 14, height: 14 }} />, label: "جدول" }, { id: "cards" as const, icon: <LayoutGrid style={{ width: 14, height: 14 }} />, label: "بطاقات" }]).map(v => (
                <button key={v.id} onClick={() => setViewMode(v.id)} style={{
                  padding: "8px 14px", border: "none", cursor: "pointer", fontFamily: F, fontSize: "13px",
                  display: "flex", alignItems: "center", gap: "4px",
                  ...(viewMode === v.id ? { background: NAVY, color: "white", fontWeight: "600" } : { background: "white", color: "#64748B", fontWeight: "500" }),
                }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            <span style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F, marginRight: "auto" }}>{filtered.length} طلبية</span>
          </div>

          {/* ─── Filter Chips ─── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", direction: "rtl" }}>
            {[
              { key: "all", label: "الكل" },
              ...ALL_STATUSES.map(s => ({ key: s, label: s })),
            ].map(chip => {
              const isActive = statusFilter === chip.key;
              const cfg = chip.key !== "all" ? getStatusConfig(chip.key) : { dot: NAVY };
              const count = chip.key === "all" ? orders.length : (counts[chip.key] || 0);
              return (
                <button key={chip.key} onClick={() => setStatusFilter(chip.key)} style={{
                  borderRadius: "24px", padding: "8px 18px", fontSize: "13px", fontFamily: F, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease",
                  ...(isActive
                    ? { background: NAVY, color: "white", border: "none", fontWeight: "600", boxShadow: "0 2px 8px rgba(13,27,46,0.15)" }
                    : { background: "white", color: "#475569", border: "1.5px solid #E2E8F0", fontWeight: "500" }),
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "white" : cfg.dot, flexShrink: 0 }} />
                  {chip.label}
                  <span style={{ fontSize: "11px", opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* ─── Empty states ─── */}
          {!loading && orders.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <Package style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.3, color: "#94A3B8" }} />
              <p style={{ fontSize: "18px", fontWeight: "700", color: "#64748B", fontFamily: F, marginBottom: "8px" }}>لا توجد طلبيات</p>
              <p style={{ fontSize: "14px", color: "#94A3B8", fontFamily: F, marginBottom: "16px" }}>جرب إنشاء طلبية جديدة</p>
              <button onClick={() => { setForm({ ...defaultForm }); setItems([]); setEditingId(null); setShowForm(true); }} style={{ background: `linear-gradient(135deg, ${NAVY}, #1e3a5f)`, color: "white", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", fontFamily: F, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <Plus style={{ width: 16, height: 16 }} /> طلبية جديدة
              </button>
            </div>
          )}

          {!loading && orders.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <Search style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.3, color: "#94A3B8" }} />
              <p style={{ fontSize: "18px", fontWeight: "700", color: "#64748B", fontFamily: F, marginBottom: "8px" }}>لا توجد طلبيات</p>
              <p style={{ fontSize: "14px", color: "#94A3B8", fontFamily: F, marginBottom: "16px" }}>جرب تغيير الفلتر أو إنشاء طلبية جديدة</p>
              <button onClick={() => { setSearch(""); setStatusFilter("all"); }} style={{ background: "white", color: "#475569", border: "1.5px solid #E2E8F0", borderRadius: "12px", padding: "10px 18px", fontSize: "13px", fontWeight: "600", fontFamily: F, cursor: "pointer" }}>
                مسح الفلاتر
              </button>
            </div>
          )}

          {/* ═══════ TABLE VIEW ═══════ */}
          {!loading && paged.length > 0 && viewMode === "table" && (
            <div style={{ background: "white", borderRadius: "16px", overflow: "hidden", border: "1px solid #F1F5F9", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", direction: "rtl", textAlign: "right", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: NAVY }}>
                      <th style={{ padding: "14px 12px", textAlign: "right", width: "40px" }}>
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-primary" />
                      </th>
                      {[
                        { label: "رقم الطلبية", field: "order_number" as SortKey, w: "140px" },
                        { label: "العميل", field: "customer_name" as SortKey, w: undefined },
                        { label: "التاريخ", field: "order_date" as SortKey, w: "120px" },
                        { label: "الإجمالي", field: "total" as SortKey, w: "110px" },
                        { label: "الحالة", field: "status" as SortKey, w: "120px" },
                      ].map(col => (
                        <th key={col.label} onClick={() => toggleSort(col.field)} style={{
                          padding: "14px 16px", fontSize: "13px", fontWeight: "600", fontFamily: F,
                          textAlign: "right", whiteSpace: "normal", wordBreak: "keep-all" as any,
                          color: "white", borderBottom: "none", letterSpacing: "0.3px",
                          cursor: "pointer", width: col.w, minWidth: col.w,
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {col.label}
                            <ArrowUpDown style={{ width: 12, height: 12, opacity: sortKey === col.field ? 1 : 0.3 }} />
                          </span>
                        </th>
                      ))}
                      <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "100px" }}>الدفع</th>
                      <th onClick={() => toggleSort("source")} style={{ padding: "14px 16px", fontSize: "13px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", cursor: "pointer", width: "100px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>المصدر <ArrowUpDown style={{ width: 12, height: 12, opacity: sortKey === "source" ? 1 : 0.3 }} /></span>
                      </th>
                      <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "180px", minWidth: "180px" }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((o, i) => {
                      const isSelected = selected.has(o.id);
                      const isHovered = hoveredRow === o.id;
                      const sc = getStatusConfig(o.status);
                      const pc = getPaymentConfig(o.payment_status);
                      return (
                        <tr key={o.id} onMouseEnter={() => setHoveredRow(o.id)} onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            background: isSelected ? "#F0F4FF" : isHovered ? "#F8FAFF" : (i % 2 === 0 ? "#FFFFFF" : "#FAFBFC"),
                            transition: "background 0.15s ease", borderBottom: "1px solid #F1F5F9",
                          }}>
                          <td style={{ padding: "14px 12px" }} onClick={e => e.stopPropagation()}>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(o.id)} />
                          </td>
                          <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: "12px", color: "#3B82F6", fontWeight: "600" }}>{o.order_number || "—"}</td>
                          <td style={{ padding: "14px 16px", fontWeight: "600", color: NAVY, fontSize: "14px", fontFamily: F }}>{o.customer_name}</td>
                          <td style={{ padding: "14px 16px", fontSize: "13px", color: "#64748B", fontFamily: F }}>{fmtDateDisplay(o.order_date)}</td>
                          <td style={{ padding: "14px 16px", fontWeight: "700", color: NAVY, fontSize: "15px", fontFamily: F, direction: "ltr", textAlign: "left" }}>{Number(o.total).toLocaleString()} ₪</td>
                          <td style={{ padding: "14px 16px" }}>
                            <Select value={o.status} onValueChange={v => updateStatus(o.id, v)}>
                              <SelectTrigger style={{ height: "auto", border: "none", background: "transparent", padding: 0, width: "auto", minWidth: "unset" }} className="shadow-none">
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 12px",
                                  borderRadius: "20px", fontSize: "12px", fontWeight: "600", fontFamily: F,
                                  background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                                }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }} />
                                  {o.status}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="z-50 bg-background">
                                {ALL_STATUSES.map(s => {
                                  const c = getStatusConfig(s);
                                  return (
                                    <SelectItem key={s} value={s}>
                                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot }} />
                                        {s}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span onClick={() => setShowPayment(o)} style={{
                              display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
                              padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "600",
                              background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`, cursor: "pointer", fontFamily: F,
                            }}>
                              <span>{o.payment_status}</span>
                              {(o as any)._payment?.method === "partial" && (o as any).deposit_amount > 0 && (
                                <span style={{ fontSize: "10px", fontWeight: "500", opacity: 0.85 }}>
                                  عربون: ₪{Number((o as any).deposit_amount).toLocaleString()} | آجل: ₪{Number((o as any).remaining_amount || 0).toLocaleString()}
                                </span>
                              )}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px", fontSize: "13px", color: "#64748B", fontFamily: F }}>{o.source}</td>
                          <td style={{ padding: "14px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              {[
                                { icon: <Eye style={{ width: 14, height: 14 }} />, title: "عرض", onClick: () => navigate(`/orders/${o.id}`) },
                                ...((o.status === "جاهز للفوترة" || o.status === "جديد" || o.status === "قيد التجهيز") && !o.invoice_id ? [{
                                  icon: <FileText style={{ width: 14, height: 14 }} />, title: "فاتورة",
                                  onClick: async () => { await fetchOrderItems(o.id); setShowInvoiceModal(o); }
                                }] : []),
                                ...((o.status === "مفوتر" || o.status === "مدفوع جزئياً") ? [{
                                  icon: <Banknote style={{ width: 14, height: 14 }} />, title: "قبض",
                                  onClick: () => setShowReceiptModal(o)
                                }] : []),
                                { icon: <Pencil style={{ width: 14, height: 14 }} />, title: "تعديل", onClick: () => openEdit(o) },
                                { icon: <Trash2 style={{ width: 14, height: 14 }} />, title: "حذف", onClick: () => handleDelete(o.id), danger: true },
                              ].map((act, ai) => (
                                <button key={ai} onClick={act.onClick} title={act.title} style={{
                                  width: "32px", height: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  borderRadius: "8px", cursor: "pointer", color: (act as any).danger ? "#EF4444" : "#94A3B8",
                                  transition: "all 0.2s ease", border: "none", background: "transparent",
                                }}
                                  onMouseEnter={e => { (e.target as any).style.background = "#F1F5F9"; (e.target as any).style.color = (act as any).danger ? "#DC2626" : NAVY; }}
                                  onMouseLeave={e => { (e.target as any).style.background = "transparent"; (e.target as any).style.color = (act as any).danger ? "#EF4444" : "#94A3B8"; }}
                                >
                                  {act.icon}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
                      <td colSpan={4} style={{ padding: "14px 16px", textAlign: "right", fontWeight: "700", fontSize: "14px", color: NAVY, fontFamily: F }}>
                        المجموع ({filtered.length} طلبية)
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: "800", fontSize: "16px", color: NAVY, fontFamily: F, direction: "ltr", textAlign: "left" }}>
                        ₪{filtered.reduce((s, o) => s + Number(o.total), 0).toLocaleString()}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              {sorted.length > PER_PAGE && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                  <p style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F }}>
                    عرض {Math.min((page - 1) * PER_PAGE + 1, sorted.length)}–{Math.min(page * PER_PAGE, sorted.length)} من {sorted.length}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronRight style={{ width: 14, height: 14 }} /> السابق
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(n => (
                      <button key={n} onClick={() => setPage(n)} style={{
                        width: "32px", height: "32px", borderRadius: "8px", border: "none", cursor: "pointer",
                        fontFamily: F, fontSize: "13px", fontWeight: "600",
                        ...(page === n ? { background: NAVY, color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }),
                      }}>{n}</button>
                    ))}
                    <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      التالي <ChevronLeft style={{ width: 14, height: 14 }} />
                    </Button>
                  </div>
                  <p style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F }}>
                    {selected.size > 0 ? `${selected.size} محدد` : `صفحة ${page} من ${totalPages}`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══════ CARD VIEW ═══════ */}
          {!loading && paged.length > 0 && viewMode === "cards" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {paged.map((o) => {
                const sc = getStatusConfig(o.status);
                const pc = getPaymentConfig(o.payment_status);
                return (
                  <div key={o.id} style={{
                    background: "white", borderRadius: "16px", padding: "20px 24px", position: "relative",
                    overflow: "hidden", border: "1px solid #F1F5F9", transition: "all 0.2s ease", cursor: "pointer",
                  }}
                    onMouseEnter={e => { (e.currentTarget as any).style.boxShadow = "0 4px 15px rgba(0,0,0,0.06)"; (e.currentTarget as any).style.borderColor = "#CBD5E1"; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.boxShadow = "none"; (e.currentTarget as any).style.borderColor = "#F1F5F9"; }}
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    {/* Accent border */}
                    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "4px", borderRadius: "0 16px 16px 0", background: sc.dot }} />

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "16px", fontWeight: "700", color: "#1E293B", fontFamily: F }}>{o.customer_name}</span>
                        <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", background: "#F1F5F9", color: "#64748B", fontFamily: "monospace" }}>
                          {o.order_number || "—"}
                        </span>
                      </div>
                      <span style={{ fontSize: "22px", fontWeight: "800", color: NAVY, fontFamily: F }}>{Number(o.total).toLocaleString()} ₪</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px", color: "#64748B", fontFamily: F, marginBottom: "12px" }}>
                      {o.customer_phone && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>📞 {o.customer_phone}</span>}
                      {o.customer_address && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>📍 {o.customer_address}</span>}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 12px",
                        borderRadius: "20px", fontSize: "12px", fontWeight: "600", fontFamily: F,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }} />
                        {o.status}
                      </span>
                      <span style={{
                        display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
                        padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "600",
                        background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`, fontFamily: F,
                      }}>
                        <span>{o.payment_status}</span>
                        {(o as any)._payment?.method === "partial" && (o as any).deposit_amount > 0 && (
                          <span style={{ fontSize: "10px", fontWeight: "500", opacity: 0.85 }}>
                            عربون: ₪{Number((o as any).deposit_amount).toLocaleString()} | آجل: ₪{Number((o as any).remaining_amount || 0).toLocaleString()}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F }}>🕐 {fmtDateDisplay(o.order_date)}</span>
                      {o.source && <span style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F }}>📱 {o.source}</span>}
                    </div>

                    {/* Card actions */}
                    <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid #F1F5F9", marginTop: "4px" }} onClick={e => e.stopPropagation()}>
                      {[
                        { label: "عرض", icon: "👁️", onClick: () => navigate(`/orders/${o.id}`) },
                        ...((o.status === "جاهز للفوترة" || o.status === "جديد" || o.status === "قيد التجهيز") && !o.invoice_id ? [{ label: "فوترة", icon: "📄", onClick: async () => { await fetchOrderItems(o.id); setShowInvoiceModal(o); } }] : []),
                        { label: "تعديل", icon: "✏️", onClick: () => openEdit(o) },
                        ...(o.customer_phone ? [{ label: "واتساب", icon: "💬", onClick: () => { setShowWhatsApp(o); setWaTemplate("feedback"); setWaMessage(getWhatsAppMessage(o, "feedback")); } }] : []),
                      ].map((act, ai) => (
                        <button key={ai} onClick={act.onClick} style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                          padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: "600", fontFamily: F,
                          cursor: "pointer", border: "1px solid #E2E8F0", background: "white", color: "#475569",
                          transition: "all 0.2s ease",
                        }}
                          onMouseEnter={e => { (e.target as any).style.background = "#F8FAFC"; }}
                          onMouseLeave={e => { (e.target as any).style.background = "white"; }}
                        >
                          {act.icon} {act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Card pagination */}
              {sorted.length > PER_PAGE && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px" }}>
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
                  <span style={{ fontSize: "13px", color: "#64748B", fontFamily: F }}>صفحة {page} من {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي</Button>
                </div>
              )}
            </div>
          )}

          {/* Bulk selection bar */}
          {selected.size > 0 && (
            <div style={{
              position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 50,
              background: "white", border: `2px solid ${NAVY}33`, borderRadius: "16px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: "12px 20px",
              display: "flex", alignItems: "center", gap: "16px",
            }}>
              <span style={{ fontSize: "14px", fontWeight: "700", color: NAVY, fontFamily: F }}>
                ✓ {selected.size} طلبية — ₪{orders.filter(o => selected.has(o.id)).reduce((s, o) => s + Number(o.total), 0).toLocaleString()}
              </span>
              <button onClick={() => setSelected(new Set())} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════ Reports Tab ═══════ */}
      {activeTab === "reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">إجمالي المبيعات</span></div>
              <p className="text-xl font-bold text-foreground">{reportData.totalRevenue.toLocaleString()} ₪</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">المحصّل</span></div>
              <p className="text-xl font-bold text-primary">{reportData.totalPaid.toLocaleString()} ₪</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><CalendarDays className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">الذمم المدينة</span></div>
              <p className="text-xl font-bold text-warning">{reportData.totalUnpaid.toLocaleString()} ₪</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">هامش الربح الإجمالي</span></div>
              <p className="text-xl font-bold text-primary">{reportData.totalMargin.toLocaleString()} ₪ <span className="text-xs font-normal text-muted-foreground">({reportData.marginPct}%)</span></p>
            </CardContent></Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">💰 الإيرادات مقابل التكاليف الشهرية</h3>
              {reportData.monthlyTrend.some(m => m.revenue > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reportData.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="revenue" name="الإيرادات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" name="التكاليف" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات كافية</p>}
            </CardContent></Card>

            <Card><CardContent className="p-4">
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
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>}
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">📋 الذمم المدينة</h3>
              {reportData.receivables.length > 0 ? (
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {reportData.receivables.map(c => (
                    <div key={c.name} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                      <div><p className="text-sm font-medium text-foreground">{c.name}</p><p className="text-[10px] text-muted-foreground">{c.count} طلبية</p></div>
                      <div className="text-left"><p className="text-sm font-bold text-destructive">{c.remaining.toLocaleString()} ₪</p><p className="text-[10px] text-muted-foreground">متبقي</p></div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد ذمم مدينة 🎉</p>}
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">🏭 هامش الربح لكل طلبية</h3>
              {reportData.orderMargins.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reportData.orderMargins}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="revenue" name="سعر البيع" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" name="التكلفة" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات تكاليف</p>}
            </CardContent></Card>

            <Card><CardContent className="p-4">
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
                        <p className="text-sm font-bold text-foreground">{c.total.toLocaleString()} ₪</p>
                        <p className="text-[10px] text-muted-foreground">{c.count} طلبية</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>}
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">📊 مصادر الطلبيات</h3>
              {reportData.sourceDist.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={reportData.sourceDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {reportData.sourceDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات</p>}
            </CardContent></Card>
          </div>
        </div>
      )}

      {/* ═══════ Detail Dialog ═══════ */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تفاصيل الطلبية {showDetail?.order_number}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {([["العميل", showDetail.customer_name], ["الهاتف", showDetail.customer_phone], ["العنوان", showDetail.customer_address], ["الحالة", showDetail.status], ["الدفع", showDetail.payment_status], ["طريقة الدفع", showDetail.payment_method], ["طريقة الشحن", showDetail.shipping_method], ["رقم التتبع", showDetail.tracking_number]] as [string, string | null][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground">{l}</span><span className="font-medium">{v || "—"}</span>
                  </div>
                ))}
              </div>
              <h4 className="font-medium text-foreground text-sm">البنود</h4>
              <Table><TableHeader><TableRow>
                <TableHead className="text-right">المنتج</TableHead><TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">السعر</TableHead><TableHead className="text-right">الإجمالي</TableHead>
              </TableRow></TableHeader><TableBody>
                {orderItems.map(i => (
                  <TableRow key={i.id}>
                    <TableCell>{i.product_name}</TableCell><TableCell>{i.quantity}</TableCell>
                    <TableCell>{Number(i.unit_price).toLocaleString()}</TableCell><TableCell>{Number(i.total).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {orderItems.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs">لا توجد بنود</TableCell></TableRow>}
              </TableBody></Table>
              <div className="text-sm space-y-1 border-t border-border pt-2">
                <div className="flex justify-between"><span className="text-muted-foreground">المجموع</span><span>{Number(showDetail.subtotal).toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الخصم</span><span>{Number(showDetail.discount).toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span>{Number(showDetail.shipping_cost).toLocaleString()} ₪</span></div>
                <div className="flex justify-between font-bold text-foreground"><span>الإجمالي</span><span>{Number(showDetail.total).toLocaleString()} ₪</span></div>
              </div>
              {Number(showDetail.production_cost) > 0 && user && (
                <ProductionCostSection order={showDetail} userId={user.id} onSuccess={() => { setShowDetail(null); fetchOrders(); }} />
              )}
              <div className="flex gap-2 flex-wrap pt-2">
                {!showDetail.invoice_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={async () => { await fetchOrderItems(showDetail.id); setShowDetail(null); setShowInvoiceModal(showDetail); }}>
                    <FileText className="h-3 w-3" /> 🧾 تحويل لفاتورة مبيعات
                  </Button>
                )}
                {showDetail.invoice_id && showDetail.payment_status !== "مدفوع" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowDetail(null); setShowReceiptModal(showDetail); }}>
                    <Banknote className="h-3 w-3" /> 💰 تسجيل قبض
                  </Button>
                )}
                {showDetail.payment_status !== "مدفوع" && !showDetail.invoice_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowDetail(null); setShowPayment(showDetail); }}>
                    <CreditCard className="h-3 w-3" /> تحديث الدفع
                  </Button>
                )}
                {showDetail.customer_phone && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowDetail(null); setShowWhatsApp(showDetail); setWaTemplate("feedback"); setWaMessage(getWhatsAppMessage(showDetail, "feedback")); }}>
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
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> إرسال رسالة واتساب</DialogTitle></DialogHeader>
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
                    <Button key={t.id} variant={waTemplate === t.id ? "default" : "outline"} size="sm" className="gap-1.5 text-xs justify-start"
                      onClick={() => { setWaTemplate(t.id); setWaMessage(getWhatsAppMessage(showWhatsApp, t.id)); }}>
                      <t.icon className="h-3.5 w-3.5" /> {t.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">محتوى الرسالة (يمكنك تعديلها)</label>
                <Textarea value={waMessage} onChange={e => setWaMessage(e.target.value)} rows={8} className="text-sm leading-relaxed" dir="rtl" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowWhatsApp(null)}>إلغاء</Button>
                <Button className="gap-2" onClick={() => sendWhatsApp(showWhatsApp, waMessage)}><Send className="h-4 w-4" /> إرسال عبر واتساب</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Payment Dialog ═══════ */}
      <Dialog open={!!showPayment} onOpenChange={() => setShowPayment(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> تحديث حالة الدفع</DialogTitle></DialogHeader>
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
                  <Button key={p.status} variant={p.variant} className="justify-start gap-2" onClick={() => updatePaymentStatus(showPayment.id, p.status)} disabled={showPayment.payment_status === p.status}>
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

      <ConvertToInvoiceModal open={!!showInvoiceModal} onClose={() => setShowInvoiceModal(null)} order={showInvoiceModal} orderItems={orderItems} userId={user?.id || ""} onSuccess={fetchOrders} />
      <RecordReceiptModal open={!!showReceiptModal} onClose={() => setShowReceiptModal(null)} order={showReceiptModal} userId={user?.id || ""} onSuccess={fetchOrders} />
    </div>
  );
};

export default OrdersPage;
