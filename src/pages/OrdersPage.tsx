import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
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
  Download, Printer, Hash, FileText, Pencil, Banknote, Factory, LayoutGrid, LayoutList, RefreshCw
  , HandCoins
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import ConvertToInvoiceModal from "@/components/orders/ConvertToInvoiceModal";

import RecordReceiptModal from "@/components/orders/RecordReceiptModal";
import ProductionCostSection from "@/components/orders/ProductionCostSection";
import { syncContactFromOrder, syncProductsFromOrderItems, retroactiveSyncOrders } from "@/lib/order-contact-sync";

import { setNextExportBranding } from "@/lib/excel-export";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { useCompanySettings } from "@/hooks/useCompanySettings";
/* ─── Status configs ─── */
const STATUS_CONFIGS: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  // Neutral monochrome: no status colors, only text on a light surface
  "جديد":        { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مؤكد":        { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "قيد التجهيز":  { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "جاهز للفوترة": { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مفوتر":       { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "جاهز للشحن":  { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "تم الشحن":    { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "تم التسليم":   { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مؤجل":        { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مدفوع جزئياً": { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مدفوع كاملاً": { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "ملغي":        { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
  "مرتجع":       { bg: "#F3F2F1", color: "#323130", border: "#EDEBE9", dot: "#8A8886" },
};
const getStatusConfig = (s: string) => STATUS_CONFIGS[s] || STATUS_CONFIGS["جديد"];

const PAYMENT_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  "غير مدفوع":   { bg: "#FAF9F8", color: "#A4262C", border: "#EDEBE9" },
  "مدفوع":       { bg: "#FAF9F8", color: "#0B6A0B", border: "#EDEBE9" },
  "مدفوع كاملاً": { bg: "#FAF9F8", color: "#0B6A0B", border: "#EDEBE9" },
  "مدفوع جزئياً": { bg: "#FAF9F8", color: "#8A6100", border: "#EDEBE9" },
};
const getPaymentConfig = (s: string) => PAYMENT_BADGE[s] || PAYMENT_BADGE["غير مدفوع"];

const ALL_STATUSES = ["جديد", "قيد التجهيز", "جاهز للفوترة", "مفوتر", "مدفوع جزئياً", "مدفوع كاملاً", "تم التسليم", "ملغي"];
// حالات فعلية قابلة للحفظ في قاعدة البيانات (بقية العناصر أعلاه هي شرائح فلترة محسوبة من الدفع)
const DB_STATUSES = ["جديد", "قيد التجهيز", "جاهز للشحن", "تم الشحن", "تم التسليم", "مرتجع", "ملغي"];
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
  id: string; order_number: string | null; manual_ref?: string | null; customer_name: string; customer_phone: string | null;
  customer_address: string | null; order_date: string; delivery_date: string | null; status: string;
  subtotal: number; discount: number; shipping_cost: number; total: number; payment_status: string;
  payment_method: string | null; shipping_method: string | null; tracking_number: string | null;
  source: string | null; notes: string | null; created_at: string; user_id: string;
  linked_invoice_id?: string | null;
  contact_id?: string | null;
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
  const { settings } = useCompanySettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [receiptsByOrder, setReceiptsByOrder] = useState<Record<string, number>>({});
  const [invoicePaidByOrder, setInvoicePaidByOrder] = useState<Record<string, number>>({});
  const [journalPaidByOrder, setJournalPaidByOrder] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    const [ordRes, prodData] = await Promise.all([
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      fetchAllRows<any>((from, to) =>
        supabase.from("products").select("*").eq("user_id", user.id).range(from, to)
      ),
    ]);
    if (ordRes.error) console.error("Orders fetch error:", ordRes.error);
    const ordList = ((ordRes.data as any[]) || []) as Order[];
    setOrders(ordList);
    setProducts((prodData as any[]) || []);

    // Aggregate actual receipts linked to each order. Primary: explicit FK link
    // (transactions.order_id). Fallback: legacy text matching of order_number /
    // manual_ref inside receipt voucher notes (pre-FK data).
    const orderNums = ordList.map(o => o.order_number).filter(Boolean) as string[];
    const refTokens = new Map<string, string>(); // token -> aggregation key (order_number)
    ordList.forEach(o => {
      const key = o.order_number || "";
      if (!key) return;
      if (o.order_number) refTokens.set(o.order_number, key);
      if (o.manual_ref) refTokens.set(o.manual_ref, key);
    });
    if (ordList.length > 0) {
      const orderIds = ordList.map(o => o.id);
      const keyById = new Map(ordList.map(o => [o.id, o.order_number || ""]));
      const [recsRes, txRes] = await Promise.all([
        orderNums.length > 0
          ? supabase
              .from("receipt_vouchers")
              .select("amount, notes, status")
              .eq("user_id", user.id)
              .neq("status", "cancelled")
              .ilike("notes", "%طلبية%")
          : Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from("transactions")
          .select("amount, order_id")
          .eq("user_id", user.id)
          .eq("transaction_type", "receipt")
          .in("order_id", orderIds),
      ]);
      const map: Record<string, number> = {};
      ((recsRes as any).data || []).forEach((r: any) => {
        const note = String(r.notes || "");
        refTokens.forEach((key, token) => {
          if (note.includes(token)) map[key] = (map[key] || 0) + Number(r.amount || 0);
        });
      });
      ((txRes as any).data || []).forEach((t: any) => {
        const key = keyById.get(t.order_id) || "";
        if (key) map[key] = (map[key] || 0) + Number(t.amount || 0);
      });
      setReceiptsByOrder(map);
    } else {
      setReceiptsByOrder({});
    }

    // Aggregate paid_amount from invoices linked to each order (via notes reference,
    // or via order.invoice_id / order.linked_invoice_id). Used to reflect cash/partial
    // invoices that were issued directly against the order without a separate receipt.
    if (ordList.length > 0) {
      const invIds = ordList.flatMap(o => [o.invoice_id, o.linked_invoice_id]).filter(Boolean) as string[];
      const [notesRes, idsRes] = await Promise.all([
        orderNums.length > 0
          ? supabase.from("invoices").select("id, paid_amount, notes").eq("user_id", user.id).neq("is_voided", true).ilike("notes", "%ORD-%")
          : Promise.resolve({ data: [] as any[] } as any),
        invIds.length > 0
          ? supabase.from("invoices").select("id, paid_amount").eq("user_id", user.id).neq("is_voided", true).in("id", invIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const invMap: Record<string, number> = {};
      const set = new Set(orderNums);
      ((notesRes as any).data || []).forEach((r: any) => {
        const note = String(r.notes || "");
        set.forEach(n => {
          if (note.includes(n)) invMap[n] = (invMap[n] || 0) + Number(r.paid_amount || 0);
        });
      });
      const idPaid: Record<string, number> = {};
      ((idsRes as any).data || []).forEach((r: any) => { idPaid[r.id] = Number(r.paid_amount || 0); });
      ordList.forEach(o => {
        const key = o.order_number || "";
        if (!key) return;
        const linked = [o.invoice_id, o.linked_invoice_id].filter(Boolean) as string[];
        linked.forEach(id => {
          if (idPaid[id]) invMap[key] = (invMap[key] || 0) + idPaid[id];
        });
      });
      setInvoicePaidByOrder(invMap);
    } else {
      setInvoicePaidByOrder({});
    }

    // Aggregate journal-entry lines explicitly linked to an order via the
    // "[طلبية ORD-XXX]" tag added from the Journal Entry page. Sum the credit
    // side (payments/reductions to AR) per order.
    if (orderNums.length > 0) {
      const { data: jlines } = await supabase
        .from("voucher_lines")
        .select("credit, line_comment, vouchers!inner(user_id, type, status)")
        .eq("vouchers.user_id", user.id)
        .eq("vouchers.type", "journal")
        .neq("vouchers.status", "cancelled")
        .gt("credit", 0)
        .ilike("line_comment", "%طلبية ORD-%");
      const jMap: Record<string, number> = {};
      const set2 = new Set(orderNums);
      (jlines || []).forEach((r: any) => {
        const cmt = String(r.line_comment || "");
        set2.forEach(n => {
          if (cmt.includes(n)) jMap[n] = (jMap[n] || 0) + Number(r.credit || 0);
        });
      });
      setJournalPaidByOrder(jMap);
    } else {
      setJournalPaidByOrder({});
    }

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
    
    // Auto-sync contact before invoicing
    const contactId = await syncContactFromOrder({
      id: order.id,
      user_id: order.user_id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address,
      order_number: order.order_number,
      source: order.source,
    });
    
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

  // Send order to the Sales Invoice editor with contact + items pre-loaded.
  const openInvoiceEditorForOrder = async (order: Order) => {
    if (!user) return;
    try {
      // Ensure contact exists (creates one if missing) and refresh product mapping
      const contactId = await syncContactFromOrder({
        id: order.id,
        user_id: (order as any).user_id || user.id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: (order as any).customer_address,
        order_number: order.order_number,
        source: (order as any).source,
      });
      await syncProductsFromOrderItems(order.id, user.id);

      // Load fresh items so the editor has the latest picture
      const { data: its } = await supabase.from("order_items").select("*").eq("order_id", order.id);
      const items = (its || []).map((it: any) => ({
        product_id: it.product_id || null,
        product_name: it.product_name || it.name || "منتج",
        quantity: Number(it.quantity || 1),
        unit_price: Number(it.unit_price || it.price || 0),
        discount: Number(it.discount || 0),
        unit: it.unit || "قطعة",
      }));

      sessionStorage.setItem("order_invoice_prefill", JSON.stringify({
        orderId: order.id,
        orderNumber: order.order_number,
        contactId,
        contactName: order.customer_name,
        items,
      }));

      const params = new URLSearchParams();
      params.set("type", "sales");
      params.set("order_id", order.id);
      if (contactId) params.set("contact_id", contactId);
      navigate(`/invoices/new?${params.toString()}`);
    } catch (err: any) {
      toast.error("تعذّر فتح محرر الفاتورة: " + (err?.message || ""));
    }
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

  // Unified paid calculator (mirrors kpiData.paidOf) — used by chips, filter, KPIs, table, print, excel
  const paidOfOrder = (o: Order) => {
    const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
    const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
    const storedPaid = Number(o.paid_amount || 0);
    const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
    return Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
  };

  // Chip predicate — payment-related chips are derived from real paid amount, not the raw status
  const matchChip = (o: Order, key: string) => {
    if (key === "all") return true;
    const total = Number(o.total || 0);
    const paid = paidOfOrder(o);
    switch (key) {
      case "مدفوع كاملاً": return o.status !== "ملغي" && total > 0 && paid >= total - 0.01;
      case "مدفوع جزئياً": return o.status !== "ملغي" && paid > 0 && paid < total - 0.01;
      case "مفوتر":       return !!o.invoice_id && o.status !== "ملغي";
      case "ملغي":         return o.status === "ملغي";
      default:             return o.status === key;
    }
  };

  const filtered = useMemo(() => orders.filter(o => {
    const matchSearch = o.customer_name?.includes(search) || o.order_number?.includes(search) || o.manual_ref?.includes(search);
    const matchStatus = matchChip(o, statusFilter);
    const d = o.order_date || "";
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchStatus && matchFrom && matchTo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [orders, search, statusFilter, dateFrom, dateTo, receiptsByOrder, invoicePaidByOrder, journalPaidByOrder]);

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

  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

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
      const rows = filtered.map(o => {
        const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
        const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
        const storedPaid = Number(o.paid_amount || 0);
        const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
        const paid = Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
        const remaining = Math.max(0, Number(o.total || 0) - paid);
        return {
          "المرجع اليدوي": o.manual_ref || "", "رقم الطلبية": o.order_number || "", "العميل": o.customer_name || "",
          "التاريخ": o.order_date || "", "الإجمالي": Number(o.total) || 0,
          "المدفوع": paid, "المتبقي": remaining,
          "الحالة": o.status || "", "الدفع": o.payment_status || "", "المصدر": o.source || "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
      setNextExportBranding({ title: "الطلبيات" });
      XLSX.writeFile(wb, `الطلبيات-${new Date().toISOString().split("T")[0]}.xlsx`);
    });
  };

  const handlePrintOrder = async (o: Order) => {
    const paidOf = (ord: Order) => {
      const receiptsPaid = Number(receiptsByOrder[ord.order_number || ""] || 0);
      const invoicePaid = Number(invoicePaidByOrder[ord.order_number || ""] || 0);
      const storedPaid = Number(ord.paid_amount || 0);
      const journalPaid = Number(journalPaidByOrder[ord.order_number || ""] || 0);
      return Math.min(Number(ord.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
    };
    const { data: its } = await supabase.from("order_items").select("*").eq("order_id", o.id);
    const items = (its as any[]) || [];
    const paid = paidOf(o);
    const remaining = Math.max(0, Number(o.total || 0) - paid);
    const companyName = settings?.company_name || "الشركة";
    const NAVY = "#0D1B2E";
    const cell = (v: any) => (v === null || v === undefined || v === "" ? "—" : String(v));
    const money = (n: any) => `₪${Number(n || 0).toLocaleString()}`;

    const itemsRows = items.length
      ? items.map((it: any, i: number) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${cell(it.product_name)}</td>
          <td style="text-align:center">${Number(it.quantity || 0)}</td>
          <td class="font-mono">${money(it.unit_price)}</td>
          <td class="font-mono">${money(it.discount)}</td>
          <td class="font-mono font-bold">${money(it.total ?? (Number(it.quantity || 0) * Number(it.unit_price || 0) - Number(it.discount || 0)))}</td>
          <td style="color:#64748b">${cell(it.notes)}</td>
        </tr>`).join("")
      : `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">لا توجد بنود</td></tr>`;

    const infoBlock = (label: string, value: string, color = NAVY) => `
      <div class="info-cell">
        <div class="info-label">${label}</div>
        <div class="info-value" style="color:${color}">${value}</div>
      </div>`;

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${companyName}</div>
          <div class="report-title">تفاصيل الطلبية</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:16px;font-weight:700;color:${NAVY}">${cell(o.order_number)}</div>
          <div class="print-date">${cell(o.order_date)}</div>
        </div>
      </div>

      <div class="section-title">بيانات الزبون</div>
      <div class="info-grid">
        ${infoBlock("اسم الزبون", cell(o.customer_name))}
        ${infoBlock("الهاتف", cell(o.customer_phone))}
        ${infoBlock("العنوان", cell(o.customer_address))}
        ${infoBlock("المصدر", cell(o.source))}
      </div>

      <div class="section-title">حالة الطلبية</div>
      <div class="info-grid">
        ${infoBlock("الحالة", cell(o.status))}
        ${infoBlock("حالة الدفع", cell(o.payment_status))}
        ${infoBlock("طريقة الدفع", cell(o.payment_method))}
        ${infoBlock("طريقة الشحن", cell(o.shipping_method))}
        ${infoBlock("تاريخ التسليم", cell(o.delivery_date))}
        ${infoBlock("رقم التتبع", cell(o.tracking_number))}
      </div>

      <div class="section-title">البنود</div>
      <table>
        <thead><tr>
          <th style="width:36px">#</th><th>المنتج / الوصف</th><th style="width:60px">الكمية</th>
          <th style="width:90px">السعر</th><th style="width:80px">الخصم</th>
          <th style="width:100px">الإجمالي</th><th>ملاحظة</th>
        </tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals-box">
          <div class="tot-row"><span>المجموع الفرعي</span><span class="font-mono">${money(o.subtotal)}</span></div>
          <div class="tot-row"><span>الخصم</span><span class="font-mono">${money(o.discount)}</span></div>
          <div class="tot-row"><span>الشحن</span><span class="font-mono">${money(o.shipping_cost)}</span></div>
          <div class="tot-row grand"><span>الإجمالي</span><span class="font-mono">${money(o.total)}</span></div>
          <div class="tot-row" style="color:#059669"><span>المدفوع</span><span class="font-mono">${money(paid)}</span></div>
          <div class="tot-row" style="color:${remaining > 0 ? "#DC2626" : "#059669"}"><span>المتبقي</span><span class="font-mono">${money(remaining)}</span></div>
        </div>
      </div>

      ${o.notes ? `
      <div class="section-title">ملاحظات</div>
      <div class="notes-box">${String(o.notes).replace(/\n/g, "<br/>")}</div>` : ""}

      <div class="footer-bar">
        <div>طُبع في ${new Date().toLocaleString("ar-EG")}</div>
        <div>${companyName}</div>
      </div>
    `;

    const extraStyles = `
      .section-title { font-size:12px; font-weight:700; color:#fff; background:${NAVY}; padding:6px 10px; margin:14px 0 8px; border-radius:4px; }
      .info-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:0; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; margin-bottom:6px; }
      .info-cell { padding:8px 12px; border-left:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; background:#fff; }
      .info-label { font-size:10px; color:#64748b; margin-bottom:2px; }
      .info-value { font-size:12px; font-weight:600; }
      .totals-wrap { display:flex; justify-content:flex-start; margin-top:12px; }
      .totals-box { min-width:280px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
      .tot-row { display:flex; justify-content:space-between; padding:6px 12px; font-size:12px; border-bottom:1px solid #f1f5f9; }
      .tot-row.grand { background:${NAVY}; color:#fff; font-weight:700; font-size:13px; }
      .notes-box { border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:12px; color:#334155; background:#f8fafc; }
      .footer-bar { display:flex; justify-content:space-between; margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8; }
      @media print { @page { size: A4 portrait; margin: 12mm; } body { padding: 0 !important; } }
    `;

    const { printReport } = await import("@/lib/printUtils");
    printReport({ title: `طلبية ${o.order_number || ""}`, companyName, contentHtml: `<style>${extraStyles}</style>${contentHtml}` });
  };

  const handlePrint = () => {
    const paidOf = (o: Order) => {
      const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
      const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
      const storedPaid = Number(o.paid_amount || 0);
      const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
      return Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
    };
    const rows = filtered.map(o => {
      const paid = paidOf(o);
      const remaining = Math.max(0, Number(o.total || 0) - paid);
      return `
      <tr>
        <td>${o.manual_ref ? o.manual_ref + " / " : ""}${o.order_number || "—"}</td><td>${o.customer_name || "—"}</td>
        <td>${o.order_date || "—"}</td><td class="font-mono font-bold">₪${Number(o.total).toLocaleString()}</td>
        <td class="font-mono" style="color:#059669">₪${paid.toLocaleString()}</td>
        <td class="font-mono" style="color:${remaining > 0 ? "#DC2626" : "#94A3B8"}">₪${remaining.toLocaleString()}</td>
        <td>${o.status || "—"}</td><td>${o.payment_status || "—"}</td><td>${o.source || "—"}</td>
      </tr>`;
    }).join("");
    const companyName = settings?.company_name || "الشركة";
    const totalAll = filtered.reduce((s, o) => s + Number(o.total), 0);
    const totalPaid = filtered.reduce((s, o) => s + paidOf(o), 0);
    const totalRemaining = Math.max(0, totalAll - totalPaid);
    const now = new Date();
    const monthTotal = filtered
      .filter(o => { const d = new Date(o.order_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      .reduce((s, o) => s + Number(o.total), 0);
    const paidCount = filtered.filter(o => o.payment_status === "مدفوع" || o.payment_status === "مدفوع كاملاً").length;
    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${companyName}</div>
          <div class="report-title">الطلبيات</div>
        </div>
        <div class="print-date">${filtered.length} طلبية</div>
      </div>
      <div class="summary-row">
        <div class="summary-card"><div class="summary-label">إجمالي الطلبيات</div><div class="summary-value green">${fmt(totalAll)}</div></div>
        <div class="summary-card"><div class="summary-label">هذا الشهر</div><div class="summary-value green">${fmt(monthTotal)}</div></div>
        <div class="summary-card"><div class="summary-label">المدفوع</div><div class="summary-value" style="color:#059669">${fmt(totalPaid)}</div></div>
        <div class="summary-card"><div class="summary-label">المتبقي</div><div class="summary-value" style="color:${totalRemaining > 0 ? "#DC2626" : "#94A3B8"}">${fmt(totalRemaining)}</div></div>
        <div class="summary-card"><div class="summary-label">عدد الطلبيات</div><div class="summary-value">${filtered.length}</div></div>
        <div class="summary-card"><div class="summary-label">فواتير مدفوعة</div><div class="summary-value">${paidCount}</div></div>
      </div>
      <table>
        <thead><tr><th>رقم الطلبية</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الدفع</th><th>المصدر</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3" style="text-align:right">المجموع (${filtered.length} طلبية)</td>
          <td class="font-mono font-bold">${fmt(totalAll)}</td>
          <td class="font-mono font-bold" style="color:#059669">${fmt(totalPaid)}</td>
          <td class="font-mono font-bold" style="color:${totalRemaining > 0 ? "#DC2626" : "#94A3B8"}">${fmt(totalRemaining)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>`;
    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({ title: "الطلبيات", companyName, contentHtml });
    });
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    ALL_STATUSES.forEach(s => { map[s] = orders.filter(o => matchChip(o, s)).length; });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, receiptsByOrder, invoicePaidByOrder, journalPaidByOrder]);

  // ─── KPI data ───
  const kpiData = useMemo(() => {
    const active = orders.filter(o => o.status !== "ملغي" && o.status !== "مرتجع");
    const totalAll = active.reduce((s, o) => s + Number(o.total), 0);
    const now = new Date();
    const thisMonth = active.filter(o => { const d = new Date(o.order_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const thisMonthTotal = thisMonth.reduce((s, o) => s + Number(o.total), 0);
    const avgOrder = active.length > 0 ? totalAll / active.length : 0;
    const paidOf = (o: Order) => {
      const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
      const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
      const storedPaid = Number(o.paid_amount || 0);
      const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
      return Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
    };
    const totalPaid = active.reduce((s, o) => s + paidOf(o), 0);
    const totalRemaining = Math.max(0, totalAll - totalPaid);
    return { totalAll, thisMonthTotal, count: orders.length, avgOrder, totalPaid, totalRemaining };
  }, [orders, receiptsByOrder, invoicePaidByOrder, journalPaidByOrder]);

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
    { label: "إجمالي الطلبيات", value: fmt(kpiData.totalAll), accent: "#0078D4" },
    { label: "هذا الشهر",       value: fmt(kpiData.thisMonthTotal), accent: "#0078D4" },
    { label: "المدفوع",         value: fmt(kpiData.totalPaid),      accent: "#059669" },
    { label: "المتبقي",         value: fmt(kpiData.totalRemaining), accent: "#DC2626" },
    { label: "عدد الطلبيات",     value: String(kpiData.count),      accent: "#0078D4" },
    { label: "متوسط قيمة الطلب", value: fmt(kpiData.avgOrder),      accent: "#0078D4" },
  ];

  const openEdit = (o: Order) => {
    navigate(`/orders/${o.id}/edit`);
  };

  const actionTabs: ActionTab[] = [
    {
      key: "home",
      label: "عام",
      groups: [
        {
          key: "new",
          label: "إنشاء",
          items: [
            { key: "new-order", label: "طلبية جديدة", icon: Plus, variant: "primary", onClick: () => navigate("/orders/new") },
          ],
        },
        {
          key: "actions",
          label: "إجراءات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => fetchOrders(), disabled: loading },
            ...(user?.email === "alaaabedps1987@gmail.com" ? [{
              key: "sync", label: syncing ? "جاري المزامنة..." : "مزامنة الزبائن والأصناف",
              icon: RefreshCw, onClick: handleRetroactiveSync, disabled: syncing,
            }] : []),
          ],
        },
        {
          key: "export",
          label: "تصدير وطباعة",
          items: [
            { key: "excel", label: "Excel", icon: Download, onClick: exportToExcel, disabled: filtered.length === 0, tooltip: filtered.length === 0 ? "لا توجد بيانات" : undefined },
            { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint, disabled: filtered.length === 0, tooltip: filtered.length === 0 ? "لا توجد بيانات" : undefined },
          ],
        },
        {
          key: "view",
          label: "العرض",
          items: [
            { key: "list", label: "جدول", icon: LayoutList, onClick: () => setViewMode("table"), variant: viewMode === "table" ? "primary" : "default" },
            { key: "cards", label: "بطاقات", icon: LayoutGrid, onClick: () => setViewMode("cards"), variant: viewMode === "cards" ? "primary" : "default" },
          ],
        },
      ],
    },
    {
      key: "reports",
      label: "التقارير والتحليلات",
      groups: [
        {
          key: "switch",
          label: "العرض",
          items: [
            { key: "orders-view", label: "قائمة الطلبيات", icon: ShoppingCart, onClick: () => setActiveTab("orders"), variant: activeTab === "orders" ? "primary" : "default" },
            { key: "reports-view", label: "لوحة التقارير", icon: BarChart3, onClick: () => setActiveTab("reports"), variant: activeTab === "reports" ? "primary" : "default" },
          ],
        },
      ],
    },
  ];

  const rightSlot = (
    <div className="relative">
      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو رقم الطلبية..."
        className="h-8 w-64 pr-8 text-[12.5px]"
        dir="rtl"
      />
      {search && (
        <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <>
      <FinanceShell
        title="الطلبيات"
        subtitle="إدارة دورة حياة طلبيات البيع والتحصيل"
        breadcrumb={[{ label: "الرئيسية", href: "/" }, { label: "المبيعات" }, { label: "الطلبيات" }]}
        actionTabs={actionTabs}
        rightSlot={rightSlot}
      >
        <div style={{ direction: "rtl", textAlign: "right", fontFamily: F }}>

      {/* ═══════ Orders Tab ═══════ */}
      {activeTab === "orders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ─── KPI Cards ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {kpiCards.map((card, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  background: "white",
                  borderRadius: "2px",
                  padding: "14px 16px",
                  position: "relative",
                  border: "1px solid #EDEBE9",
                  borderTop: `2px solid ${card.accent}`,
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  cursor: "default",
                  ...(hoveredCard === i
                    ? { borderColor: "#C7C6C4", boxShadow: "0 1.6px 3.6px rgba(0,0,0,0.08), 0 0.3px 0.9px rgba(0,0,0,0.06)" }
                    : {}),
                }}
              >
                <p style={{ fontSize: "11px", fontWeight: 600, color: "#605E5C", fontFamily: F, letterSpacing: "0.2px", marginBottom: "6px", textTransform: "none" }}>
                  {card.label}
                </p>
                <p style={{ fontSize: "22px", fontWeight: 600, color: "#201F1E", fontFamily: F, lineHeight: 1.1, fontFeatureSettings: '"tnum" 1' }}>
                  {card.value}
                </p>
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

            {/* Date range filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", direction: "rtl" }}>
              <label style={{ fontSize: "12px", color: "#64748B", fontFamily: F }}>من</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #E2E8F0", fontSize: "12px", fontFamily: F, color: "#1E293B", background: "white", outline: "none" }}
              />
              <label style={{ fontSize: "12px", color: "#64748B", fontFamily: F }}>إلى</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #E2E8F0", fontSize: "12px", fontFamily: F, color: "#1E293B", background: "white", outline: "none" }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid #E2E8F0", background: "white", color: "#64748B", cursor: "pointer", fontSize: "12px", fontFamily: F }}
                  title="مسح الفلتر"
                >
                  <X style={{ width: 12, height: 12 }} />
                </button>
              )}
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
              const count = chip.key === "all" ? orders.length : (counts[chip.key] || 0);
              return (
                <button key={chip.key} onClick={() => setStatusFilter(chip.key)} style={{
                  borderRadius: "2px", padding: "5px 12px", fontSize: "12px", fontFamily: F, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "6px", transition: "all 0.15s ease",
                  ...(isActive
                    ? { background: "#EFF6FC", color: "#004578", border: "1px solid #0078D4", fontWeight: 600 }
                    : { background: "white", color: "#323130", border: "1px solid #EDEBE9", fontWeight: 500 }),
                }}>
                  {chip.label}
                  <span style={{ fontSize: "11px", color: isActive ? "#004578" : "#8A8886", fontWeight: 600 }}>{count}</span>
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
              <button onClick={() => { navigate("/orders/new"); }} style={{ background: `linear-gradient(135deg, ${NAVY}, #1e3a5f)`, color: "white", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", fontFamily: F, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
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
                       <th style={{ padding: "10px 10px", textAlign: "right", width: "36px" }}>
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-primary" />
                      </th>
                      {[
                        { label: "رقم الطلبية", field: "order_number" as SortKey, w: "130px" },
                        { label: "العميل", field: "customer_name" as SortKey, w: "220px" },
                        { label: "التاريخ", field: "order_date" as SortKey, w: "100px" },
                        { label: "الإجمالي", field: "total" as SortKey, w: "100px" },
                        { label: "الحالة", field: "status" as SortKey, w: "115px" },
                      ].map(col => (
                        <th key={col.label} onClick={() => toggleSort(col.field)} style={{
                          padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F,
                          textAlign: "right", whiteSpace: "nowrap",
                          color: "white", borderBottom: "none", letterSpacing: "0.3px",
                          cursor: "pointer", width: col.w, minWidth: col.w,
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {col.label}
                            <ArrowUpDown style={{ width: 12, height: 12, opacity: sortKey === col.field ? 1 : 0.3 }} />
                          </span>
                        </th>
                      ))}
                      <th style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "95px", whiteSpace: "nowrap" }}>الدفع</th>
                      <th style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "100px", whiteSpace: "nowrap" }}>المدفوع</th>
                      <th style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "100px", whiteSpace: "nowrap" }}>المتبقي</th>
                      <th onClick={() => toggleSort("source")} style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", cursor: "pointer", width: "80px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>المصدر <ArrowUpDown style={{ width: 12, height: 12, opacity: sortKey === "source" ? 1 : 0.3 }} /></span>
                      </th>
                      <th style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "160px", minWidth: "160px", whiteSpace: "nowrap" }}>إجراءات</th>
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
                          <td style={{ padding: "8px 10px" }} onClick={e => e.stopPropagation()}>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(o.id)} />
                          </td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                            {o.manual_ref && (
                              <div style={{ fontFamily: "monospace", fontSize: "12.5px", color: NAVY, fontWeight: 800 }}>{o.manual_ref}</div>
                            )}
                            <div style={{ fontFamily: "monospace", fontSize: o.manual_ref ? "10.5px" : "12px", color: "#3B82F6", fontWeight: "600" }}>{o.order_number || "—"}</div>
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: "600", color: NAVY, fontSize: "13px", fontFamily: F, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px" }}>{o.customer_name}</td>
                          <td style={{ padding: "8px 12px", fontSize: "12px", color: "#64748B", fontFamily: F, whiteSpace: "nowrap" }}>{fmtDateDisplay(o.order_date)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: "700", color: NAVY, fontSize: "14px", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>{Number(o.total).toLocaleString()} ₪</td>
                          <td style={{ padding: "8px 12px" }}>
                            <Select value={o.status} onValueChange={v => updateStatus(o.id, v)}>
                              <SelectTrigger style={{ height: "auto", border: "none", background: "transparent", padding: 0, width: "auto", minWidth: "unset" }} className="shadow-none">
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 8px",
                                  borderRadius: "2px", fontSize: "12px", fontWeight: 600, fontFamily: F, whiteSpace: "nowrap",
                                  background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                                  borderRight: `3px solid ${sc.dot}`,
                                }}>
                                  {o.status}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="z-50 bg-background">
                                {DB_STATUSES.map(s => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span onClick={() => setShowPayment(o)} style={{
                              display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
                              padding: "3px 10px", borderRadius: "2px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
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
                          {(() => {
                            const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
                            const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
                            const storedPaid = Number(o.paid_amount || 0);
                            const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
                            // Take the highest signal: receipts, invoice paid, or stored — avoids
                            // double-counting when a receipt is issued against an already-paid invoice.
                            const paid = Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
                            const remaining = Math.max(0, Number(o.total || 0) - paid);
                            return (
                              <>
                                <td style={{ padding: "8px 12px", fontWeight: "600", color: "#059669", fontSize: "13px", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>
                                  {paid.toLocaleString()} ₪
                                </td>
                                <td style={{ padding: "8px 12px", fontWeight: "600", color: remaining > 0 ? "#DC2626" : "#94A3B8", fontSize: "13px", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>
                                  {remaining.toLocaleString()} ₪
                                </td>
                              </>
                            );
                          })()}
                          <td style={{ padding: "8px 12px", fontSize: "12px", color: "#64748B", fontFamily: F, whiteSpace: "nowrap" }}>{o.source}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              {[
                                { icon: <Eye style={{ width: 14, height: 14 }} />, title: "عرض", onClick: () => navigate(`/orders/${o.id}`) },
                                { icon: <Printer style={{ width: 14, height: 14 }} />, title: "طباعة تفاصيل الطلبية", onClick: () => handlePrintOrder(o) },
                                ...((o.status === "جاهز للفوترة" || o.status === "جديد" || o.status === "قيد التجهيز") && !o.invoice_id ? [{
                                  icon: <FileText style={{ width: 14, height: 14 }} />, title: "فاتورة",
                                  onClick: () => openInvoiceEditorForOrder(o)
                                }] : []),
                                ...((o.status === "مفوتر" || o.status === "مدفوع جزئياً") ? [{
                                  icon: <Banknote style={{ width: 14, height: 14 }} />, title: "قبض",
                                  onClick: () => setShowReceiptModal(o)
                                }] : []),
                                {
                                  icon: <HandCoins style={{ width: 14, height: 14 }} />, title: "سند قبض",
                                  onClick: async () => {
                                    try {
                                      const contactId = await syncContactFromOrder({
                                        id: o.id, user_id: user!.id,
                                        customer_name: o.customer_name, customer_phone: o.customer_phone,
                                        customer_address: (o as any).customer_address, order_number: o.order_number, source: o.source,
                                      } as any);
                                      const remaining = Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0));
                                      const params = new URLSearchParams();
                                      if (contactId) params.set("contact_id", contactId);
                                      params.set("contact_name", o.customer_name || "");
                                      if (remaining > 0) params.set("amount", String(remaining));
                                      if (o.order_number) params.set("order_ref", o.order_number);
                                      params.set("order_id", o.id);
                                      navigate(`/finance/receipt/new?${params.toString()}`);
                                    } catch (e: any) {
                                      toast.error(e?.message || "تعذر فتح سند القبض");
                                    }
                                  }
                                },
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
                      {(() => {
                        const totals = filtered.reduce((acc, o) => {
                          const receiptsPaid = Number(receiptsByOrder[o.order_number || ""] || 0);
                          const invoicePaid = Number(invoicePaidByOrder[o.order_number || ""] || 0);
                          const storedPaid = Number(o.paid_amount || 0);
                          const journalPaid = Number(journalPaidByOrder[o.order_number || ""] || 0);
                          const paid = Math.min(Number(o.total || 0), Math.max(receiptsPaid, invoicePaid, storedPaid) + journalPaid);
                          const remaining = Math.max(0, Number(o.total || 0) - paid);
                          acc.paid += paid; acc.remaining += remaining;
                          return acc;
                        }, { paid: 0, remaining: 0 });
                        return (
                          <>
                            <td />
                            <td />
                            <td style={{ padding: "14px 12px", fontWeight: "800", fontSize: "14px", color: "#059669", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>
                              ₪{totals.paid.toLocaleString()}
                            </td>
                            <td style={{ padding: "14px 12px", fontWeight: "800", fontSize: "14px", color: totals.remaining > 0 ? "#DC2626" : "#94A3B8", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>
                              ₪{totals.remaining.toLocaleString()}
                            </td>
                            <td colSpan={2} />
                          </>
                        );
                      })()}
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
                        display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 8px",
                        borderRadius: "2px", fontSize: "12px", fontWeight: 600, fontFamily: F,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                        borderRight: `3px solid ${sc.dot}`,
                      }}>
                        {o.status}
                      </span>
                      <span style={{
                        display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
                        padding: "3px 10px", borderRadius: "2px", fontSize: "11px", fontWeight: 600,
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
                        ...((o.status === "جاهز للفوترة" || o.status === "جديد" || o.status === "قيد التجهيز") && !o.invoice_id ? [{ label: "فوترة", icon: "📄", onClick: () => openInvoiceEditorForOrder(o) }] : []),
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

        </div>
      </FinanceShell>

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
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { const o = showDetail; setShowDetail(null); openInvoiceEditorForOrder(o); }}>
                    <FileText className="h-3 w-3" /> تحويل لفاتورة مبيعات
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
    </>
  );
};

export default OrdersPage;
