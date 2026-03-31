import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, UserPlus, Check, AlertTriangle, Package, X } from "lucide-react";

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
  wood_natural: [{ value: "m2", label: "م²" }, { value: "m3", label: "م³" }, { value: "sheet", label: "لوح" }, { value: "piece", label: "قطعة" }, { value: "linear_m", label: "متر طولي" }],
  mdf: [{ value: "m2", label: "م²" }, { value: "m3", label: "م³" }, { value: "sheet", label: "لوح" }, { value: "piece", label: "قطعة" }, { value: "linear_m", label: "متر طولي" }],
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

const MATERIAL_CATEGORIES = ["wood_natural", "mdf", "glass", "marble", "veneer", "countertop", "paint", "varnish", "adhesive", "hardware", "fittings"];
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
type Workshop = { id: string; name: string; status: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workshopId: string;
  workshopName: string;
  userId: string;
  contacts: Contact[];
  onSaved: () => void;
  onContactsReload: () => void;
  allWorkshops?: Workshop[];
}

export default function WorkshopCostModal({ open, onOpenChange, workshopId, workshopName, userId, contacts, onSaved, onContactsReload, allWorkshops = [] }: Props) {
  const [category, setCategory] = useState("wood_natural");
  const [purchasedQty, setPurchasedQty] = useState(0);
  const [usedQty, setUsedQty] = useState(0);
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
  const [paymentMethod, setPaymentMethod] = useState("آجل");
  const [saving, setSaving] = useState(false);
  
  // Surplus handling
  const [surplusAction, setSurplusAction] = useState<"inventory" | "transfer" | "pending">("inventory");
  const [transferTargetId, setTransferTargetId] = useState<string>("");

  // Inventory usage
  const [useFromInventory, setUseFromInventory] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>("");
  const [inventoryUseQty, setInventoryUseQty] = useState(0);

  // Custom cost categories
  const [customCategories, setCustomCategories] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load custom categories
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data } = await supabase.from("custom_cost_categories" as any).select("id, name, icon").eq("user_id", userId).eq("is_active", true).order("created_at");
      setCustomCategories((data as any[]) || []);
    };
    load();
  }, [open, userId]);

  // All categories = default + custom
  const allCategories = useMemo(() => {
    const customs = customCategories.map(c => ({ value: `custom_${c.id}`, label: c.name, icon: c.icon }));
    return [...COST_CATEGORIES, ...customs];
  }, [customCategories]);

  const isMaterial = MATERIAL_CATEGORIES.includes(category);
  const availableUnits = useMemo(() => UNITS_MAP[category] || UNITS_MAP.other, [category]);
  const showWaste = WASTE_CATEGORIES.includes(category);

  useEffect(() => {
    const units = UNITS_MAP[category] || UNITS_MAP.other;
    setUnit(units[0]?.value || "piece");
    if (!WASTE_CATEGORIES.includes(category)) setWasteEnabled(false);
    setUseFromInventory(false);
    setSelectedInventoryId("");
    setInventoryUseQty(0);
  }, [category]);

  const handleSaveCustomCategory = async () => {
    const trimmed = newCustomName.trim();
    if (!trimmed) return;
    setSavingCustom(true);
    const { data, error } = await supabase.from("custom_cost_categories" as any).insert({ user_id: userId, name: trimmed, icon: "📦" }).select("id, name, icon").single();
    setSavingCustom(false);
    if (error) { toast.error("فشل في الحفظ"); return; }
    const newCat = data as any;
    setCustomCategories(prev => [...prev, newCat]);
    setCategory(`custom_${newCat.id}`);
    setNewCustomName("");
    setShowAddCustom(false);
    toast.success("✅ تم إضافة نوع التكلفة بنجاح");
  };

  const handleDeleteCustomCategory = async (id: string) => {
    await supabase.from("custom_cost_categories" as any).delete().eq("id", id);
    setCustomCategories(prev => prev.filter(c => c.id !== id));
    if (category === `custom_${id}`) setCategory("other");
    setDeleteConfirmId(null);
    toast.success("تم حذف نوع التكلفة");
  };

  // Load available inventory for this category
  useEffect(() => {
    if (!open || !isMaterial) return;
    const loadInventory = async () => {
      const { data } = await supabase
        .from("workshop_material_inventory" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("status", "available")
        .eq("material_category", category);
      setInventoryItems((data as any[]) || []);
    };
    loadInventory();
  }, [open, category, userId, isMaterial]);

  // For materials: use purchasedQty/usedQty; for non-materials: single quantity
  const quantity = isMaterial ? usedQty : purchasedQty;
  const surplusQty = isMaterial ? Math.max(0, purchasedQty - usedQty) : 0;
  const hasSurplus = isMaterial && purchasedQty > 0 && usedQty > 0 && surplusQty > 0;

  const effectiveQty = useMemo(() => {
    const baseQty = isMaterial ? usedQty : purchasedQty;
    return wasteEnabled && wastePct > 0 ? baseQty * (1 + wastePct / 100) : baseQty;
  }, [usedQty, purchasedQty, wasteEnabled, wastePct, isMaterial]);

  const usedCost = useMemo(() => Math.round(effectiveQty * unitPrice * 100) / 100, [effectiveQty, unitPrice]);
  const totalPurchaseCost = useMemo(() => Math.round(purchasedQty * unitPrice * 100) / 100, [purchasedQty, unitPrice]);
  const surplusCost = useMemo(() => Math.round(surplusQty * unitPrice * 100) / 100, [surplusQty, unitPrice]);
  const wasteAmount = useMemo(() => wasteEnabled ? Math.round((effectiveQty - (isMaterial ? usedQty : purchasedQty)) * unitPrice * 100) / 100 : 0, [effectiveQty, usedQty, purchasedQty, unitPrice, wasteEnabled, isMaterial]);

  // For inventory usage
  const selectedInvItem = inventoryItems.find(i => i.id === selectedInventoryId);
  const inventoryCost = selectedInvItem ? Math.round(inventoryUseQty * (selectedInvItem.unit_cost || 0) * 100) / 100 : 0;

  const totalAmount = useFromInventory ? inventoryCost : (isMaterial ? totalPurchaseCost : usedCost);

  const filteredSuppliers = useMemo(() =>
    contacts.filter(c => !supplierSearch || c.contact_name.toLowerCase().includes(supplierSearch.toLowerCase()))
  , [contacts, supplierSearch]);

  const activeWorkshops = useMemo(() => allWorkshops.filter(w => w.status === "active" && w.id !== workshopId), [allWorkshops, workshopId]);

  const glInfo = CATEGORY_GL_MAP[category] || CATEGORY_GL_MAP.other;
  const creditCode = PAYMENT_CREDIT_MAP[paymentMethod] || "1110";

  const canSave = useFromInventory
    ? (inventoryUseQty > 0 && selectedInventoryId)
    : (isMaterial ? (purchasedQty > 0 && usedQty > 0 && unitPrice > 0 && usedQty <= purchasedQty) : (purchasedQty > 0 && unitPrice > 0));

  const unitLabel = availableUnits.find(u => u.value === unit)?.label || unit;

  const resetForm = () => {
    setCategory("wood_natural"); setPurchasedQty(0); setUsedQty(0); setUnit("m2"); setUnitPrice(0);
    setWasteEnabled(false); setWastePct(10); setPhase("preparation");
    setDescription(""); setCostDate(format(new Date(), "yyyy-MM-dd"));
    setSupplierSearch(""); setSupplierContactId(null); setSupplierNameManual("");
    setInvoiceNumber(""); setPaymentMethod("آجل");
    setSurplusAction("inventory"); setTransferTargetId("");
    setUseFromInventory(false); setSelectedInventoryId(""); setInventoryUseQty(0);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const idempotencyKey = `WS-COST-${workshopId}-${Date.now()}`;
      const supplierName = supplierContactId ? contacts.find(c => c.id === supplierContactId)?.contact_name || supplierNameManual : supplierNameManual;
      const catLabel = COST_CATEGORIES.find(c => c.value === category)?.label || category;

      if (useFromInventory && selectedInvItem) {
        // ── Use from existing inventory ──
        const txDesc = `استخدام مخزون (${catLabel}) - ورشة ${workshopName}`;
        const { data: txData, error: txErr } = await supabase.from("transactions").insert({
          user_id: userId, transaction_date: costDate, description: txDesc,
          debit_account_code: glInfo.debit, credit_account_code: "1140",
          amount: inventoryCost, currency: "شيكل", transaction_type: "workshop_cost",
          reference: `WS-INV-${workshopName.substring(0, 15)}`,
          payment_method: "مخزون", idempotency_key: idempotencyKey,
        } as any).select("id").single();
        if (txErr) { toast.error("خطأ في القيد: " + txErr.message); return; }

        // Create cost record
        const costTypeMap: Record<string, string> = {
          wood_natural: "wood", mdf: "wood", glass: "glass", paint: "paint", varnish: "paint",
          marble: "marble", hardware: "hardware", labor: "labor", transport: "transport",
          countertop: "crystal", electricity: "other", adhesive: "paint",
          veneer: "paint", fittings: "hardware", other: "other",
        };
        await supabase.from("workshop_costs").insert({
          workshop_id: workshopId, user_id: userId,
          cost_type: costTypeMap[category] || "other",
          category, description: description || `من المخزون المتاح`,
          amount: inventoryCost, cost_date: costDate,
          quantity: inventoryUseQty, unit, unit_price: selectedInvItem.unit_cost,
          phase, payment_method: "مخزون", notes: `مصدر: مخزون مواد - ${selectedInvItem.material_type}`,
          linked_transaction_id: txData?.id || null,
        } as any);

        // Update inventory
        const remainingQty = (selectedInvItem.quantity || 0) - inventoryUseQty;
        if (remainingQty <= 0) {
          await supabase.from("workshop_material_inventory" as any).update({ status: "used", quantity: 0, total_value: 0 }).eq("id", selectedInventoryId);
        } else {
          await supabase.from("workshop_material_inventory" as any).update({
            quantity: remainingQty,
            total_value: Math.round(remainingQty * selectedInvItem.unit_cost * 100) / 100,
          }).eq("id", selectedInventoryId);
        }

        toast.success(`✅ تم استخدام ${inventoryUseQty} ${unitLabel} من المخزون`);
      } else {
        // ── Normal purchase flow ──
        const txDesc = `${glInfo.label} - ورشة ${workshopName}${supplierName ? ` (${supplierName})` : ""}`;

        if (hasSurplus && surplusAction === "transfer" && transferTargetId) {
          // Scenario B: Split between current workshop + target workshop
          // Balance check: usedCost + surplusCost === totalPurchaseCost
          if (Math.abs((usedCost + surplusCost) - totalPurchaseCost) > 0.01) {
            toast.error("خطأ: القيد غير متوازن — راجع الأرقام"); return;
          }
          const targetWs = allWorkshops.find(w => w.id === transferTargetId);
          const compoundRef = `WS-COMPOUND-${workshopId}-${Date.now()}`;
          const compoundDesc = `شراء ${catLabel} — ورشة ${workshopName}${supplierName ? ` من ${supplierName}` : ""}`;

          // Line 1: Debit expense (current workshop used) 
          const { data: txData, error: txErr } = await supabase.from("transactions").insert({
            user_id: userId, transaction_date: costDate,
            description: `${compoundDesc} — مستخدم (${usedQty} ${unitLabel})`,
            debit_account_code: glInfo.debit, credit_account_code: creditCode,
            amount: usedCost, currency: "شيكل", transaction_type: "workshop_cost",
            contact_id: supplierContactId || null,
            reference: compoundRef,
            payment_method: paymentMethod, idempotency_key: idempotencyKey,
            notes: `قيد مركّب: سطر 1/2 — مدين مصروف ورشة ${workshopName}`,
          } as any).select("id").single();
          if (txErr) { toast.error("خطأ في القيد: " + txErr.message); return; }

          // Line 2: Debit expense (target workshop surplus)
          await supabase.from("transactions").insert({
            user_id: userId, transaction_date: costDate,
            description: `${compoundDesc} — نقل فائض لورشة ${targetWs?.name || "أخرى"} (${surplusQty} ${unitLabel})`,
            debit_account_code: glInfo.debit, credit_account_code: creditCode,
            amount: surplusCost, currency: "شيكل", transaction_type: "workshop_cost",
            contact_id: supplierContactId || null,
            reference: compoundRef,
            payment_method: paymentMethod, idempotency_key: idempotencyKey + "-L2",
            notes: `قيد مركّب: سطر 2/2 — مدين مصروف ورشة ${targetWs?.name || "أخرى"}`,
          } as any);

          // Cost records
          await insertCostRecord(workshopId, usedCost, usedQty, txData?.id);
          await insertCostRecord(transferTargetId, surplusCost, surplusQty, null);

        } else if (hasSurplus && (surplusAction === "inventory" || surplusAction === "pending")) {
          // Scenario A/C: Cost for used + surplus to inventory (available or pending)
          // Balance check: usedCost + surplusCost === totalPurchaseCost
          if (Math.abs((usedCost + surplusCost) - totalPurchaseCost) > 0.01) {
            toast.error("خطأ: القيد غير متوازن — راجع الأرقام"); return;
          }
          const compoundRef = `WS-COMPOUND-${workshopId}-${Date.now()}`;
          const compoundDesc = `شراء ${catLabel} — ورشة ${workshopName}${supplierName ? ` من ${supplierName}` : ""}`;

          // Line 1: Debit expense account (used in workshop) / Credit supplier
          const { data: txData, error: txErr } = await supabase.from("transactions").insert({
            user_id: userId, transaction_date: costDate,
            description: `${compoundDesc} — مستخدم في الورشة (${usedQty} ${unitLabel})`,
            debit_account_code: glInfo.debit, credit_account_code: creditCode,
            amount: usedCost, currency: "شيكل", transaction_type: "workshop_cost",
            contact_id: supplierContactId || null,
            reference: compoundRef,
            payment_method: paymentMethod, idempotency_key: idempotencyKey,
            notes: `قيد مركّب: سطر 1/2 — مدين ${glInfo.label}`,
          } as any).select("id").single();
          if (txErr) { toast.error("خطأ في القيد: " + txErr.message); return; }

          // Line 2: Debit raw materials inventory (1140) / Credit supplier
          await supabase.from("transactions").insert({
            user_id: userId, transaction_date: costDate,
            description: `${compoundDesc} — فائض للمخزون (${surplusQty} ${unitLabel})`,
            debit_account_code: "1140", credit_account_code: creditCode,
            amount: surplusCost, currency: "شيكل", transaction_type: "workshop_inventory",
            contact_id: supplierContactId || null,
            reference: compoundRef,
            payment_method: paymentMethod, idempotency_key: idempotencyKey + "-L2",
            notes: `قيد مركّب: سطر 2/2 — مدين مخزون مواد خام`,
          } as any);

          // Cost record for workshop (used amount only)
          await insertCostRecord(workshopId, usedCost, usedQty, txData?.id);

          // Inventory record
          await supabase.from("workshop_material_inventory" as any).insert({
            user_id: userId, material_type: catLabel, material_category: category,
            quantity: surplusQty, unit, unit_cost: unitPrice,
            total_value: surplusCost, source_workshop_id: workshopId,
            supplier_contact_id: supplierContactId || null,
            supplier_name: supplierName || null, status: "available",
            notes: surplusAction === "pending" ? `فائض معلق - ورشة ${workshopName}` : `فائض من ورشة ${workshopName}`,
          });

        } else {
          // No surplus scenario — single entry
          const { data: txData, error: txErr } = await supabase.from("transactions").insert({
            user_id: userId, transaction_date: costDate, description: txDesc,
            debit_account_code: glInfo.debit, credit_account_code: creditCode,
            amount: isMaterial ? totalPurchaseCost : usedCost, currency: "شيكل", transaction_type: "workshop_cost",
            contact_id: supplierContactId || null,
            reference: `WS-${workshopName.substring(0, 15)}`,
            payment_method: paymentMethod, idempotency_key: idempotencyKey,
          } as any).select("id").single();
          if (txErr) { toast.error("خطأ في القيد: " + txErr.message); return; }

          await insertCostRecord(workshopId, isMaterial ? totalPurchaseCost : usedCost, isMaterial ? purchasedQty : purchasedQty, txData?.id);
        }

        // ── Create purchase invoice for supplier ──
        if (supplierContactId || supplierNameManual) {
          const invAmount = isMaterial ? totalPurchaseCost : usedCost;
          const isPaid = paymentMethod !== "آجل";
          await supabase.from("invoices").insert({
            user_id: userId,
            invoice_type: "purchase",
            contact_id: supplierContactId || null,
            contact_name: supplierName || supplierNameManual || "مورد",
            invoice_date: costDate,
            subtotal: invAmount,
            total_amount: invAmount,
            paid_amount: isPaid ? invAmount : 0,
            remaining_amount: isPaid ? 0 : invAmount,
            payment_status: isPaid ? "paid" : "unpaid",
            payment_method: paymentMethod === "آجل" ? "آجل" : paymentMethod === "نقدي" ? "نقدي" : "بنك",
            currency: "شيكل",
            status: isPaid ? "sent" : "draft",
            notes: `تكلفة ورشة: ${workshopName} - ${catLabel}`,
            source: "workshop",
          } as any);
        }

        // Supplier balance update for credit
        if (paymentMethod === "آجل" && supplierContactId) {
          const bal = contacts.find(c => c.id === supplierContactId)?.current_balance || 0;
          await supabase.from("contacts").update({ current_balance: bal + totalPurchaseCost } as any).eq("id", supplierContactId);
        }

        toast.success(`✅ تم تسجيل التكلفة وإنشاء القيد وفاتورة المشتريات`);
      }

      resetForm();
      onOpenChange(false);
      onSaved();
      onContactsReload();
    } finally {
      setSaving(false);
    }
  };

  const insertCostRecord = async (wsId: string, amount: number, qty: number, txId: string | null) => {
    const costTypeMap: Record<string, string> = {
      wood_natural: "wood", mdf: "wood", glass: "glass", paint: "paint", varnish: "paint",
      marble: "marble", hardware: "hardware", labor: "labor", transport: "transport",
      countertop: "crystal", electricity: "other", adhesive: "paint",
      veneer: "paint", fittings: "hardware", other: "other",
    };
    const supplierName = supplierContactId ? contacts.find(c => c.id === supplierContactId)?.contact_name || supplierNameManual : supplierNameManual;
    await supabase.from("workshop_costs").insert({
      workshop_id: wsId, user_id: userId,
      cost_type: costTypeMap[category] || "other",
      category, description: description || null,
      amount, cost_date: costDate,
      quantity: qty, unit, unit_price: unitPrice,
      waste_percentage: wasteEnabled ? wastePct : 0,
      waste_amount: wasteAmount, phase,
      supplier_name: supplierName || null,
      supplier_contact_id: supplierContactId || null,
      invoice_number: invoiceNumber || null,
      payment_method: paymentMethod, notes: null,
      linked_transaction_id: txId,
    } as any);
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
              {allCategories.map(ct => {
                const isCustom = ct.value.startsWith("custom_");
                const customId = isCustom ? ct.value.replace("custom_", "") : null;
                return (
                  <button key={ct.value} onClick={() => setCategory(ct.value)}
                    className={`relative p-2.5 rounded-xl border-2 text-center transition-all group ${
                      category === ct.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/30 hover:bg-accent/5"
                    }`}>
                    {category === ct.value && (
                      <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </span>
                    )}
                    {isCustom && customId && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(customId); }}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <span className="text-xl block">{ct.icon}</span>
                    <span className="text-[10px] font-medium text-foreground block mt-0.5">{ct.label}</span>
                  </button>
                );
              })}

              {/* Add custom type card */}
              {!showAddCustom ? (
                <button
                  onClick={() => setShowAddCustom(true)}
                  className="p-2.5 rounded-xl border-2 border-dashed border-muted-foreground/30 text-center transition-all hover:border-primary hover:bg-primary/5 bg-muted/30"
                >
                  <span className="text-xl block">➕</span>
                  <span className="text-[10px] font-medium text-muted-foreground block mt-0.5">إضافة نوع</span>
                  <span className="text-[9px] text-muted-foreground block">تكلفة جديد</span>
                </button>
              ) : (
                <div className="col-span-2 sm:col-span-2 flex items-center gap-2 p-2 rounded-xl border-2 border-primary/40 bg-primary/5">
                  <Input
                    value={newCustomName}
                    onChange={e => setNewCustomName(e.target.value.slice(0, 30))}
                    placeholder="اسم نوع التكلفة..."
                    className="h-8 text-xs flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") handleSaveCustomCategory();
                      if (e.key === "Escape") { setShowAddCustom(false); setNewCustomName(""); }
                    }}
                  />
                  <Button size="sm" className="h-8 text-xs px-3" disabled={!newCustomName.trim() || savingCustom} onClick={handleSaveCustomCategory}>
                    حفظ
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              القيد: مدين {glInfo.debit} ({glInfo.label}) ← دائن {creditCode}
            </p>
          </div>

          {/* Delete custom category confirm */}
          <AlertDialog open={!!deleteConfirmId} onOpenChange={v => { if (!v) setDeleteConfirmId(null); }}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>هل تريد حذف هذا النوع؟</AlertDialogTitle>
                <AlertDialogDescription>سيتم حذف نوع التكلفة المخصص. هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteConfirmId && handleDeleteCustomCategory(deleteConfirmId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Use from inventory toggle ── */}
          {isMaterial && inventoryItems.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> من المخزون المتاح
                </Label>
                <Switch checked={useFromInventory} onCheckedChange={v => { setUseFromInventory(v); if (!v) { setSelectedInventoryId(""); setInventoryUseQty(0); } }} />
              </div>
              {useFromInventory && (
                <div className="space-y-2">
                  {inventoryItems.map(item => (
                    <button key={item.id} onClick={() => { setSelectedInventoryId(item.id); setUnit(item.unit); }}
                      className={`w-full text-right p-2 rounded-lg border text-xs transition-all ${
                        selectedInventoryId === item.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent/5"
                      }`}>
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="text-[9px]">{item.quantity} {item.unit}</Badge>
                        <span className="font-medium">{item.material_type} — {item.quantity} متاح ({item.unit_cost}₪/{item.unit})</span>
                      </div>
                      {item.supplier_name && <p className="text-[10px] text-muted-foreground mt-0.5">المورد: {item.supplier_name}</p>}
                    </button>
                  ))}
                  {selectedInventoryId && selectedInvItem && (
                    <div className="space-y-1">
                      <Label className="text-[11px]">الكمية المطلوبة (الحد الأقصى: {selectedInvItem.quantity})</Label>
                      <Input type="number" min={0} max={selectedInvItem.quantity} step="any"
                        value={inventoryUseQty || ""} onChange={e => setInventoryUseQty(Math.min(Number(e.target.value), selectedInvItem.quantity))} />
                      {inventoryUseQty > 0 && (
                        <p className="text-xs font-bold text-center">التكلفة: {inventoryCost.toLocaleString()} ₪</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!useFromInventory && (
            <>
              {/* ── 2. Total (auto) ── */}
              <div className="rounded-xl bg-accent/5 border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">المبلغ الإجمالي</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{totalPurchaseCost.toLocaleString()} ₪</p>
                {wasteEnabled && wasteAmount > 0 && (
                  <p className="text-[10px] text-amber-600">يشمل هدر {wasteAmount.toLocaleString()} ₪</p>
                )}
                {isMaterial && hasSurplus && (
                  <p className="text-[10px] text-primary">تكلفة الورشة: {usedCost.toLocaleString()} ₪ | فائض: {surplusCost.toLocaleString()} ₪</p>
                )}
              </div>

              {/* ── Qty fields ── */}
              {isMaterial ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">الكمية المشتراة</Label>
                      <Input type="number" min={0} step="any" value={purchasedQty || ""} onChange={e => { const val = Number(e.target.value); setPurchasedQty(val); if (usedQty > val) setUsedQty(val); }} />
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">الكمية المستخدمة في هذه الورشة</Label>
                      <Input type="number" min={0} max={purchasedQty} step="any" value={usedQty || ""} onChange={e => setUsedQty(Math.min(Number(e.target.value), purchasedQty))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">الفائض</Label>
                      <div className="flex items-center h-10 px-3 rounded-lg border border-border bg-muted/30 text-sm font-bold">
                        {surplusQty > 0 ? `${surplusQty} ${unitLabel}` : "—"}
                      </div>
                    </div>
                  </div>
                  {usedQty > purchasedQty && (
                    <p className="text-xs text-destructive">⚠️ الكمية المستخدمة لا يمكن أن تتجاوز المشتراة</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">الكمية</Label>
                    <Input type="number" min={0} step="any" value={purchasedQty || ""} onChange={e => setPurchasedQty(Number(e.target.value))} />
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
              )}

              {/* ── Surplus Action Panel ── */}
              {hasSurplus && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-bold text-amber-800 dark:text-amber-200">
                      يوجد فائض {surplusQty} {unitLabel} بقيمة {surplusCost.toLocaleString()} ₪
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">ماذا تريد أن تفعل بالفائض؟</p>
                  <RadioGroup value={surplusAction} onValueChange={v => setSurplusAction(v as any)} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="inventory" id="inv" />
                      <Label htmlFor="inv" className="text-xs cursor-pointer">أضفه للمخزون العام</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="transfer" id="trf" />
                      <Label htmlFor="trf" className="text-xs cursor-pointer">نقله لورشة أخرى</Label>
                    </div>
                    {surplusAction === "transfer" && (
                      <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                        <SelectTrigger className="h-9 text-xs mr-6"><SelectValue placeholder="اختر ورشة..." /></SelectTrigger>
                        <SelectContent>
                          {activeWorkshops.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="pending" id="pnd" />
                      <Label htmlFor="pnd" className="text-xs cursor-pointer">أتركه معلقاً (سأحدده لاحقاً)</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* ── Waste Toggle ── */}
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
                        الكمية الصافية: {isMaterial ? usedQty : purchasedQty} {unitLabel} | مع الهدر: {effectiveQty.toFixed(2)} {unitLabel}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── Date + Phase ── */}
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

              {/* ── Description ── */}
              <div className="space-y-1">
                <Label className="text-[11px]">وصف تفصيلي</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={PLACEHOLDERS[category] || "وصف البند..."} rows={2} />
              </div>

              {/* ── Supplier ── */}
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

              {/* ── Invoice number ── */}
              <div className="space-y-1">
                <Label className="text-[11px]">رقم الفاتورة (اختياري)</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="رقم فاتورة الشراء..." />
              </div>
            </>
          )}
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
