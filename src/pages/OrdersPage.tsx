import { useState, useEffect, useMemo } from "react";
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
  Download, Printer, Hash, FileText, Pencil, Banknote, Factory
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import ConvertToInvoiceModal from "@/components/orders/ConvertToInvoiceModal";
import RecordReceiptModal from "@/components/orders/RecordReceiptModal";
import ProductionCostSection from "@/components/orders/ProductionCostSection";

const statusColors: Record<string, string> = {
  "جديد": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "قيد التجهيز": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "جاهز للفوترة": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "مفوتر": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "مدفوع جزئياً": "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  "مدفوع كاملاً": "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "ملغي": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "مؤكد": "bg-primary/10 text-primary",
  "جاهز للشحن": "bg-indigo-100 text-indigo-700",
  "تم الشحن": "bg-purple-100 text-purple-700",
  "تم التسليم": "bg-green-100 text-green-700",
  "مرتجع": "bg-red-100 text-red-700",
};

const dotColors: Record<string, string> = {
  "جديد": "bg-blue-500",
  "قيد التجهيز": "bg-orange-500",
  "جاهز للفوترة": "bg-purple-500",
  "مفوتر": "bg-amber-500",
  "مدفوع جزئياً": "bg-emerald-500",
  "مدفوع كاملاً": "bg-green-600",
  "ملغي": "bg-red-500",
  "مؤكد": "bg-primary",
  "جاهز للشحن": "bg-indigo-500",
  "تم الشحن": "bg-purple-500",
  "تم التسليم": "bg-green-500",
  "مرتجع": "bg-red-500",
};

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
  const [showInvoiceModal, setShowInvoiceModal] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<Order | null>(null);
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

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const exportToExcel = () => {
    import("xlsx").then(XLSX => {
      const rows = filtered.map(o => ({
        "رقم الطلبية": o.order_number || "",
        "العميل": o.customer_name || "",
        "التاريخ": o.order_date || "",
        "الإجمالي": Number(o.total) || 0,
        "الحالة": o.status || "",
        "الدفع": o.payment_status || "",
        "المصدر": o.source || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
      XLSX.writeFile(wb, `الطلبيات-${new Date().toISOString().split("T")[0]}.xlsx`);
    });
  };

  const handlePrint = () => {
    const rows = filtered.map(o => `
      <tr>
        <td>${o.order_number || "—"}</td>
        <td>${o.customer_name || "—"}</td>
        <td>${o.order_date || "—"}</td>
        <td class="font-mono font-bold">₪${Number(o.total).toLocaleString()}</td>
        <td>${o.status || "—"}</td>
        <td>${o.payment_status || "—"}</td>
        <td>${o.source || "—"}</td>
      </tr>
    `).join("");
    const totalVal = fmt(filtered.reduce((s, o) => s + Number(o.total), 0));
    const contentHtml = `
      <div class="print-header">
        <div><div class="company-name">أموالي</div><div class="report-title">الطلبيات</div></div>
        <div class="print-date">${filtered.length} طلبية</div>
      </div>
      <table>
        <thead><tr><th>رقم الطلبية</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>الدفع</th><th>المصدر</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right">المجموع (${filtered.length} طلبية)</td><td class="font-mono font-bold">${totalVal}</td><td colspan="3"></td></tr></tfoot>
      </table>
    `;
    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({ title: "الطلبيات", companyName: "أموالي", contentHtml });
    });
  };

  const counts = {
    new: orders.filter(o => o.status === "جديد").length,
    processing: orders.filter(o => o.status === "قيد التجهيز").length,
    readyForInvoice: orders.filter(o => o.status === "جاهز للفوترة").length,
    invoiced: orders.filter(o => o.status === "مفوتر").length,
    partiallyPaid: orders.filter(o => o.status === "مدفوع جزئياً").length,
    fullyPaid: orders.filter(o => o.status === "مدفوع كاملاً").length,
  };

  // ─── Reports data ───
  const reportData = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== "ملغي");
    const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalPaid = activeOrders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
    const totalUnpaid = totalRevenue - totalPaid;
    const avgOrderValue = activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0;

    // Production cost totals
    const totalProductionCost = activeOrders.reduce((s, o) => s + Number(o.production_cost || 0), 0);
    const totalMargin = totalRevenue - totalProductionCost;
    const marginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : "0";

    // Status distribution
    const statusDist = ALL_STATUSES.map(s => ({ name: s, value: orders.filter(o => o.status === s).length })).filter(d => d.value > 0);

    // Payment distribution
    const paidOrders = orders.filter(o => o.payment_status === "مدفوع");
    const unpaidOrders = orders.filter(o => o.payment_status !== "مدفوع" && o.status !== "ملغي");
    const paymentDist = [
      { name: "مدفوع", value: paidOrders.length },
      { name: "غير مدفوع", value: unpaidOrders.length },
    ].filter(d => d.value > 0);

    // Source distribution
    const sourceDist = SOURCES.map(s => ({ name: s, value: orders.filter(o => o.source === s).length })).filter(d => d.value > 0);

    // Monthly trend (last 6 months)
    const monthlyTrend: { month: string; orders: number; revenue: number; cost: number }[] = [];
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
        cost: monthOrders.reduce((s, o) => s + Number(o.production_cost || 0), 0),
      });
    }

    // Top customers
    const customerMap = new Map<string, { count: number; total: number; remaining: number }>();
    activeOrders.forEach(o => {
      const existing = customerMap.get(o.customer_name) || { count: 0, total: 0, remaining: 0 };
      customerMap.set(o.customer_name, {
        count: existing.count + 1,
        total: existing.total + Number(o.total),
        remaining: existing.remaining + Math.max(0, Number(o.total) - Number(o.paid_amount || 0)),
      });
    });
    const topCustomers = Array.from(customerMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Receivables (customers with unpaid amounts)
    const receivables = Array.from(customerMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .filter(c => c.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);

    // Per-order margins
    const orderMargins = activeOrders
      .filter(o => Number(o.production_cost || 0) > 0)
      .map(o => ({
        name: o.order_number || o.id.slice(0, 8),
        revenue: Number(o.total),
        cost: Number(o.production_cost || 0),
        margin: Number(o.total) - Number(o.production_cost || 0),
      }));

    return {
      totalRevenue, totalPaid, totalUnpaid, avgOrderValue,
      totalProductionCost, totalMargin, marginPct,
      statusDist, paymentDist, sourceDist, monthlyTrend,
      topCustomers, receivables, orderMargins,
    };
  }, [orders]);

  return (
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title="الطلبيات" breadcrumb={["المبيعات", "الطلبيات"]} />

      {/* Actions bar — matches voucher page */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">إدارة الطلبيات والمبيعات</p>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" /> طباعة
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={exportToExcel}>
                <Download className="h-3.5 w-3.5" /> تصدير Excel
              </Button>
            </>
          )}
          <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => { setForm({ ...defaultForm }); setItems([]); setEditingId(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> طلبية جديدة
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="orders" className="gap-1"><ShoppingCart className="h-3.5 w-3.5" /> الطلبيات</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> التقارير</TabsTrigger>
        </TabsList>

        {/* ═══════ Orders Tab ═══════ */}
        <TabsContent value="orders" className="space-y-5 mt-4">
          {/* KPI Cards — matches voucher page */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "إجمالي الطلبيات", value: fmt(orders.filter(o => o.status !== "ملغي" && o.status !== "مرتجع").reduce((s, o) => s + Number(o.total), 0)), icon: DollarSign, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
              { label: "هذا الشهر", value: fmt(orders.filter(o => { const d = new Date(o.order_date); const now = new Date(); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && o.status !== "ملغي"; }).reduce((s, o) => s + Number(o.total), 0)), icon: CalendarDays, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
              { label: "عدد الطلبيات", value: orders.length, icon: Hash, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
              { label: "متوسط قيمة الطلب", value: orders.length > 0 ? fmt(orders.filter(o => o.status !== "ملغي").reduce((s, o) => s + Number(o.total), 0) / Math.max(1, orders.filter(o => o.status !== "ملغي").length)) : "₪0", icon: FileText, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
            ].map((k, i) => (
              <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                    <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  </div>
                  <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
                </div>
              </div>
            ))}
          </div>

          {/* Filters — matches voucher page */}
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-3 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  placeholder="ابحث بالاسم أو رقم الطلبية..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pr-10 rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status pills + dropdown filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
                  {[
                    { key: "all", label: "الكل" },
                    { key: "جديد", label: "جديد" },
                    { key: "قيد التجهيز", label: "قيد التجهيز" },
                    { key: "جاهز للفوترة", label: "جاهز للفوترة" },
                    { key: "مفوتر", label: "مفوتر" },
                    { key: "مدفوع جزئياً", label: "مدفوع جزئياً" },
                    { key: "مدفوع كاملاً", label: "مدفوع كاملاً" },
                  ].map(s => (
                    <button
                      key={s.key}
                      onClick={() => setStatusFilter(s.key)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                        statusFilter === s.key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground mr-auto">{filtered.length} طلبية</span>
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {!loading && orders.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">لا توجد طلبيات بعد</h3>
              <p className="text-xs text-muted-foreground mb-4">أضف أول طلبية لبدء تتبع المبيعات</p>
              <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => { setForm({ ...defaultForm }); setItems([]); setEditingId(null); setShowForm(true); }}>
                <Plus className="h-4 w-4" /> طلبية جديدة
              </Button>
            </div>
          )}

          {/* No results */}
          {!loading && orders.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
              <p className="text-sm text-muted-foreground">لا توجد طلبيات تطابق البحث</p>
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>مسح الفلاتر</Button>
            </div>
          )}

          {/* Orders Table — matches voucher page */}
          {!loading && paged.length > 0 && (
            <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-2 py-3 text-right w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-primary" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="رقم الطلبية" field="order_number" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="العميل" field="customer_name" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="التاريخ" field="order_date" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الإجمالي" field="total" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">الدفع</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="المصدر" field="source" /></th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                  ) : paged.map((o, i) => {
                    const isSelected = selected.has(o.id);
                    return (
                    <tr
                      key={o.id}
                      className={`border-b border-border/50 transition-colors ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                    >
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(o.id)} /></td>
                      <td className="px-3 py-3 font-mono text-xs text-primary">{o.order_number || "—"}</td>
                      <td className="px-3 py-3 text-sm font-medium text-foreground">{o.customer_name}</td>
                      <td className="px-3 py-3 text-xs text-foreground tabular-nums">{fmtDateDisplay(o.order_date)}</td>
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">{Number(o.total).toLocaleString()} ₪</td>
                      <td className="px-3 py-3">
                        <Select value={o.status} onValueChange={v => updateStatus(o.id, v)}>
                          <SelectTrigger className="h-7 text-[10px] w-[130px] border-0 bg-transparent p-0">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[o.status] || "bg-muted text-muted-foreground"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotColors[o.status] || "bg-muted-foreground"}`} />
                              {o.status}
                            </span>
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
                      <td className="px-3 py-3 text-xs text-muted-foreground">{o.source}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => { setShowDetail(o); fetchOrderItems(o.id); }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="عرض التفاصيل"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {/* Convert to invoice — only for "جاهز للفوترة" */}
                          {(o.status === "جاهز للفوترة" || o.status === "جديد" || o.status === "قيد التجهيز") && !o.invoice_id && (
                            <button
                              onClick={async () => { await fetchOrderItems(o.id); setShowInvoiceModal(o); }}
                              className="p-1.5 rounded-lg hover:bg-amber-100 text-muted-foreground hover:text-amber-700 transition-colors"
                              title="تحويل لفاتورة"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Record receipt — only for invoiced/partially paid */}
                          {(o.status === "مفوتر" || o.status === "مدفوع جزئياً") && (
                            <button
                              onClick={() => setShowReceiptModal(o)}
                              className="p-1.5 rounded-lg hover:bg-green-100 text-muted-foreground hover:text-green-700 transition-colors"
                              title="تسجيل قبض"
                            >
                              <Banknote className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setShowWhatsApp(o);
                              setWaTemplate("feedback");
                              setWaMessage(getWhatsAppMessage(o, "feedback"));
                            }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="واتساب"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
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
                            }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(o.id)}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                      <td colSpan={4} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} طلبية)</td>
                      <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, o) => s + Number(o.total), 0).toLocaleString()}</td>
                      <td colSpan={4} className="px-3 py-3 text-xs font-normal text-muted-foreground">إجمالي قيمة الطلبيات</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination — matches voucher page */}
              {sorted.length > PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
                  <p className="text-xs text-muted-foreground">عرض {Math.min((page - 1) * PER_PAGE + 1, sorted.length)}–{Math.min(page * PER_PAGE, sorted.length)} من {sorted.length}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق</Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(n => (
                      <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>{n}</Button>
                    ))}
                    <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} محدد` : `صفحة ${page} من ${totalPages}`}</p>
                </div>
              )}
            </div>
          )}

          {/* Bulk selection bar */}
          {selected.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border-2 border-primary/30 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
              <span className="text-sm font-bold text-foreground">✓ {selected.size} طلبية — ₪{orders.filter(o => selected.has(o.id)).reduce((s, o) => s + Number(o.total), 0).toLocaleString()}</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          )}
        </TabsContent>

        {/* ═══════ Reports Tab ═══════ */}
        <TabsContent value="reports" className="space-y-6 mt-4">
          {/* Report KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">إجمالي المبيعات</span></div>
                <p className="text-xl font-bold text-foreground">{reportData.totalRevenue.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">المحصّل</span></div>
                <p className="text-xl font-bold text-primary">{reportData.totalPaid.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CalendarDays className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">الذمم المدينة</span></div>
                <p className="text-xl font-bold text-warning">{reportData.totalUnpaid.toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">هامش الربح الإجمالي</span></div>
                <p className="text-xl font-bold text-primary">{reportData.totalMargin.toLocaleString()} ₪ <span className="text-xs font-normal text-muted-foreground">({reportData.marginPct}%)</span></p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Monthly Revenue vs Cost */}
            <Card>
              <CardContent className="p-4">
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

            {/* Receivables Report */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">📋 الذمم المدينة</h3>
                {reportData.receivables.length > 0 ? (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {reportData.receivables.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.count} طلبية</p>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-destructive">{c.remaining.toLocaleString()} ₪</p>
                          <p className="text-[10px] text-muted-foreground">متبقي</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد ذمم مدينة 🎉</p>
                )}
              </CardContent>
            </Card>

            {/* Production Cost per Order */}
            <Card>
              <CardContent className="p-4">
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
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات تكاليف</p>
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

              {/* Production Cost Section */}
              {Number(showDetail.production_cost) > 0 && user && (
                <ProductionCostSection
                  order={showDetail}
                  userId={user.id}
                  onSuccess={() => { setShowDetail(null); fetchOrders(); }}
                />
              )}

              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap pt-2">
                {/* Convert to invoice */}
                {!showDetail.invoice_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={async () => {
                    await fetchOrderItems(showDetail.id);
                    setShowDetail(null);
                    setShowInvoiceModal(showDetail);
                  }}>
                    <FileText className="h-3 w-3" /> 🧾 تحويل لفاتورة مبيعات
                  </Button>
                )}
                {/* Record receipt */}
                {showDetail.invoice_id && showDetail.payment_status !== "مدفوع" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                    setShowDetail(null);
                    setShowReceiptModal(showDetail);
                  }}>
                    <Banknote className="h-3 w-3" /> 💰 تسجيل قبض
                  </Button>
                )}
                {showDetail.payment_status !== "مدفوع" && !showDetail.invoice_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowDetail(null); setShowPayment(showDetail); }}>
                    <CreditCard className="h-3 w-3" /> تحديث الدفع
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

      {/* ═══════ Convert to Invoice Modal ═══════ */}
      <ConvertToInvoiceModal
        open={!!showInvoiceModal}
        onClose={() => setShowInvoiceModal(null)}
        order={showInvoiceModal}
        orderItems={orderItems}
        userId={user?.id || ""}
        onSuccess={fetchOrders}
      />

      {/* ═══════ Record Receipt Modal ═══════ */}
      <RecordReceiptModal
        open={!!showReceiptModal}
        onClose={() => setShowReceiptModal(null)}
        order={showReceiptModal}
        userId={user?.id || ""}
        onSuccess={fetchOrders}
      />
    </div>
  );
};

export default OrdersPage;
