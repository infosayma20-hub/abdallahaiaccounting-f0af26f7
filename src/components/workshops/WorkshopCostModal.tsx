import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, UserPlus, Upload, Check } from "lucide-react";

/* ── Cost Categories ── */
export const COST_CATEGORIES = [
  { value: "wood_natural", label: "خشب طبيعي", icon: "🪵" },
  { value: "mdf", label: "MDF / ضغط", icon: "🟫" },
  { value: "glass", label: "زجاج", icon: "🪟" },
  { value: "paint", label: "دهان / بويا", icon: "🎨" },
  { value: "varnish", label: "فيرنيش / لكر", icon: "✨" },
  { value: "marble", label: "رخام / حجر", icon: "🏔️" },
  { value: "hardware", label: "عدد ومسامير", icon: "🔩" },
  { value: "labor", label: "أجر عمال", icon: "🛠️" },
  { value: "transport", label: "نقل وتوصيل", icon: "🚚" },
  { value: "countertop", label: "كرستا / كاونتر", icon: "🏺" },
  { value: "electricity", label: "كهرباء", icon: "💡" },
  { value: "adhesive", label: "غراء / سيليكون", icon: "🧴" },
  { value: "veneer", label: "تلبيس / فورمايكا", icon: "🔧" },
  { value: "fittings", label: "ملحقات تركيب", icon: "🔗" },
  { value: "other", label: "أخرى", icon: "📦" },
];

/* ── Units per category ── */
const UNITS_MAP: Record<string, { value: string; label: string }[]> = {
  wood_natural: [
    { value: "m2", label: "م²" }, { value: "m3", label: "م³" },
    { value: "sheet", label: "لوح" }, { value: "piece", label: "قطعة" }, { value: "linear_m", label: "متر طولي" },
  ],
  mdf: [
    { value: "m2", label: "م²" }, { value: "m3", label: "م³" },
    { value: "sheet", label: "لوح" }, { value: "piece", label: "قطعة" }, { value: "linear_m", label: "متر طولي" },
  ],
  glass: [{ value: "m2", label: "م²" }, { value: "piece", label: "قطعة" }],
  paint: [{ value: "liter", label: "لتر" }, { value: "kg", label: "كيلو" }, { value: "can_18L", label: "صفيحة (18L)" }],
  varnish: [{ value: "liter", label: "لتر" }, { value: "kg", label: "كيلو" }, { value: "can_18L", label: "صفيحة (18L)" }],
  marble: [{ value: "m2", label: "م²" }, { value: "piece", label: "قطعة" }, { value: "linear_m", label: "متر طولي" }],
  hardware: [{ value: "kg", label: "كيلو" }, { value: "box", label: "علبة" }, { value: "piece", label: "قطعة" }],
  labor: [{ value: "day", label: "يوم" }, { value: "hour", label: "ساعة" }, { value: "piece_work", label: "قطعية" }],
  transport: [{ value: "trip", label: "رحلة" }, { value: "lump_sum", label: "مبلغ مقطوع" }],
  countertop: [{ value: "linear_m", label: "متر طولي" }, { value: "m2", label: "م²" }],
  electricity: [{ value: "kwh", label: "كيلوواط" }, { value: "lump_sum", label: "مبلغ شهري" }],
  adhesive: [{ value: "kg", label: "كيلو" }, { value: "carton", label: "كارتون" }, { value: "piece", label: "قطعة" }],
  veneer: [{ value: "m2", label: "م²" }, { value: "sheet", label: "لوح" }, { value: "linear_m", label: "متر طولي" }],
  fittings: [{ value: "piece", label: "قطعة" }, { value: "box", label: "علبة" }, { value: "kg", label: "كيلو" }],
  other: [{ value: "manual", label: "يدوي" }],
};

const WASTE_CATEGORIES = ["wood_natural", "mdf", "glass", "marble", "veneer"];

export const PHASES = [
  { value: "preparation", label: "تجهيز المواد" },
  { value: "manufacturing", label: "التصنيع" },
  { value: "finishing", label: "التشطيب" },
  { value: "installation", label: "التركيب" },
  { value: "delivery", label: "التسليم" },
];

/* ── GL Mapping ── */
export const CATEGORY_GL_MAP: Record<string, { debit: string; label: string }> = {
  wood_natural: { debit: "5351", label: "مواد خام (خشب)" },
  mdf: { debit: "5351", label: "مواد خام (خشب)" },
  glass: { debit: "5351", label: "مواد خام" },
  paint: { debit: "5352", label: "دهان ومواد تشطيب" },
  varnish: { debit: "5352", label: "دهان ومواد تشطيب" },
  marble: { debit: "5351", label: "مواد خام" },
  hardware: { debit: "5351", label: "مواد خام" },
  labor: { debit: "5353", label: "أجور عمال الورشات" },
  transport: { debit: "5354", label: "نقل وتوصيل ورشات" },
  countertop: { debit: "5351", label: "مواد خام" },
  electricity: { debit: "5359", label: "تكاليف ورشات أخرى" },
  adhesive: { debit: "5352", label: "دهان ومواد تشطيب" },
  veneer: { debit: "5352", label: "دهان ومواد تشطيب" },
  fittings: { debit: "5351", label: "مواد خام" },
  other: { debit: "5359", label: "تكاليف ورشات أخرى" },
};

export const PAYMENT_CREDIT_MAP: Record<string, string> = {
  "نقدي": "1110",
  "بنك": "1120",
  "آجل": "2110",
};

const PLACEHOLDERS: Record<string, string> = {
  wood_natural: "مثل: خشب سويدي 18مم — 120×240",
  mdf: "مثل: MDF 16مم أبيض — 244×122",
  glass: "مثل: زجاج سيكوريت 10مم شفاف",
  paint: "مثل: بويا واجهات MDF — طبقتين",
  varnish: "مثل: فيرنيش مط — طبقة نهائية",
  marble: "مثل: رخام كريمة — سماكة 2سم",
  hardware: "مثل: مسامير 4سم + غراء خشب",
  labor: "مثل: نجار يومية + مساعد — 2 يوم",
  transport: "مثل: نقل مطبخ من المعمل للموقع",
  countertop: "مثل: كرستا 3سم — 4 متر طولي",
  electricity: "مثل: تمديدات كهرباء المطبخ",
  adhesive: "مثل: سيليكون شفاف + غراء خشب PVA",
  veneer: "مثل: فورمايكا بلوط — لوح 122×244",
  fittings: "مثل: مفصلات بلوم + سكة درج",
  other: "وصف البند...",
};

type Contact = { id: string; contact_name: string; contact_type: string; current_balance: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workshopId: string;
  workshopName: string;
  userId: string;
  contacts: Contact[];
  onSaved: () => void;
  onContactsReload: () => void;
}

export default function WorkshopCostModal({ open, onOpenChange, workshopId, workshopName, userId, contacts, onSaved, onContactsReload }: Props) {
  const [category, setCategory] = useState("wood_natural");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("m2");
  const [unitPrice, setUnitPrice] = useState(0);
  const [wasteEnabled, setWasteEnabled] = useState(false);
  const [wastePct, setWastePct] = useState(10);
  const [phase, setPhase] = useState("preparation");
  const [description, setDescription] = useState("");
  const [costDate, setCostDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [supplierContactId, setSupplierContactId] = useState<string | null>(null);
  const [supplierNameManual, setSupplierNameManual] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [saving, setSaving] = useState(false);

  const availableUnits = useMemo(() => UNITS_MAP[category] || UNITS_MAP.other, [category]);
  const showWaste = WASTE_CATEGORIES.includes(category);

  useEffect(() => {
    const units = UNITS_MAP[category] || UNITS_MAP.other;
    setUnit(units[0]?.value || "piece");
    if (!WASTE_CATEGORIES.includes(category)) setWasteEnabled(false);
  }, [category]);

  const effectiveQty = useMemo(() => wasteEnabled && wastePct > 0 ? quantity * (1 + wastePct / 100) : quantity, [quantity, wasteEnabled, wastePct]);
  const totalAmount = useMemo(() => Math.round(effectiveQty * unitPrice * 100) / 100, [effectiveQty, unitPrice]);
  const wasteAmount = useMemo(() => wasteEnabled ? Math.round((effectiveQty - quantity) * unitPrice * 100) / 100 : 0, [effectiveQty, quantity, unitPrice, wasteEnabled]);

  const filteredSuppliers = useMemo(() =>
    contacts.filter(c => !supplierSearch || c.contact_name.toLowerCase().includes(supplierSearch.toLowerCase()))
  , [contacts, supplierSearch]);

  const glInfo = CATEGORY_GL_MAP[category] || CATEGORY_GL_MAP.other;
  const creditCode = PAYMENT_CREDIT_MAP[paymentMethod] || "1110";

  const canSave = totalAmount > 0;

  const resetForm = () => {
    setCategory("wood_natural"); setQuantity(1); setUnit("m2"); setUnitPrice(0);
    setWasteEnabled(false); setWastePct(10); setPhase("preparation");
    setDescription(""); setCostDate(format(new Date(), "yyyy-MM-dd"));
    setSupplierSearch(""); setSupplierContactId(null); setSupplierNameManual("");
    setInvoiceNumber(""); setPaymentMethod("نقدي");
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const idempotencyKey = `WS-COST-${workshopId}-${Date.now()}`;
      const supplierName = supplierContactId ? contacts.find(c => c.id === supplierContactId)?.contact_name || supplierNameManual : supplierNameManual;
      const txDesc = `${glInfo.label} - ورشة ${workshopName}${supplierName ? ` (${supplierName})` : ""}`;

      // 1. Journal entry
      const { data: txData, error: txErr } = await supabase.from("transactions").insert({
        user_id: userId, transaction_date: costDate, description: txDesc,
        debit_account_code: glInfo.debit, credit_account_code: creditCode,
        amount: totalAmount, currency: "شيكل", transaction_type: "workshop_cost",
        contact_id: supplierContactId || null,
        reference: `WS-${workshopName.substring(0, 20)}`,
        payment_method: paymentMethod, idempotency_key: idempotencyKey,
      } as any).select("id").single();
      if (txErr) { toast.error("خطأ في القيد: " + txErr.message); return; }

      // 2. Cost record with new fields
      // Map new category back to old cost_type for backward compat
      const costTypeMap: Record<string, string> = {
        wood_natural: "wood", mdf: "wood", glass: "glass", paint: "paint", varnish: "paint",
        marble: "marble", hardware: "hardware", labor: "labor", transport: "transport",
        countertop: "crystal", electricity: "other", adhesive: "paint",
        veneer: "paint", fittings: "hardware", other: "other",
      };

      const { error: costErr } = await supabase.from("workshop_costs").insert({
        workshop_id: workshopId, user_id: userId,
        cost_type: costTypeMap[category] || "other",
        category, description: description || null,
        amount: totalAmount, cost_date: costDate,
        quantity, unit, unit_price: unitPrice,
        waste_percentage: wasteEnabled ? wastePct : 0,
        waste_amount: wasteAmount,
        phase, supplier_name: supplierName || null,
        supplier_contact_id: supplierContactId || null,
        invoice_number: invoiceNumber || null,
        payment_method: paymentMethod, notes: null,
        linked_transaction_id: txData?.id || null,
      } as any);
      if (costErr) { toast.error(costErr.message); return; }

      // 3. Supplier balance update for credit
      if (paymentMethod === "آجل" && supplierContactId) {
        const bal = contacts.find(c => c.id === supplierContactId)?.current_balance || 0;
        await supabase.from("contacts").update({ current_balance: bal + totalAmount } as any).eq("id", supplierContactId);
      }

      toast.success(`✅ تم تسجيل التكلفة وإنشاء القيد (${glInfo.debit} ← ${creditCode})`);
      resetForm();
      onOpenChange(false);
      onSaved();
      onContactsReload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg">إضافة تكلفة</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── 1. Category Grid ── */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">نوع التكلفة</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {COST_CATEGORIES.map(ct => (
                <button key={ct.value} onClick={() => setCategory(ct.value)}
                  className={`relative p-2.5 rounded-xl border-2 text-center transition-all ${
                    category === ct.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-accent/5"
                  }`}>
                  {category === ct.value && (
                    <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </span>
                  )}
                  <span className="text-xl block">{ct.icon}</span>
                  <span className="text-[10px] font-medium text-foreground block mt-0.5">{ct.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              القيد: مدين {glInfo.debit} ({glInfo.label}) ← دائن {creditCode}
            </p>
          </div>

          {/* ── 2. Line Item Details ── */}
          <div className="space-y-3">
            {/* Total (auto) */}
            <div className="rounded-xl bg-accent/5 border border-border p-3 text-center">
              <p className="text-[10px] text-muted-foreground">المبلغ الإجمالي</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{totalAmount.toLocaleString()} ₪</p>
              {wasteEnabled && wasteAmount > 0 && (
                <p className="text-[10px] text-amber-600">يشمل هدر {wasteAmount.toLocaleString()} ₪</p>
              )}
            </div>

            {/* Qty + Unit + Unit Price */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">الكمية</Label>
                <Input type="number" min={0} step="any" value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">الوحدة</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableUnits.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">سعر الوحدة (₪)</Label>
                <Input type="number" min={0} step="any" value={unitPrice || ""} onChange={e => setUnitPrice(Number(e.target.value))} />
              </div>
            </div>

            {/* Waste Toggle */}
            {showWaste && (
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">احتساب نسبة هدر (Waste %)</Label>
                  <Switch checked={wasteEnabled} onCheckedChange={setWasteEnabled} />
                </div>
                {wasteEnabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <Input type="number" min={0} max={50} value={wastePct} onChange={e => setWastePct(Number(e.target.value))} className="w-20 h-8 text-sm" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      الكمية الصافية: {quantity} {availableUnits.find(u => u.value === unit)?.label} | مع الهدر: {effectiveQty.toFixed(2)} {availableUnits.find(u => u.value === unit)?.label}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Date + Phase */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">التاريخ 📅</Label>
                <Input type="date" value={costDate} onChange={e => setCostDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">المرحلة 🏗️</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-[11px]">وصف تفصيلي</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder={PLACEHOLDERS[category] || "وصف البند..."} rows={2} />
            </div>

            {/* Supplier */}
            <div className="space-y-1">
              <Label className="text-[11px]">المورد 🏪</Label>
              {supplierContactId ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-border">
                  <span className="text-sm flex-1 text-foreground">
                    {contacts.find(c => c.id === supplierContactId)?.contact_name || supplierNameManual}
                  </span>
                  <Badge variant="outline" className="text-[9px]">{contacts.find(c => c.id === supplierContactId)?.contact_type}</Badge>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setSupplierContactId(null); setSupplierNameManual(""); }}>✕</Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setShowSupplierPicker(true); }}
                      onFocus={() => setShowSupplierPicker(true)} placeholder="ابحث عن مورد أو زبون..." className="pr-8" />
                  </div>
                  {showSupplierPicker && supplierSearch && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
                      {filteredSuppliers.slice(0, 8).map(s => (
                        <button key={s.id} onClick={() => { setSupplierContactId(s.id); setSupplierNameManual(s.contact_name); setShowSupplierPicker(false); setSupplierSearch(""); }}
                          className="w-full text-right px-3 py-1.5 text-sm hover:bg-accent/10 text-foreground flex items-center justify-between">
                          <span>{s.contact_name}</span>
                          <Badge variant="outline" className="text-[9px]">{s.contact_type}</Badge>
                        </button>
                      ))}
                      {filteredSuppliers.length === 0 && supplierSearch.trim().length > 1 && (
                        <button onClick={async () => {
                          const name = supplierSearch.trim();
                          const { data, error } = await supabase.from("contacts").upsert(
                            { contact_name: name, contact_type: "مورد", user_id: userId, current_balance: 0 },
                            { onConflict: "contact_name,user_id" }
                          ).select().single();
                          if (error) { toast.error("خطأ في إضافة المورد"); return; }
                          toast.success(`تم إضافة "${name}" كمورد`);
                          setSupplierContactId(data.id); setSupplierNameManual(data.contact_name);
                          setShowSupplierPicker(false); setSupplierSearch("");
                          onContactsReload();
                        }} className="w-full text-right px-3 py-2 text-sm hover:bg-primary/10 text-primary font-medium flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5" /> إضافة "{supplierSearch.trim()}" كمورد جديد
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Invoice number */}
            <div className="space-y-1">
              <Label className="text-[11px]">رقم الفاتورة (اختياري)</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="رقم فاتورة الشراء..." />
            </div>

          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="gap-2">
            {saving ? "جاري الحفظ..." : "حفظ التكلفة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
