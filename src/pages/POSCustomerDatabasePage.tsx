import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search, Users, ArrowRight, Download, Phone, MapPin, Calendar, TrendingUp,
  Edit, Trash2, Eye, MoreHorizontal, PlusCircle, X, UserCheck, ShoppingCart,
  BarChart3, Clock, Star, AlertCircle, Mail, ChevronDown
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface POSCustomerRow {
  id: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  total_visits: number | null;
  total_spent: number | null;
  total_discounts: number | null;
  last_visit: string | null;
  created_at: string | null;
  gender: string | null;
  age_group: string | null;
  nationality: string | null;
}

interface CustomerOrder {
  id: string;
  order_number: string | null;
  total: number;
  state: string;
  created_at: string;
  order_type: string | null;
  items_count: number;
}

type SortField = "name" | "total_visits" | "total_spent" | "last_visit" | "created_at";
type SortDir = "asc" | "desc";

export default function POSCustomerDatabasePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<POSCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("last_visit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Edit dialog
  const [editCustomer, setEditCustomer] = useState<POSCustomerRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", whatsapp: "", email: "", address: "", gender: "", age_group: "" });
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteCustomer, setDeleteCustomer] = useState<POSCustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail/orders dialog
  const [detailCustomer, setDetailCustomer] = useState<POSCustomerRow | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Add dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", whatsapp: "", email: "", address: "" });

  const dataOwnerId = user?.id;

  const loadCustomers = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("pos_customers")
      .select("id, name, whatsapp, email, address, total_visits, total_spent, total_discounts, last_visit, created_at, gender, age_group, nationality")
      .eq("user_id", dataOwnerId)
      .order("last_visit", { ascending: false, nullsFirst: false });
    setCustomers((data as POSCustomerRow[]) || []);
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      list = list.filter(c => multiWordMatchAny(search, c.name, c.whatsapp, c.email, c.address));
    }
    list = [...list].sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [customers, search, sortField, sortDir]);

  const totalSpent = customers.reduce((s, c) => s + (c.total_spent || 0), 0);
  const totalVisits = customers.reduce((s, c) => s + (c.total_visits || 0), 0);
  const avgSpent = customers.length > 0 ? totalSpent / customers.length : 0;
  const activeCustomers = customers.filter(c => {
    if (!c.last_visit) return false;
    const days = (Date.now() - new Date(c.last_visit).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  // Load customer orders
  const loadCustomerOrders = async (customerId: string) => {
    setLoadingOrders(true);
    const { data } = await supabase
      .from("pos_orders")
      .select("id, order_number, total, state, created_at, order_type")
      .eq("pos_customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50);

    const orders: CustomerOrder[] = (data || []).map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      total: Number(o.total) || 0,
      state: o.state,
      created_at: o.created_at,
      order_type: o.order_type,
      items_count: 0,
    }));
    setCustomerOrders(orders);
    setLoadingOrders(false);
  };

  // Edit
  const openEdit = (c: POSCustomerRow) => {
    setEditCustomer(c);
    setEditForm({
      name: c.name || "",
      whatsapp: c.whatsapp || "",
      email: c.email || "",
      address: c.address || "",
      gender: c.gender || "",
      age_group: c.age_group || "",
    });
  };

  const handleSave = async () => {
    if (!editCustomer || !editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("pos_customers")
      .update({
        name: editForm.name.trim(),
        whatsapp: editForm.whatsapp.trim() || null,
        email: editForm.email.trim() || null,
        address: editForm.address.trim() || null,
        gender: editForm.gender || null,
        age_group: editForm.age_group || null,
      })
      .eq("id", editCustomer.id);
    setSaving(false);
    if (error) { toast.error("فشل في التحديث"); return; }
    toast.success("تم تحديث بيانات الزبون");
    setEditCustomer(null);
    loadCustomers();
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteCustomer) return;
    setDeleting(true);
    const { error } = await supabase.from("pos_customers").delete().eq("id", deleteCustomer.id);
    setDeleting(false);
    if (error) { toast.error("فشل في الحذف"); return; }
    toast.success("تم حذف الزبون");
    setDeleteCustomer(null);
    loadCustomers();
  };

  // Add
  const handleAdd = async () => {
    if (!addForm.name.trim() || !dataOwnerId) return;
    setSaving(true);
    const { error } = await supabase.from("pos_customers").insert({
      user_id: dataOwnerId,
      name: addForm.name.trim(),
      whatsapp: addForm.whatsapp.trim() || null,
      email: addForm.email.trim() || null,
      address: addForm.address.trim() || null,
      total_visits: 0,
      total_spent: 0,
    } as any);
    setSaving(false);
    if (error) { toast.error("فشل في الإضافة"); return; }
    toast.success("تمت إضافة الزبون بنجاح");
    setShowAdd(false);
    setAddForm({ name: "", whatsapp: "", email: "", address: "" });
    loadCustomers();
  };

  // Export
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.map(c => ({
      "الاسم": c.name || "",
      "الجوال": c.whatsapp || "",
      "البريد": c.email || "",
      "العنوان": c.address || "",
      "الزيارات": c.total_visits || 0,
      "المشتريات": c.total_spent || 0,
      "الخصومات": c.total_discounts || 0,
      "آخر زيارة": c.last_visit ? format(new Date(c.last_visit), "dd/MM/yyyy") : "",
      "تاريخ التسجيل": c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
    })));
    XLSX.utils.book_append_sheet(wb, ws, "زبائن POS");
    setNextExportBranding({ title: "زبائن POS" });
    XLSX.writeFile(wb, `pos-customers-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("تم تصدير البيانات");
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ChevronDown className={`h-3 w-3 inline-block mr-0.5 transition-transform ${sortField === field ? "text-primary" : "text-muted-foreground/40"} ${sortField === field && sortDir === "asc" ? "rotate-180" : ""}`} />
  );

  const orderTypeLabel = (t: string | null) => {
    switch (t) {
      case "dine_in": return "🍽️ محلي";
      case "takeaway": return "🛍️ استلام";
      case "delivery": return "🚚 توصيل";
      default: return t || "—";
    }
  };

  const stateLabel = (s: string) => {
    switch (s) {
      case "paid": return <Badge variant="default" className="bg-emerald-500/10 text-emerald-700 text-[10px]">مدفوع</Badge>;
      case "cancelled": return <Badge variant="destructive" className="text-[10px]">ملغي</Badge>;
      case "open": return <Badge variant="secondary" className="text-[10px]">مفتوح</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent border-b border-border">
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
                <ArrowRight className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">قاعدة بيانات زبائن نقطة البيع</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">{customers.length} زبون مسجل</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 flex-1 sm:flex-none">
                <Download className="h-3.5 w-3.5" /> تصدير Excel
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 flex-1 sm:flex-none">
                <PlusCircle className="h-3.5 w-3.5" /> إضافة زبون
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Users className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{customers.length}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي الزبائن</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-emerald-600">₪{totalSpent.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي المشتريات</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <BarChart3 className="h-5 w-5 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-600">₪{avgSpent.toFixed(0)}</p>
          <p className="text-[11px] text-muted-foreground">متوسط الإنفاق / زبون</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Star className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-500">{activeCustomers}</p>
          <p className="text-[11px] text-muted-foreground">نشط (30 يوم)</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الجوال أو البريد أو العنوان..."
            className="pr-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        {search && <p className="text-xs text-muted-foreground mt-1">{filtered.length} نتيجة</p>}
      </div>

      {/* Table */}
      <div className="px-4 pb-8">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    الاسم <SortIcon field="name" />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">الجوال</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">العنوان</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("total_visits")}>
                    الزيارات <SortIcon field="total_visits" />
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("total_spent")}>
                    المشتريات <SortIcon field="total_spent" />
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground cursor-pointer select-none hidden sm:table-cell" onClick={() => toggleSort("last_visit")}>
                    آخر زيارة <SortIcon field="last_visit" />
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                    {search ? "لا يوجد نتائج للبحث" : "لا يوجد زبائن مسجلين بعد"}
                  </td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition group">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{c.name || "—"}</div>
                      {c.email && <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{c.email}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.whatsapp ? (
                        <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />{c.whatsapp}
                        </span>
                      ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate hidden md:table-cell">
                      {c.address ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{c.address}</span> : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="secondary" className="text-xs font-bold">{c.total_visits || 0}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-foreground">₪{(c.total_spent || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground hidden sm:table-cell">
                      {c.last_visit ? format(new Date(c.last_visit), "dd MMM yyyy", { locale: ar }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setDetailCustomer(c); loadCustomerOrders(c.id); }}
                          title="عرض التفاصيل والطلبات"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => openEdit(c)}
                          title="تعديل"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteCustomer(c)}
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Footer */}
          {filtered.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
              <span>عرض {filtered.length} من {customers.length} زبون</span>
              <span>إجمالي المشتريات: ₪{filtered.reduce((s, c) => s + (c.total_spent || 0), 0).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail / Orders Dialog ── */}
      <Dialog open={!!detailCustomer} onOpenChange={(o) => !o && setDetailCustomer(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              {detailCustomer?.name || "زبون"}
            </DialogTitle>
          </DialogHeader>
          {detailCustomer && (
            <div className="space-y-4">
              {/* Customer info cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-primary">{detailCustomer.total_visits || 0}</p>
                  <p className="text-[10px] text-muted-foreground">زيارة</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-emerald-600">₪{(detailCustomer.total_spent || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">مشتريات</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-500">₪{(detailCustomer.total_discounts || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">خصومات</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 text-sm">
                {detailCustomer.whatsapp && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {detailCustomer.whatsapp}</div>
                )}
                {detailCustomer.email && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {detailCustomer.email}</div>
                )}
                {detailCustomer.address && (
                  <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {detailCustomer.address}</div>
                )}
                {detailCustomer.created_at && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> مسجل منذ {format(new Date(detailCustomer.created_at), "dd MMM yyyy", { locale: ar })}</div>
                )}
              </div>

              {/* Orders */}
              <div>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  سجل الطلبات ({customerOrders.length})
                </h3>
                <ScrollArea className="max-h-[250px]">
                  {loadingOrders ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">جاري التحميل...</div>
                  ) : customerOrders.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">لا يوجد طلبات مسجلة</div>
                  ) : (
                    <div className="space-y-1.5">
                      {customerOrders.map(o => (
                        <div key={o.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground">{o.order_number || "—"}</span>
                            {stateLabel(o.state)}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">{orderTypeLabel(o.order_type)}</span>
                            <span className="font-bold text-foreground">₪{o.total.toLocaleString()}</span>
                            <span className="text-muted-foreground">{format(new Date(o.created_at), "dd/MM HH:mm")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailCustomer(null)}>إغلاق</Button>
            <Button variant="default" onClick={() => { if (detailCustomer) { openEdit(detailCustomer); setDetailCustomer(null); } }}>
              <Edit className="h-3.5 w-3.5 ml-1.5" /> تعديل البيانات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editCustomer} onOpenChange={(o) => !o && setEditCustomer(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الزبون</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">الاسم *</label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الزبون" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">رقم الجوال</label>
              <Input value={editForm.whatsapp} onChange={e => setEditForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="05xxxxxxxx" dir="ltr" className="text-right" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">البريد الإلكتروني</label>
              <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" dir="ltr" className="text-right" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">العنوان</label>
              <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="العنوان" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">الجنس</label>
                <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">الفئة العمرية</label>
                <select value={editForm.age_group} onChange={e => setEditForm(f => ({ ...f, age_group: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  <option value="teen">مراهق</option>
                  <option value="young">شباب</option>
                  <option value="adult">بالغ</option>
                  <option value="senior">كبير</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCustomer(null)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteCustomer} onOpenChange={(o) => !o && setDeleteCustomer(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف الزبون <strong className="text-foreground">{deleteCustomer?.name}</strong>؟
            سيتم حذف بياناته نهائياً ولن يمكن استعادتها.
          </p>
          {(deleteCustomer?.total_visits || 0) > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-xs text-destructive">
              ⚠️ هذا الزبون لديه {deleteCustomer?.total_visits} زيارة وإجمالي مشتريات ₪{(deleteCustomer?.total_spent || 0).toLocaleString()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCustomer(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "جاري الحذف..." : "حذف نهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              إضافة زبون جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">الاسم *</label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الزبون" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">رقم الجوال</label>
              <Input value={addForm.whatsapp} onChange={e => setAddForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="05xxxxxxxx" dir="ltr" className="text-right" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">البريد الإلكتروني</label>
              <Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" dir="ltr" className="text-right" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">العنوان</label>
              <Input value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="العنوان" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={saving || !addForm.name.trim()}>
              {saving ? "جاري الحفظ..." : "إضافة الزبون"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
