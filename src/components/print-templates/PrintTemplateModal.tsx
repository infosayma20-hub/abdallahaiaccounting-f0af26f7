import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Pencil, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import type { TemplateConfig } from "@/pages/PrintTemplatesPage";
import PrintTemplatePreview from "./PrintTemplatePreview";
import { isDoulia } from "@/lib/print-themes";
import StyleSelector from "./StyleSelector";
import { applyStyle, type WritingStyle } from "./writingStyles";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: TemplateConfig;
  onSaved: () => void;
  /** Optional preset data (e.g. from sector library) to prefill the form. */
  initialData?: Record<string, any>;
}

const PrintTemplateModal = ({ open, onOpenChange, template, onSaved, initialData }: Props) => {
  const { user } = useAuth();
  const showExtendedFields = isDoulia(user?.email);
  const [contactName, setContactName] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // QUO fields
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0 }]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [validityDays, setValidityDays] = useState(30);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [quoSpecs, setQuoSpecs] = useState("");
  const [quoProjectDesc, setQuoProjectDesc] = useState("");

  // CON fields
  const [workDescription, setWorkDescription] = useState("");
  const [contractValue, setContractValue] = useState(0);
  const [executionPeriod, setExecutionPeriod] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");

  // DEM / DN / CN / OD fields
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [refInvoice, setRefInvoice] = useState("");
  const [responseDays, setResponseDays] = useState(7);
  const [urgencyLevel, setUrgencyLevel] = useState("gentle");

  // RCP fields
  const [receiveType, setReceiveType] = useState("بضاعة");
  const [condition, setCondition] = useState("سليم");
  const [receiverName, setReceiverName] = useState("");

  // SUP fields
  const [supplierName, setSupplierName] = useState("");
  const [contractFrom, setContractFrom] = useState("");
  const [contractTo, setContractTo] = useState("");
  const [supplyTerms, setSupplyTerms] = useState("");

  // POA fields
  const [delegateName, setDelegateName] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [poaFrom, setPoaFrom] = useState("");
  const [poaTo, setPoaTo] = useState("");
  const [targetEntity, setTargetEntity] = useState("");

  // CLR fields
  const [clrSubject, setClrSubject] = useState("");

  // Selected writing style for this draft
  const [writingStyle, setWritingStyle] = useState<WritingStyle | null>(null);

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = vatEnabled ? afterDiscount * 0.16 : 0;
  const total = afterDiscount + vatAmount;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const buildData = () => {
    switch (template.type) {
      case "QUO": return { items, discount_percent: discountPercent, vat_enabled: vatEnabled, validity_days: validityDays, payment_terms: paymentTerms, subtotal, total, notes, contact_address: contactAddress, specs: quoSpecs, work_description: quoProjectDesc };
      case "CON": return { work_description: workDescription, contract_value: contractValue, execution_period: executionPeriod, warranty_terms: warrantyTerms, notes, contact_address: contactAddress };
      case "DEM": return { amount, response_days: responseDays, notes, contact_address: contactAddress };
      case "DN": return { amount, reason, ref_invoice: refInvoice, notes };
      case "CN": return { amount, reason, ref_invoice: refInvoice, notes };
      case "RCP": return { receive_type: receiveType, amount, condition, receiver_name: receiverName, notes };
      case "SUP": return { supplier_name: supplierName, items, contract_from: contractFrom, contract_to: contractTo, supply_terms: supplyTerms, notes, contact_address: contactAddress };
      case "OD": return { amount, response_days: responseDays, urgency_level: urgencyLevel, notes };
      case "POA": return { delegate_name: delegateName, delegate_id: delegateId, poa_from: poaFrom, poa_to: poaTo, target_entity: targetEntity, notes };
      case "CLR": return { subject: clrSubject, notes, contact_address: contactAddress };
      default: return { notes };
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Get next number
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("print_documents")
        .select("id", { count: "exact", head: true })
        .eq("template_type", template.type);

      const seq = String((count || 0) + 1).padStart(4, "0");
      const docNumber = `${template.prefix}-${year}-${seq}`;

      const { error } = await supabase.from("print_documents").insert({
        user_id: dataOwnerId!,
        template_type: template.type,
        document_number: docNumber,
        contact_name: contactName || null,
        document_date: docDate,
        validity_days: validityDays,
        data: buildData(),
        status: "draft",
      });

      if (error) throw error;
      toast({ title: `✅ تم إنشاء ${template.title} ${docNumber} بنجاح` });
      onSaved();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const renderFields = () => {
    switch (template.type) {
      case "QUO":
        return (
           <div className="space-y-4">
            {showExtendedFields && (
              <div className="space-y-3">
                <div><Label>وصف المشروع / المطبخ</Label><Input value={quoProjectDesc} onChange={e => setQuoProjectDesc(e.target.value)} placeholder="مثال: مطبخ فيلا ألمنيوم 12 متر" /></div>
                <div><Label>المواصفات التفصيلية</Label><Textarea value={quoSpecs} onChange={e => setQuoSpecs(e.target.value)} rows={4} placeholder="أدخل مواصفات المشروع بالتفصيل..." /></div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-semibold">بنود عرض السعر</Label>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input placeholder="البند/الخدمة" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} className="flex-1" />
                  <Input type="number" placeholder="الكمية" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="w-20" />
                  <Input type="number" placeholder="سعر الوحدة" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="w-28" />
                  <span className="text-sm font-medium w-24 text-left">₪{fmt(item.quantity * item.unit_price)}</span>
                  {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5 ml-1" /> إضافة بند</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الخصم %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountPercent}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setDiscountPercent(Math.min(100, Math.max(0, v)));
                  }}
                />
              </div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={vatEnabled} onCheckedChange={setVatEnabled} /><Label>ضريبة القيمة المضافة (16%)</Label></div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>المجموع الفرعي:</span><span>₪{fmt(subtotal)}</span></div>
              {discountPercent > 0 && <div className="flex justify-between text-destructive"><span>الخصم ({discountPercent}%):</span><span>-₪{fmt(discountAmount)}</span></div>}
              {vatEnabled && <div className="flex justify-between"><span>ضريبة (16%):</span><span>₪{fmt(vatAmount)}</span></div>}
              <div className="flex justify-between font-bold border-t pt-1"><span>الإجمالي النهائي:</span><span>₪{fmt(total)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>صلاحية العرض (أيام)</Label><Input type="number" value={validityDays} onChange={e => setValidityDays(+e.target.value)} /></div>
              <div><Label>شروط الدفع</Label><Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="مثال: 50% مقدم، 50% عند التسليم" /></div>
            </div>
          </div>
        );

      case "CON":
        return (
          <div className="space-y-3">
            <div><Label>وصف العمل المتفق عليه</Label><Textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>القيمة الإجمالية للعقد</Label><Input type="number" value={contractValue} onChange={e => setContractValue(+e.target.value)} /></div>
              <div><Label>مدة التنفيذ</Label><Input value={executionPeriod} onChange={e => setExecutionPeriod(e.target.value)} /></div>
            </div>
            <div><Label>شروط الضمان</Label><Textarea value={warrantyTerms} onChange={e => setWarrantyTerms(e.target.value)} rows={2} /></div>
          </div>
        );

      case "DEM":
        return (
          <div className="space-y-3">
            <div><Label>المبلغ المستحق</Label><Input type="number" value={amount} onChange={e => setAmount(+e.target.value)} /></div>
            <div><Label>مدة الرد (أيام)</Label><Input type="number" value={responseDays} onChange={e => setResponseDays(+e.target.value)} /></div>
          </div>
        );

      case "DN":
      case "CN":
        return (
          <div className="space-y-3">
            <div><Label>المبلغ</Label><Input type="number" value={amount} onChange={e => setAmount(+e.target.value)} /></div>
            <div><Label>السبب</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} /></div>
            <div><Label>رقم الفاتورة المرجعية</Label><Input value={refInvoice} onChange={e => setRefInvoice(e.target.value)} /></div>
          </div>
        );

      case "RCP":
        return (
          <div className="space-y-3">
            <div><Label>نوع المستلَم</Label>
              <select className="w-full border rounded-md p-2 text-sm" value={receiveType} onChange={e => setReceiveType(e.target.value)}>
                <option value="بضاعة">بضاعة</option>
                <option value="مبلغ">مبلغ</option>
                <option value="وثائق">وثائق</option>
              </select>
            </div>
            <div><Label>الكمية / المبلغ</Label><Input type="number" value={amount} onChange={e => setAmount(+e.target.value)} /></div>
            <div><Label>الحالة</Label>
              <select className="w-full border rounded-md p-2 text-sm" value={condition} onChange={e => setCondition(e.target.value)}>
                <option value="سليم">سليم</option>
                <option value="تالف جزئياً">تالف جزئياً</option>
              </select>
            </div>
            <div><Label>اسم المستلِم</Label><Input value={receiverName} onChange={e => setReceiverName(e.target.value)} /></div>
          </div>
        );

      case "SUP":
        return (
          <div className="space-y-3">
            <div><Label>اسم المورد</Label><Input value={supplierName} onChange={e => setSupplierName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>المواد المتفق عليها</Label>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input placeholder="المادة" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} className="flex-1" />
                  <Input type="number" placeholder="الكمية" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="w-20" />
                  <Input type="number" placeholder="السعر" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="w-28" />
                  {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5 ml-1" /> إضافة مادة</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من تاريخ</Label><Input type="date" value={contractFrom} onChange={e => setContractFrom(e.target.value)} /></div>
              <div><Label>إلى تاريخ</Label><Input type="date" value={contractTo} onChange={e => setContractTo(e.target.value)} /></div>
            </div>
            <div><Label>شروط التوريد والدفع</Label><Textarea value={supplyTerms} onChange={e => setSupplyTerms(e.target.value)} rows={2} /></div>
          </div>
        );

      case "OD":
        return (
          <div className="space-y-3">
            <div><Label>المبلغ المتأخر</Label><Input type="number" value={amount} onChange={e => setAmount(+e.target.value)} /></div>
            <div><Label>آخر موعد للسداد</Label><Input type="number" value={responseDays} onChange={e => setResponseDays(+e.target.value)} placeholder="أيام" /></div>
            <div><Label>مستوى التحذير</Label>
              <select className="w-full border rounded-md p-2 text-sm" value={urgencyLevel} onChange={e => setUrgencyLevel(e.target.value)}>
                <option value="gentle">تذكير لطيف</option>
                <option value="firm">تحذير حازم</option>
                <option value="final">إنذار نهائي</option>
              </select>
            </div>
          </div>
        );

      case "POA":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>اسم المفوَّض</Label><Input value={delegateName} onChange={e => setDelegateName(e.target.value)} /></div>
              <div><Label>رقم الهوية</Label><Input value={delegateId} onChange={e => setDelegateId(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من تاريخ</Label><Input type="date" value={poaFrom} onChange={e => setPoaFrom(e.target.value)} /></div>
              <div><Label>إلى تاريخ</Label><Input type="date" value={poaTo} onChange={e => setPoaTo(e.target.value)} /></div>
            </div>
            <div><Label>جهة التعامل المفوَّض لديها</Label><Input value={targetEntity} onChange={e => setTargetEntity(e.target.value)} /></div>
          </div>
        );

      case "CLR":
        return (
          <div className="space-y-3">
            <div><Label>موضوع إخلاء الطرف</Label><Textarea value={clrSubject} onChange={e => setClrSubject(e.target.value)} rows={3} /></div>
          </div>
        );

      default: return null;
    }
  };

  const [activeTab, setActiveTab] = useState<"create" | "preview">("create");

  // Reset tab when modal opens
  useEffect(() => {
    if (open) setActiveTab("create");
  }, [open]);

  /** Helper to load a data object (from preset or style) into the typed setters. */
  const loadData = (d: Record<string, any>) => {
    if (d.items && Array.isArray(d.items) && d.items.length) setItems(d.items);
    if (d.discount_percent !== undefined) setDiscountPercent(Number(d.discount_percent) || 0);
    if (d.vat_enabled !== undefined) setVatEnabled(!!d.vat_enabled);
    if (d.validity_days !== undefined) setValidityDays(Number(d.validity_days) || 30);
    if (d.payment_terms !== undefined) setPaymentTerms(d.payment_terms);
    if (d.specs !== undefined) setQuoSpecs(d.specs);
    if (d.work_description !== undefined) {
      setQuoProjectDesc(d.work_description);
      setWorkDescription(d.work_description);
    }
    if (d.contract_value !== undefined) setContractValue(Number(d.contract_value) || 0);
    if (d.execution_period !== undefined) setExecutionPeriod(d.execution_period);
    if (d.warranty_terms !== undefined) setWarrantyTerms(d.warranty_terms);
    if (d.amount !== undefined) setAmount(Number(d.amount) || 0);
    if (d.reason !== undefined) setReason(d.reason);
    if (d.ref_invoice !== undefined) setRefInvoice(d.ref_invoice);
    if (d.response_days !== undefined) setResponseDays(Number(d.response_days) || 7);
    if (d.urgency_level !== undefined) setUrgencyLevel(d.urgency_level);
    if (d.receive_type !== undefined) setReceiveType(d.receive_type);
    if (d.condition !== undefined) setCondition(d.condition);
    if (d.receiver_name !== undefined) setReceiverName(d.receiver_name);
    if (d.supplier_name !== undefined) setSupplierName(d.supplier_name);
    if (d.contract_from !== undefined) setContractFrom(d.contract_from);
    if (d.contract_to !== undefined) setContractTo(d.contract_to);
    if (d.supply_terms !== undefined) setSupplyTerms(d.supply_terms);
    if (d.delegate_name !== undefined) setDelegateName(d.delegate_name);
    if (d.delegate_id !== undefined) setDelegateId(d.delegate_id);
    if (d.poa_from !== undefined) setPoaFrom(d.poa_from);
    if (d.poa_to !== undefined) setPoaTo(d.poa_to);
    if (d.target_entity !== undefined) setTargetEntity(d.target_entity);
    if (d.subject !== undefined || d.clr_subject !== undefined) setClrSubject(d.subject ?? d.clr_subject);
    if (d.notes !== undefined) setNotes(d.notes);
    if (d.contact_address !== undefined) setContactAddress(d.contact_address);
  };

  // Apply preset data when modal opens with initialData (from sector library).
  useEffect(() => {
    if (open && initialData) {
      loadData(initialData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  /** Apply a writing style — fills empty text fields with the style's defaults. */
  const handleStyleChange = (style: WritingStyle) => {
    setWritingStyle(style);
    const current = {
      payment_terms: paymentTerms,
      warranty_terms: warrantyTerms,
      notes,
      work_description: workDescription || quoProjectDesc,
      supply_terms: supplyTerms,
      reason,
      clr_subject: clrSubject,
    };
    const next = applyStyle(template.type, style, current);
    loadData(next);
  };

  const previewDoc = {
    template_type: template.type,
    data: {},
    document_number: `${template.prefix}-0000`,
    document_date: new Date().toISOString().split("T")[0],
    contact_name: "—",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {template.title}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border mb-3">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "create"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            إنشاء جديد
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "preview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            معاينة نموذج فارغ
          </button>
        </div>

        {activeTab === "create" ? (
          <div className="space-y-4">
            {/* Common fields */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>المستلم / الجهة</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="اسم العميل أو الجهة" /></div>
              <div><Label>التاريخ</Label><Input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} /></div>
            </div>

            {(template.type === "QUO" || template.type === "CON" || template.type === "DEM" || template.type === "SUP" || template.type === "CLR") && (
              <div><Label>العنوان / الجهة</Label><Input value={contactAddress} onChange={e => setContactAddress(e.target.value)} /></div>
            )}

            {/* Writing Style picker — fills empty text fields with selected tone */}
            <StyleSelector value={writingStyle} onChange={handleStyleChange} />

            {/* Template-specific fields */}
            {renderFields()}

            {/* Notes */}
            <div><Label>ملاحظات إضافية (اختياري)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : `إنشاء ${template.title}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-h-[400px]">
            <PrintTemplatePreview
              open={true}
              onOpenChange={() => setActiveTab("create")}
              document={previewDoc}
              embedded={true}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PrintTemplateModal;
