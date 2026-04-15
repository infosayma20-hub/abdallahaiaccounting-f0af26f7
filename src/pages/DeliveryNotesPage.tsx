import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Plus, Search, Printer, Download, FileText, Truck, Package, MoreHorizontal, Eye, Pencil, ArrowRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import * as XLSX from "xlsx";

const F = "Tajawal, sans-serif";

interface DeliveryNote {
  id: string;
  delivery_number: string;
  contact_id: string | null;
  contact_name: string | null;
  delivery_date: string;
  status: "draft" | "issued" | "converted";
  linked_invoice_id: string | null;
  invoice_number: string | null;
  currency: string;
  total_amount: number;
  notes: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  delivery_address: string | null;
  created_at: string;
}

interface DeliveryItem {
  id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  notes?: string;
}

interface Contact {
  id: string;
  contact_name: string;
}

interface Product {
  id: string;
  name: string;
  sell_price: number;
  unit?: string;
  quantity?: number;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "مسودة", color: "#6B7280", bg: "#F3F4F6" },
  issued: { label: "صادرة", color: "#2563EB", bg: "#DBEAFE" },
  converted: { label: "محولة لفاتورة", color: "#059669", bg: "#D1FAE5" },
};

const DeliveryNotesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formContactId, setFormContactId] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formNotes, setFormNotes] = useState("");
  const [formDriverName, setFormDriverName] = useState("");
  const [formVehicleNumber, setFormVehicleNumber] = useState("");
  const [formDeliveryAddress, setFormDeliveryAddress] = useState("");
  const [formItems, setFormItems] = useState<DeliveryItem[]>([{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const [formCurrency, setFormCurrency] = useState("شيكل");

  // Lookups
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const fetchNotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("delivery_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotes((data as any[]) || []);
    setLoading(false);
  };

  const fetchLookups = async () => {
    if (!user) return;
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("contacts").select("id, contact_name").eq("user_id", user.id).eq("is_archived", false).order("contact_name"),
      supabase.from("products").select("id, name, sell_price, unit, quantity").eq("user_id", user.id).eq("is_active", true).order("name"),
    ]);
    setContacts((c as any[]) || []);
    setProducts(p || []);
  };

  useEffect(() => { fetchNotes(); fetchLookups(); }, [user]);

  const filtered = useMemo(() => {
    let result = notes;
    if (statusFilter !== "all") result = result.filter(n => n.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(n =>
        n.delivery_number?.toLowerCase().includes(q) ||
        n.contact_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [notes, statusFilter, search]);

  const resetForm = () => {
    setEditingId(null);
    setFormContactId("");
    setFormContactName("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setFormDriverName("");
    setFormVehicleNumber("");
    setFormDeliveryAddress("");
    setFormItems([{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
    setFormCurrency("شيكل");
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = async (note: DeliveryNote) => {
    setEditingId(note.id);
    setFormContactId(note.contact_id || "");
    setFormContactName(note.contact_name || "");
    setFormDate(note.delivery_date);
    setFormNotes(note.notes || "");
    setFormDriverName(note.driver_name || "");
    setFormVehicleNumber(note.vehicle_number || "");
    setFormDeliveryAddress(note.delivery_address || "");
    setFormCurrency(note.currency || "شيكل");

    const { data: items } = await supabase
      .from("delivery_note_items")
      .select("*")
      .eq("delivery_note_id", note.id)
      .order("sort_order");
    setFormItems(
      (items as any[])?.length
        ? (items as any[]).map(i => ({
            id: i.id,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit: i.unit || "قطعة",
            unit_price: i.unit_price,
            total: i.total,
            notes: i.notes,
          }))
        : [{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]
    );
    setShowForm(true);
  };

  const updateItem = (index: number, field: keyof DeliveryItem, value: any) => {
    setFormItems(prev => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      if (field === "quantity" || field === "unit_price") {
        updated[index].total = updated[index].quantity * updated[index].unit_price;
      }
      return updated;
    });
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setFormItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        unit: product.unit || "قطعة",
        total: updated[index].quantity * product.price,
      };
      return updated;
    });
  };

  const addItem = () => setFormItems(prev => [...prev, { product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const removeItem = (index: number) => setFormItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const formTotal = useMemo(() => formItems.reduce((s, i) => s + i.total, 0), [formItems]);

  const handleSave = async (issueAfterSave = false) => {
    if (!user) return;
    if (!formContactName.trim()) { toast.error("يرجى إدخال اسم العميل"); return; }
    if (formItems.every(i => !i.product_name.trim())) { toast.error("يرجى إضافة بند واحد على الأقل"); return; }

    setSaving(true);
    try {
      const noteData = {
        user_id: user.id,
        contact_id: formContactId || null,
        contact_name: formContactName,
        delivery_date: formDate,
        currency: formCurrency,
        subtotal: formTotal,
        total_amount: formTotal,
        notes: formNotes || null,
        driver_name: formDriverName || null,
        vehicle_number: formVehicleNumber || null,
        delivery_address: formDeliveryAddress || null,
        status: issueAfterSave ? "issued" : "draft",
      };

      let noteId = editingId;

      if (editingId) {
        await supabase.from("delivery_notes").update(noteData as any).eq("id", editingId);
        await supabase.from("delivery_note_items").delete().eq("delivery_note_id", editingId);
      } else {
        const { data, error } = await supabase.from("delivery_notes").insert(noteData as any).select("id").single();
        if (error) throw error;
        noteId = (data as any).id;
      }

      // Insert items
      const itemsToInsert = formItems
        .filter(i => i.product_name.trim())
        .map((item, idx) => ({
          delivery_note_id: noteId!,
          product_id: item.product_id || null,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: item.total,
          notes: item.notes || null,
          sort_order: idx,
        }));
      if (itemsToInsert.length > 0) {
        await supabase.from("delivery_note_items").insert(itemsToInsert as any);
      }

      // If issuing, deduct stock
      if (issueAfterSave && !editingId) {
        for (const item of formItems) {
          if (item.product_id && item.quantity > 0) {
            const product = products.find(p => p.id === item.product_id);
            if (product) {
              await supabase.from("products").update({
                quantity: Math.max(0, (product.quantity || 0) - item.quantity),
              }).eq("id", item.product_id);
            }
          }
        }
      }

      toast.success(editingId ? "تم تحديث الإرسالية" : issueAfterSave ? "تم إصدار الإرسالية وخصم المخزون" : "تم حفظ الإرسالية كمسودة");
      setShowForm(false);
      resetForm();
      fetchNotes();
      fetchLookups();
    } catch (err: any) {
      toast.error(err.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (id: string) => {
    // Issue a draft delivery note — deduct stock
    const note = notes.find(n => n.id === id);
    if (!note || note.status !== "draft") return;

    const { data: items } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", id);
    for (const item of (items as any[]) || []) {
      if (item.product_id && item.quantity > 0) {
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          await supabase.from("products").update({
            quantity: Math.max(0, (product.quantity || 0) - item.quantity),
          }).eq("id", item.product_id);
        }
      }
    }

    await supabase.from("delivery_notes").update({ status: "issued" } as any).eq("id", id);
    toast.success("تم إصدار الإرسالية وخصم المخزون");
    fetchNotes();
    fetchLookups();
  };

  const handleConvertToInvoice = async (note: DeliveryNote) => {
    if (note.status === "converted") { toast.error("الإرسالية محولة مسبقاً"); return; }

    try {
      // Fetch items
      const { data: items } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", note.id);

      // Create invoice
      const invoiceData = {
        user_id: user!.id,
        invoice_type: "sale",
        contact_id: note.contact_id,
        contact_name: note.contact_name,
        invoice_date: new Date().toISOString().split("T")[0],
        currency: note.currency,
        payment_method: "credit",
        status: "draft",
        total_amount: note.total_amount,
        notes: `محولة من إرسالية ${note.delivery_number}`,
      };

      const { data: inv, error: invErr } = await supabase.from("invoices").insert(invoiceData).select("id, invoice_number").single();
      if (invErr) throw invErr;

      // Create invoice items
      if (items?.length) {
        const invoiceItems = (items as any[]).map(item => ({
          invoice_id: inv.id,
          product_id: item.product_id,
          description: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: 0,
          tax_rate: 0,
          subtotal: item.total,
        }));
        await supabase.from("invoice_items").insert(invoiceItems);
      }

      // Update delivery note
      await supabase.from("delivery_notes").update({
        status: "converted",
        linked_invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        converted_at: new Date().toISOString(),
      } as any).eq("id", note.id);

      toast.success(`تم تحويل الإرسالية إلى فاتورة ${inv.invoice_number}`);
      fetchNotes();
    } catch (err: any) {
      toast.error(err.message || "خطأ في التحويل");
    }
  };

  const handleDelete = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.status === "converted") { toast.error("لا يمكن حذف إرسالية محولة"); return; }
    if (!confirm("هل أنت متأكد من حذف هذه الإرسالية؟")) return;
    await supabase.from("delivery_notes").delete().eq("id", id);
    toast.success("تم حذف الإرسالية");
    fetchNotes();
  };

  const exportToExcel = () => {
    const rows = filtered.map(n => ({
      "رقم الإرسالية": n.delivery_number,
      "العميل": n.contact_name,
      "التاريخ": n.delivery_date,
      "الحالة": statusConfig[n.status]?.label || n.status,
      "المبلغ": n.total_amount,
      "العملة": n.currency,
      "رقم الفاتورة": n.invoice_number || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إرساليات");
    XLSX.writeFile(wb, "delivery-notes.xlsx");
  };

  return (
    <div style={{ direction: "rtl", fontFamily: F, padding: "16px 24px 96px", maxWidth: "1400px", margin: "0 auto" }}>
      <PageHeader title="إرساليات المبيعات" breadcrumb={["المبيعات", "إرساليات المبيعات"]} />

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 mt-3">
        <p className="text-xs text-muted-foreground" style={{ fontFamily: F }}>وثائق تسليم البضاعة — تُحوّل لفواتير لاحقاً</p>
        <div className="flex items-center gap-2">
          <Button onClick={openNew} className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> إرسالية جديدة
          </Button>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-2">
              <Download className="h-4 w-4" /> تصدير
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو الرقم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2">
          {["all", "draft", "issued", "converted"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 text-xs rounded-full border transition-all"
              style={{
                fontFamily: F,
                background: statusFilter === s ? "#0D1B2E" : "white",
                color: statusFilter === s ? "white" : "#64748B",
                borderColor: statusFilter === s ? "#0D1B2E" : "#E2E8F0",
              }}
            >
              {s === "all" ? `● الكل ${notes.length}` : `${statusConfig[s]?.label} ${notes.filter(n => n.status === s).length}`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-semibold text-muted-foreground">لا توجد إرساليات</p>
          <p className="text-sm text-muted-foreground/70 mb-4">أنشئ أول إرسالية مبيعات</p>
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> إرسالية جديدة</Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الإرسالية</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الفاتورة</TableHead>
                <TableHead className="text-center w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(note => {
                const sc = statusConfig[note.status] || statusConfig.draft;
                return (
                  <TableRow key={note.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEdit(note)}>
                    <TableCell className="font-mono text-sm font-semibold">{note.delivery_number}</TableCell>
                    <TableCell>{note.contact_name || "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDateDisplay(note.delivery_date)}</TableCell>
                    <TableCell className="font-semibold">{note.total_amount?.toLocaleString()} {note.currency === "شيكل" ? "₪" : note.currency}</TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {note.invoice_number ? (
                        <span
                          className="text-primary cursor-pointer underline"
                          onClick={e => { e.stopPropagation(); navigate(`/invoices?type=sales`); }}
                        >
                          {note.invoice_number}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(note)}>
                            <Pencil className="h-4 w-4 ml-2" /> عرض / تعديل
                          </DropdownMenuItem>
                          {note.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleIssue(note.id)}>
                              <Package className="h-4 w-4 ml-2" /> إصدار وخصم المخزون
                            </DropdownMenuItem>
                          )}
                          {note.status !== "converted" && (
                            <DropdownMenuItem onClick={() => handleConvertToInvoice(note)}>
                              <ArrowRight className="h-4 w-4 ml-2" /> تحويل لفاتورة
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {note.status !== "converted" && (
                            <DropdownMenuItem onClick={() => handleDelete(note.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 ml-2" /> حذف
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {editingId ? "تعديل الإرسالية" : "إرسالية مبيعات جديدة"}
            </DialogTitle>
            <DialogDescription>وثيقة تسليم بضاعة — تُحوّل لفاتورة لاحقاً حسب القانون</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Customer & Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>العميل</Label>
                <Select
                  value={formContactId}
                  onValueChange={v => {
                    setFormContactId(v);
                    const c = contacts.find(x => x.id === v);
                    if (c) setFormContactName(c.contact_name);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    {contacts.filter(c => c.contact_name).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="أو اكتب اسم العميل مباشرة"
                  value={formContactName}
                  onChange={e => setFormContactName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الإرسالية</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="شيكل">₪ شيكل</SelectItem>
                    <SelectItem value="دولار">$ دولار</SelectItem>
                    <SelectItem value="دينار">د.أ دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>اسم السائق</Label>
                <Input value={formDriverName} onChange={e => setFormDriverName(e.target.value)} placeholder="اختياري" />
              </div>
              <div className="space-y-2">
                <Label>رقم المركبة</Label>
                <Input value={formVehicleNumber} onChange={e => setFormVehicleNumber(e.target.value)} placeholder="اختياري" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>عنوان التسليم</Label>
                <Input value={formDeliveryAddress} onChange={e => setFormDeliveryAddress(e.target.value)} placeholder="اختياري" />
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">البنود</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                  <Plus className="h-3 w-3" /> إضافة بند
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-10">#</TableHead>
                    <TableHead className="text-right">المنتج / الصنف</TableHead>
                    <TableHead className="text-right w-24">الكمية</TableHead>
                    <TableHead className="text-right w-20">الوحدة</TableHead>
                    <TableHead className="text-right w-28">السعر</TableHead>
                    <TableHead className="text-right w-28">الإجمالي</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <Select
                          value={item.product_id || ""}
                          onValueChange={v => selectProduct(idx, v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="اختر المنتج" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.quantity != null ? `(${p.quantity})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="mt-1 h-8 text-xs"
                          placeholder="أو اكتب اسم الصنف"
                          value={item.product_name}
                          onChange={e => updateItem(idx, "product_name", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                          className="h-9 text-center"
                          dir="ltr"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.unit}
                          onChange={e => updateItem(idx, "unit", e.target.value)}
                          className="h-9 text-center text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}
                          className="h-9 text-center"
                          dir="ltr"
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-sm">{item.total.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-3">
                <div className="text-lg font-bold">
                  الإجمالي: {formTotal.toLocaleString()} {formCurrency === "شيكل" ? "₪" : formCurrency}
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>إلغاء</Button>
              <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ كمسودة"}
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving} className="gap-2">
                <Package className="h-4 w-4" />
                {saving ? "جاري الحفظ..." : "إصدار وخصم المخزون"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeliveryNotesPage;
