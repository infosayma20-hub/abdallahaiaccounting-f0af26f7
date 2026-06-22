import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Save, Package, Truck, X, Printer, Eye, Trash2, ChevronRight, ChevronLeft,
  ListChecks, Calculator, CheckCircle, Pencil, Lock, Copy, Factory, ArrowRight,
} from "lucide-react";
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
import { FinanceShell, type ActionTab } from "@/components/finance/shell";

type DeliveryType = "external" | "internal";
type DeliveryStatus = "draft" | "issued" | "converted" | "received" | "cancelled";

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

interface Contact { id: string; contact_name: string; }
interface Product { id: string; name: string; sell_price: number; unit?: string; quantity?: number; product_type?: string; }
interface Warehouse { id: string; name: string; }
interface Branch { id: string; name: string; }

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "مسودة",         color: "#6B7280", bg: "#F3F4F6" },
  issued:    { label: "صادرة",         color: "#2563EB", bg: "#DBEAFE" },
  received:  { label: "مستلمة",        color: "#7C3AED", bg: "#EDE9FE" },
  converted: { label: "محولة لفاتورة", color: "#059669", bg: "#D1FAE5" },
  cancelled: { label: "ملغاة",         color: "#DC2626", bg: "#FEE2E2" },
};

const DeliveryNoteCreatePage = () => {
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const { id: editingId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!editingId;

  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [noteNumber, setNoteNumber] = useState("");
  const [noteStatus, setNoteStatus] = useState<DeliveryStatus>("draft");
  const [previewNumber, setPreviewNumber] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Type
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    (searchParams.get("type") as DeliveryType) === "internal" ? "internal" : "external"
  );

  // Common state
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [items, setItems] = useState<DeliveryItem[]>([{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const [currency, setCurrency] = useState("شيكل");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [linkedInvoiceNumber, setLinkedInvoiceNumber] = useState<string | null>(null);

  // Lookups
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const createdAtRef = useRef<string | null>(null);

  const fetchLookups = useCallback(async () => {
    if (!user) return;
    const [cRes, pRes, wRes, bRes] = await Promise.all([
      (supabase.from("contacts").select("id, contact_name").eq("user_id", user.id) as any).eq("is_archived", false).order("contact_name"),
      supabase.from("products").select("id, name, sell_price, unit, quantity, product_type").eq("user_id", user.id).order("name"),
      supabase.from("warehouses").select("id, name").eq("user_id", user.id).order("name"),
      supabase.from("branches").select("id, name").eq("user_id", user.id).order("name"),
    ]);
    setContacts(cRes.data || []);
    setProducts(pRes.data || []);
    setWarehouses(wRes.data || []);
    setBranches(bRes.data || []);
  }, [user]);

  const loadNote = useCallback(async () => {
    if (!editingId || !user) return;
    setLoadingNote(true);
    const { data: note } = await supabase.from("delivery_notes").select("*").eq("id", editingId).maybeSingle();
    if (!note) {
      toast.error("الإرسالية غير موجودة");
      setLoadingNote(false);
      navigate("/delivery-notes");
      return;
    }
    const n = note as any;
    setNoteNumber(n.delivery_number || "");
    setNoteStatus((n.status || "draft") as DeliveryStatus);
    setDeliveryType((n.delivery_type as DeliveryType) || "external");
    setContactId(n.contact_id || "");
    setContactName(n.contact_name || "");
    setDate(n.delivery_date || new Date().toISOString().split("T")[0]);
    setNotes(n.notes || "");
    setDriverName(n.driver_name || "");
    setVehicleNumber(n.vehicle_number || "");
    setDeliveryAddress(n.delivery_address || "");
    setCurrency(n.currency || "شيكل");
    setFromWarehouseId(n.from_warehouse_id || "");
    setToWarehouseId(n.to_warehouse_id || "");
    setToBranchId(n.to_branch_id || "");
    setLinkedInvoiceNumber(n.invoice_number || null);
    createdAtRef.current = n.created_at;
    // قفل تلقائي لحالات غير draft
    setIsReadOnly(["issued", "converted", "received", "cancelled"].includes(n.status));

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

  // Generate preview number
  useEffect(() => {
    if (isEdit || noteNumber || !user) return;
    (async () => {
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
        const parts = (data[0] as any).delivery_number.split("-");
        const last = parseInt(parts[2] || "0", 10);
        if (!isNaN(last)) nextSeq = last + 1;
      }
      setPreviewNumber(`DN-${currentYear}-${String(nextSeq).padStart(4, "0")}`);
    })();
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
        unit_price: deliveryType === "internal" ? 0 : product.sell_price,
        unit: product.unit || "قطعة",
        total: updated[index].quantity * (deliveryType === "internal" ? 0 : product.sell_price),
      };
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, { product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }]);
  const removeItem = (index: number) => setItems(prev => {
    if (prev.length > 1) return prev.filter((_, i) => i !== index);
    // إذا كان البند الوحيد: أعِد ضبطه ليكون فارغاً بدلاً من الإبقاء عليه
    return [{ product_name: "", quantity: 1, unit: "قطعة", unit_price: 0, total: 0 }];
  });
  const formTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);

  const validate = (issuing: boolean): string | null => {
    if (deliveryType === "external" && !contactName.trim()) return "يرجى إدخال اسم العميل";
    if (deliveryType === "internal") {
      if (!fromWarehouseId) return "يرجى اختيار المخزن المُصدِر";
      if (!toWarehouseId && !toBranchId) return "يرجى اختيار المخزن أو الفرع المستلم";
      if (toWarehouseId && toWarehouseId === fromWarehouseId) return "المخزن المُصدِر والمستلم يجب أن يكونا مختلفين";
    }
    if (issuing && items.every(i => !i.product_name.trim())) return "يرجى إضافة بند واحد على الأقل";
    return null;
  };

  const buildPayload = (issueAfterSave: boolean) => ({
    user_id: user!.id,
    delivery_type: deliveryType,
    contact_id: deliveryType === "external" ? (contactId || null) : null,
    contact_name: deliveryType === "external" ? contactName : null,
    delivery_date: date,
    currency,
    subtotal: deliveryType === "internal" ? 0 : formTotal,
    total_amount: deliveryType === "internal" ? 0 : formTotal,
    notes: notes || null,
    driver_name: driverName || null,
    vehicle_number: vehicleNumber || null,
    delivery_address: deliveryType === "external" ? (deliveryAddress || null) : null,
    from_warehouse_id: fromWarehouseId || null,
    to_warehouse_id: deliveryType === "internal" ? (toWarehouseId || null) : null,
    to_branch_id: deliveryType === "internal" ? (toBranchId || null) : null,
    status: issueAfterSave ? "issued" : "draft",
  });

  const handleSave = async (issueAfterSave = false) => {
    if (!user) return;
    const err = validate(issueAfterSave || isEdit);
    if (err) { toast.error(err); return; }

    setSaving(true);
    try {
      // 1) إنشاء/تعديل المسودة أولاً (دائماً status=draft للإنشاء، أو نُحدّث المسودة الموجودة)
      let noteId = editingId;
      const baseData = buildPayload(false); // احفظ مسودة دائماً، الإصدار خطوة منفصلة

      if (editingId) {
        // التحقق من إمكانية التعديل: فقط draft قابلة للتعديل
        if (noteStatus !== "draft" && !issueAfterSave) {
          toast.error("لا يمكن تعديل إرسالية بعد الإصدار");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("delivery_notes").update(baseData as any).eq("id", editingId);
        if (error) throw error;
        await supabase.from("delivery_note_items").delete().eq("delivery_note_id", editingId);
      } else {
        const { data, error } = await supabase.from("delivery_notes").insert(baseData as any).select("id, delivery_number, created_at").single();
        if (error) throw error;
        noteId = (data as any).id;
        setNoteNumber((data as any).delivery_number || "");
        createdAtRef.current = (data as any).created_at;
      }

      // 2) البنود
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

      // 3) إذا المطلوب إصدار → خطوة منفصلة (trigger DB يتولى خصم المخزون)
      if (issueAfterSave) {
        const { error: issueErr } = await supabase
          .from("delivery_notes")
          .update({ status: "issued" } as any)
          .eq("id", noteId!);
        if (issueErr) throw issueErr;
        setNoteStatus("issued");
        toast.success("تم إصدار الإرسالية وخصم المخزون ✅");
      } else {
        setNoteStatus("draft");
        toast.success(editingId ? "تم تحديث الإرسالية" : "تم حفظ المسودة");
      }

      navigate("/delivery-notes");
    } catch (err: any) {
      toast.error(err.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!editingId) return;
    if (deliveryType === "internal") { toast.error("لا يمكن تحويل إرسالية داخلية لفاتورة"); return; }
    try {
      const { data, error } = await (supabase.rpc as any)("convert_delivery_note_to_invoice", {
        p_delivery_note_id: editingId,
      });
      if (error) throw error;
      toast.success("تم التحويل لفاتورة");
      navigate(`/invoices/new?edit=${data}`);
    } catch (err: any) {
      toast.error(err.message || "خطأ في التحويل");
    }
  };

  const handleReceive = async () => {
    if (!editingId || deliveryType !== "internal" || noteStatus !== "issued") return;
    const { error } = await supabase.from("delivery_notes")
      .update({ status: "received", received_at: new Date().toISOString() } as any).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    setNoteStatus("received");
    toast.success("تم تأكيد الاستلام في المخزن المستلم");
  };

  const handleCancel = async () => {
    if (!editingId) return;
    if (!confirm("هل تريد إلغاء هذه الإرسالية وإعادة المخزون؟")) return;
    const { error } = await supabase.from("delivery_notes")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    setNoteStatus("cancelled");
    toast.success("تم إلغاء الإرسالية وإعادة المخزون");
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!confirm("حذف الإرسالية نهائياً؟")) return;
    const { error } = await supabase.from("delivery_notes").delete().eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    navigate("/delivery-notes");
  };

  const handlePrint = async (preview = false) => {
    if (items.filter(i => i.product_name.trim()).length === 0) {
      toast.info("أضف بنداً واحداً على الأقل");
      return;
    }
    const fromWh = warehouses.find(w => w.id === fromWarehouseId)?.name;
    const toWh = warehouses.find(w => w.id === toWarehouseId)?.name;
    const toBranch = branches.find(b => b.id === toBranchId)?.name;
    const noteData = {
      deliveryNumber: noteNumber || previewNumber || "إرسالية جديدة",
      date,
      contactName,
      items: items.filter(i => i.product_name.trim()).map(i => ({
        description: i.product_name, quantity: i.quantity, unit: i.unit || "",
      })),
      notes, driverName, vehicleNumber, deliveryAddress,
      status: noteStatus,
      deliveryType,
      fromWarehouseName: fromWh,
      toWarehouseName: toWh,
      toBranchName: toBranch,
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
        if (!preview) setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  // التنقل بين الإرساليات
  const goToAdjacent = async (direction: "prev" | "next") => {
    if (!user) return;
    try {
      let q = supabase
        .from("delivery_notes")
        .select("id, created_at")
        .eq("user_id", user.id);
      const cursor = createdAtRef.current;
      if (isEdit && cursor) {
        if (direction === "prev") {
          q = q.lt("created_at", cursor).order("created_at", { ascending: false });
        } else {
          q = q.gt("created_at", cursor).order("created_at", { ascending: true });
        }
      } else {
        q = q.order("created_at", { ascending: direction !== "prev" });
      }
      const { data } = await q.limit(1);
      const target = (data as any[] | null || [])[0];
      if (!target) {
        toast.info(direction === "prev" ? "لا توجد إرسالية سابقة" : "لا توجد إرسالية تالية");
        return;
      }
      navigate(`/delivery-notes/${target.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startNewSimilar = () => {
    // full reload to reset all local state cleanly
    window.location.href = `/delivery-notes/new?type=${deliveryType}`;
  };

  // ─── Action Pane (D365-style) ───
  const actionTabs: ActionTab[] = useMemo(() => {
    const inEdit = isEdit;
    const locked = isReadOnly;
    const isExternal = deliveryType === "external";

    const newGroup = {
      key: "new", label: "جديد", items: [
        { key: "new", label: "إرسالية جديدة", icon: Plus, variant: "primary" as const,
          onClick: () => navigate("/delivery-notes/new?type=external") },
        { key: "new_int", label: "نقل داخلي جديد", icon: Factory,
          onClick: () => navigate("/delivery-notes/new?type=internal") },
        ...(inEdit ? [{ key: "duplicate", label: "إنشاء مشابه", icon: Copy, onClick: startNewSimilar }] : []),
      ],
    };

    const saveGroup = inEdit
      ? {
          key: "save", label: "حفظ", items: [
            { key: "edit", label: locked ? "تعديل" : "إلغاء التعديل", icon: locked ? Pencil : Lock,
              variant: locked ? ("primary" as const) : undefined,
              onClick: () => setIsReadOnly(v => !v),
              disabled: noteStatus === "converted" || noteStatus === "cancelled" },
            { key: "update", label: "حفظ التعديلات", icon: Save, variant: "primary" as const,
              onClick: () => handleSave(false), disabled: locked || saving,
              tooltip: locked ? "اضغط تعديل أولاً" : undefined },
            ...(noteStatus === "draft" ? [{
              key: "issue", label: "إصدار وخصم المخزون", icon: Package, variant: "primary" as const,
              onClick: () => handleSave(true), disabled: saving,
            }] : []),
            ...(isExternal && noteStatus === "issued" ? [{
              key: "to_invoice", label: "تحويل لفاتورة", icon: ArrowRight,
              onClick: handleConvertToInvoice,
            }] : []),
            ...(!isExternal && noteStatus === "issued" ? [{
              key: "receive", label: "تأكيد الاستلام", icon: Factory, variant: "primary" as const,
              onClick: handleReceive,
            }] : []),
            ...(["issued", "received"].includes(noteStatus) ? [{
              key: "cancel", label: "إلغاء وإعادة المخزون", icon: X, onClick: handleCancel,
            }] : []),
            { key: "delete", label: "حذف", icon: Trash2, onClick: handleDelete,
              disabled: noteStatus === "converted" },
          ]
        }
      : {
          key: "save", label: "حفظ", items: [
            { key: "draft", label: "حفظ كمسودة", icon: Save, onClick: () => handleSave(false), disabled: saving },
            { key: "issue", label: "إصدار وخصم المخزون", icon: Package, variant: "primary" as const,
              onClick: () => handleSave(true), disabled: saving },
          ]
        };

    const viewGroup = {
      key: "view", label: "عرض", items: [
        { key: "preview", label: "معاينة", icon: Eye, onClick: () => handlePrint(true) },
        { key: "print",   label: "طباعة",  icon: Printer, onClick: () => handlePrint(false) },
      ]
    };

    const navGroup = {
      key: "nav", label: "تنقل", items: [
        { key: "prev", label: "السابق",   icon: ChevronRight, onClick: () => goToAdjacent("prev") },
        { key: "next", label: "التالي",   icon: ChevronLeft,  onClick: () => goToAdjacent("next") },
        { key: "inquiry", label: "استعلام", icon: ListChecks, onClick: () => navigate("/delivery-notes") },
        { key: "center",  label: "فتح مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
      ]
    };

    return [{ key: "general", label: "عام", groups: [newGroup, saveGroup, viewGroup, navGroup] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isReadOnly, noteStatus, deliveryType, saving, items, contactName, fromWarehouseId, toWarehouseId, toBranchId]);

  if (loadingNote) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground" dir="rtl">جاري التحميل...</div>
    );
  }

  const sc = statusConfig[noteStatus] || statusConfig.draft;
  const formDisabled = isEdit && isReadOnly;

  return (
    <AccountingShell>
    <FinanceShell
      title={isEdit ? `تعديل الإرسالية ${noteNumber}` : (deliveryType === "internal" ? "نقل داخلي جديد" : "إرسالية مبيعات جديدة")}
      subtitle={deliveryType === "internal"
        ? "نقل بين المخازن — يؤثر على المخزون فقط ولا يُحوّل لفاتورة"
        : "وثيقة تسليم بضاعة — تُحوّل لفاتورة لاحقاً حسب القانون"}
      breadcrumb={[
        { label: "النظام", href: "/" },
        { label: "المبيعات" },
        { label: "إرساليات المبيعات", href: "/delivery-notes" },
        { label: isEdit ? noteNumber : "جديدة" },
      ]}
      actionTabs={actionTabs}
    >
      <div className="px-1 pb-32" dir="rtl">
        {/* Header chip */}
        {(noteNumber || previewNumber) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold text-sm">
              <Package className="h-4 w-4" />
              {noteNumber || previewNumber}
            </span>
            <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
            {linkedInvoiceNumber && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
                فاتورة: {linkedInvoiceNumber}
              </span>
            )}
          </div>
        )}

        {/* Type Segmented */}
        {!isEdit && (
          <div className="mb-4 flex gap-2 p-1 bg-muted rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setDeliveryType("external")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                deliveryType === "external" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className="h-4 w-4" /> خارجية (للعميل)
            </button>
            <button
              type="button"
              onClick={() => setDeliveryType("internal")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                deliveryType === "internal" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Factory className="h-4 w-4" /> داخلية (بين المخازن)
            </button>
          </div>
        )}

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* ─── External: العميل + تاريخ + عملة ─── */}
            {deliveryType === "external" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>العميل</Label>
                  <Select value={contactId} onValueChange={v => {
                    setContactId(v);
                    const c = contacts.find(x => x.id === v);
                    if (c) setContactName(c.contact_name);
                  }} disabled={formDisabled}>
                    <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>
                      {contacts.filter(c => c.contact_name).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="أو اكتب الاسم مباشرة" value={contactName}
                    onChange={e => setContactName(e.target.value)} className="mt-1" disabled={formDisabled} />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ الإرسالية</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" disabled={formDisabled} />
                </div>
                <div className="space-y-2">
                  <Label>العملة</Label>
                  <Select value={currency} onValueChange={setCurrency} disabled={formDisabled}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="شيكل">₪ شيكل</SelectItem>
                      <SelectItem value="دولار">$ دولار</SelectItem>
                      <SelectItem value="دينار">د.أ دينار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ─── Internal: من مخزن → إلى مخزن/فرع + تاريخ ─── */}
            {deliveryType === "internal" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>من المخزن <span className="text-destructive">*</span></Label>
                  <Select value={fromWarehouseId} onValueChange={setFromWarehouseId} disabled={formDisabled}>
                    <SelectTrigger><SelectValue placeholder="اختر المخزن المُصدِر" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>إلى المخزن</Label>
                  <Select value={toWarehouseId} onValueChange={v => { setToWarehouseId(v); setToBranchId(""); }} disabled={formDisabled}>
                    <SelectTrigger><SelectValue placeholder="اختر المخزن المستلم" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.filter(w => w.id !== fromWarehouseId).map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>أو إلى فرع</Label>
                  <Select value={toBranchId} onValueChange={v => { setToBranchId(v); setToWarehouseId(""); }} disabled={formDisabled}>
                    <SelectTrigger><SelectValue placeholder="اختر الفرع (اختياري)" /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>تاريخ النقل</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" disabled={formDisabled} />
                </div>
              </div>
            )}

            {/* Driver info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>اسم السائق / المُسلِّم</Label>
                <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="اختياري" disabled={formDisabled} />
              </div>
              <div className="space-y-2">
                <Label>رقم المركبة</Label>
                <Input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="اختياري" dir="ltr" disabled={formDisabled} />
              </div>
              {deliveryType === "external" && (
                <div className="space-y-2">
                  <Label>عنوان التسليم</Label>
                  <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="اختياري" disabled={formDisabled} />
                </div>
              )}
            </div>

            <Separator />

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">البنود</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1" disabled={formDisabled}>
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
                      {deliveryType === "external" && <TableHead className="text-right w-28">السعر</TableHead>}
                      {deliveryType === "external" && <TableHead className="text-right w-28">الإجمالي</TableHead>}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                        <TableCell>
                          <Select value={item.product_id || ""} onValueChange={v => selectProduct(idx, v)} disabled={formDisabled}>
                            <SelectTrigger className="h-9 text-right" dir="rtl"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  <span className="flex items-center gap-2">
                                    {p.name}
                                    {p.product_type === "service"
                                      ? <span className="text-[10px] bg-accent text-accent-foreground px-1.5 rounded">خدمة</span>
                                      : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 rounded">{p.quantity ?? 0}</span>}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!item.product_id && (
                            <Input
                              className="mt-1 h-8 text-xs"
                              placeholder="أو اكتب اسم صنف غير مسجّل (لن يؤثر على المخزون)"
                              value={item.product_name}
                              onChange={e => updateItem(idx, "product_name", e.target.value)}
                              disabled={formDisabled}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} value={item.quantity}
                            onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="h-9 text-center" dir="ltr" disabled={formDisabled} />
                        </TableCell>
                        <TableCell>
                          <Input value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="h-9 text-center text-xs" disabled={formDisabled} />
                        </TableCell>
                        {deliveryType === "external" && (
                          <TableCell>
                            <Input type="number" min={0} value={item.unit_price}
                              onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} className="h-9 text-center" dir="ltr" disabled={formDisabled} />
                          </TableCell>
                        )}
                        {deliveryType === "external" && (
                          <TableCell className="font-semibold text-sm">{item.total.toLocaleString()}</TableCell>
                        )}
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)} disabled={formDisabled}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {deliveryType === "external" && (
                <div className="flex justify-end mt-3">
                  <div className="text-lg font-bold">
                    الإجمالي: {formTotal.toLocaleString()} {currency === "شيكل" ? "₪" : currency}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} disabled={formDisabled} />
            </div>
          </CardContent>
        </Card>
      </div>
    </FinanceShell>
    </AccountingShell>
  );
};

export default DeliveryNoteCreatePage;