import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Plus, Save, Package, Truck, X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DeliveryNotePrintView from "@/components/DeliveryNotePrintView";
import { createRoot } from "react-dom/client";
import AccountingShell from "@/components/layout/AccountingShell";

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
  product_type?: string;
}

const DeliveryNoteCreatePage = () => {
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const { id: editingId } = useParams<{ id: string }>();
  const isEdit = !!editingId;

  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [noteNumber, setNoteNumber] = useState("");
  const [noteStatus, setNoteStatus] = useState("draft");
  const [previewNumber, setPreviewNumber] = useState("");

  // Form state
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [items, setItems] = useState<DeliveryItem[]>([{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const [currency, setCurrency] = useState("شيكل");

  // Lookups
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const fetchLookups = useCallback(async () => {
    if (!user) return;
    const [cRes, pRes] = await Promise.all([
      (supabase.from("contacts").select("id, contact_name").eq("user_id", user.id) as any).eq("is_archived", false).order("contact_name"),
      supabase.from("products").select("id, name, sell_price, unit, quantity, product_type").eq("user_id", user.id).order("name"),
    ]);
    setContacts(cRes.data || []);
    setProducts(pRes.data || []);
  }, [user]);

  const loadNote = useCallback(async () => {
    if (!editingId || !user) return;
    setLoadingNote(true);
    const { data: note } = await supabase.from("delivery_notes").select("*").eq("id", editingId).maybeSingle();
    if (!note) { toast.error("الإرسالية غير موجودة"); navigate("/delivery-notes"); return; }

    setNoteNumber((note as any).delivery_number || "");
    setNoteStatus((note as any).status || "draft");
    setContactId((note as any).contact_id || "");
    setContactName((note as any).contact_name || "");
    setDate((note as any).delivery_date || "");
    setNotes((note as any).notes || "");
    setDriverName((note as any).driver_name || "");
    setVehicleNumber((note as any).vehicle_number || "");
    setDeliveryAddress((note as any).delivery_address || "");
    setCurrency((note as any).currency || "شيكل");

    const { data: noteItems } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", editingId).order("sort_order");
    if (noteItems?.length) {
      setItems((noteItems as any[]).map(i => ({
        id: i.id, product_id: i.product_id, product_name: i.product_name,
        quantity: i.quantity, unit: i.unit || "قطعة", unit_price: i.unit_price,
        total: i.total, notes: i.notes,
      })));
    }
    setLoadingNote(false);
  }, [editingId, user, navigate]);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);
  useEffect(() => { if (isEdit) loadNote(); }, [isEdit, loadNote]);

  // Generate preview number for new notes
  useEffect(() => {
    if (isEdit || noteNumber) return;
    if (!user) return;
    const fetchNextNumber = async () => {
      const currentYear = new Date().getFullYear().toString();
      const { data } = await supabase
        .from("delivery_notes")
        .select("delivery_number")
        .eq("user_id", user.id)
        .like("delivery_number", `DN-${currentYear}-%`)
        .order("delivery_number", { ascending: false })
        .limit(1);
      let nextSeq = 1;
      if (data && data.length > 0) {
        const lastNum = (data[0] as any).delivery_number;
        const parts = lastNum.split("-");
        const last = parseInt(parts[2] || "0", 10);
        if (!isNaN(last)) nextSeq = last + 1;
      }
      setPreviewNumber(`DN-${currentYear}-${String(nextSeq).padStart(4, "0")}`);
    };
    fetchNextNumber();
  }, [user, isEdit, noteNumber]);

  const updateItem = (index: number, field: keyof DeliveryItem, value: any) => {
    setItems(prev => {
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
    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        product_id: product.id,
        product_name: product.name,
        unit_price: product.sell_price,
        unit: product.unit || "قطعة",
        total: updated[index].quantity * product.sell_price,
      };
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, { product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const removeItem = (index: number) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const formTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);

  const handleSave = async (issueAfterSave = false) => {
    if (!user) return;
    if (!contactName.trim()) { toast.error("يرجى إدخال اسم العميل"); return; }
    if (items.every(i => !i.product_name.trim())) { toast.error("يرجى إضافة بند واحد على الأقل"); return; }

    setSaving(true);
    try {
      const noteData = {
        user_id: user.id,
        contact_id: contactId || null,
        contact_name: contactName,
        delivery_date: date,
        currency,
        subtotal: formTotal,
        total_amount: formTotal,
        notes: notes || null,
        driver_name: driverName || null,
        vehicle_number: vehicleNumber || null,
        delivery_address: deliveryAddress || null,
        status: issueAfterSave ? "issued" : "draft",
      };

      let noteId = editingId;

      if (editingId) {
        await supabase.from("delivery_notes").update(noteData as any).eq("id", editingId);
        await supabase.from("delivery_note_items").delete().eq("delivery_note_id", editingId);
      } else {
        const { data, error } = await supabase.from("delivery_notes").insert(noteData as any).select("id, delivery_number").single();
        if (error) throw error;
        noteId = (data as any).id;
        setNoteNumber((data as any).delivery_number || "");
      }

      const itemsToInsert = items
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

      // If issuing, deduct stock + record stock_movements
      if (issueAfterSave && !editingId) {
        const movementRows: any[] = [];
        for (const item of items) {
          if (item.product_id && item.quantity > 0) {
            const product = products.find(p => p.id === item.product_id);
            if (product && product.product_type !== "service") {
              await supabase.from("products").update({
                quantity: Math.max(0, (product.quantity || 0) - item.quantity),
              }).eq("id", item.product_id);
              movementRows.push({
                user_id: user.id,
                product_id: item.product_id,
                movement_type: "صادر",
                quantity: -Math.abs(item.quantity),
                reference_note: `إرسالية ${noteId?.slice(0, 8)}`,
              });
            }
          }
        }
        if (movementRows.length > 0) {
          await supabase.from("stock_movements").insert(movementRows);
        }
      }

      toast.success(editingId ? "تم تحديث الإرسالية" : issueAfterSave ? "تم إصدار الإرسالية وخصم المخزون ✅" : "تم حفظ الإرسالية كمسودة");
      navigate("/delivery-notes");
    } catch (err: any) {
      toast.error(err.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    // If not saved yet, save first to get the delivery number
    if (!editingId && !noteNumber) {
      if (!user) return;
      if (!contactName.trim()) { toast.error("يرجى إدخال اسم العميل أولاً"); return; }
      if (items.every(i => !i.product_name.trim())) { toast.error("يرجى إضافة بند واحد على الأقل"); return; }
      setSaving(true);
      try {
        const saveData = {
          user_id: user.id,
          contact_id: contactId || null,
          contact_name: contactName,
          delivery_date: date,
          currency,
          subtotal: formTotal,
          total_amount: formTotal,
          notes: notes || null,
          driver_name: driverName || null,
          vehicle_number: vehicleNumber || null,
          delivery_address: deliveryAddress || null,
          status: "draft",
        };
        const { data, error } = await supabase.from("delivery_notes").insert(saveData as any).select("id, delivery_number").single();
        if (error) throw error;
        setNoteNumber((data as any).delivery_number || "");
        setNoteStatus("draft");
        // Save items
        const itemsToSave = items.filter(i => i.product_name.trim()).map((item, idx) => ({
          delivery_note_id: (data as any).id,
          product_id: item.product_id || null,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: item.total,
          notes: item.notes || null,
          sort_order: idx,
        }));
        if (itemsToSave.length > 0) {
          await supabase.from("delivery_note_items").insert(itemsToSave as any);
        }
        toast.success("تم حفظ الإرسالية كمسودة");
        // Update URL to edit mode
        navigate(`/delivery-notes/edit/${(data as any).id}`, { replace: true });
      } catch (err: any) {
        toast.error(err.message || "خطأ في الحفظ");
        return;
      } finally {
        setSaving(false);
      }
      // Wait a tick for state to update
      await new Promise(r => setTimeout(r, 100));
    }

    const noteData = {
      deliveryNumber: noteNumber || "إرسالية جديدة",
      date,
      contactName,
      items: items.filter(i => i.product_name.trim()).map(i => ({
        description: i.product_name,
        quantity: i.quantity,
        unit: i.unit || "",
      })),
      notes,
      driverName,
      vehicleNumber,
      deliveryAddress,
      status: noteStatus,
    };

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head>
      <title>إرسالية ${noteNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(<DeliveryNotePrintView note={noteData} settings={companySettings} />);
        setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  if (loadingNote) {
    return (
      <div style={{ direction: "rtl", padding: "16px 24px", maxWidth: "1200px", margin: "0 auto" }}>
        <div className="flex justify-center py-20 text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <AccountingShell>
    <div style={{ direction: "rtl", padding: "16px 24px 96px", maxWidth: "1200px", margin: "0 auto" }}>
      <PageHeader
        title={isEdit ? `تعديل الإرسالية ${noteNumber}` : "إرسالية مبيعات جديدة"}
        breadcrumb={["المبيعات", "إرساليات المبيعات", isEdit ? noteNumber : "جديدة"]}
      />
      <p className="text-xs text-muted-foreground mt-1 mb-5">وثيقة تسليم بضاعة — تُحوّل لفاتورة لاحقاً حسب القانون</p>

      {/* Show delivery number badge */}
      {(noteNumber || previewNumber) && (
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold text-sm">
            <Package className="h-4 w-4" />
            رقم الإرسالية: {noteNumber || previewNumber}
          </span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
            noteStatus === "issued"
              ? "bg-green-100 text-green-700"
              : noteNumber
                ? "bg-yellow-100 text-yellow-700"
                : "bg-muted text-muted-foreground"
          }`}>
            {noteStatus === "issued" ? "صادرة" : noteNumber ? "مسودة" : "لم تُحفظ بعد"}
          </span>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Customer & Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>العميل</Label>
              <Select
                value={contactId}
                onValueChange={v => {
                  setContactId(v);
                  const c = contacts.find(x => x.id === v);
                  if (c) setContactName(c.contact_name);
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
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الإرسالية</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>العملة</Label>
              <Select value={currency} onValueChange={setCurrency}>
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
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="space-y-2">
              <Label>رقم المركبة</Label>
              <Input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="اختياري" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>عنوان التسليم</Label>
              <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="اختياري" />
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-10">#</TableHead>
                    <TableHead className="text-right min-w-[200px]">المنتج / الصنف</TableHead>
                    <TableHead className="text-right w-24">الكمية</TableHead>
                    <TableHead className="text-right w-28">الوحدة</TableHead>
                    <TableHead className="text-right w-28">السعر</TableHead>
                    <TableHead className="text-right w-28">الإجمالي</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <Select value={item.product_id || ""} onValueChange={v => selectProduct(idx, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="flex items-center gap-2">
                                  {p.name}
                                  {p.product_type === "service"
                                    ? <span className="text-[10px] bg-accent text-accent-foreground px-1.5 rounded">خدمة</span>
                                    : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 rounded">{p.quantity ?? 0}</span>
                                  }
                                </span>
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
                        <Input type="number" min={0} value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="h-9 text-center" dir="ltr" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="h-9 text-center text-xs" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} className="h-9 text-center" dir="ltr" />
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
            </div>
            <div className="flex justify-end mt-3">
              <div className="text-lg font-bold">
                الإجمالي: {formTotal.toLocaleString()} {currency === "شيكل" ? "₪" : currency}
              </div>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-between items-center pt-2 flex-wrap">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" /> طباعة
              </Button>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/delivery-notes")}>إلغاء</Button>
              <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4 ml-2" />
                {saving ? "جاري الحفظ..." : "حفظ كمسودة"}
              </Button>
              {noteStatus !== "issued" && noteStatus !== "converted" && (
                <Button onClick={() => handleSave(true)} disabled={saving} className="gap-2">
                  <Package className="h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "إصدار وخصم المخزون"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </AccountingShell>
  );
};

export default DeliveryNoteCreatePage;
