import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useQuery } from "@tanstack/react-query";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Package, ChevronLeft, ChevronRight, Upload, Plus, Trash2, Save, Check, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import AccountingShell from "@/components/layout/AccountingShell";

interface ShipmentItem {
  line_number: number;
  model_code: string;
  description_en: string;
  description_ar: string;
  color: string;
  size_mm: string;
  unit_price_foreign: number;
  quantity: number; // T/QTY = total pieces
  total_price_foreign: number; // AMT = T/QTY × U/PRICE
  cbm_per_unit: number; // CBM per carton (manual entry)
  total_cbm: number; // cbm_per_unit × ctns
  ctn_qty: number; // qty per carton (reference)
  ctns: number; // number of cartons (reference)
}

interface ImportCost {
  id: string;
  cost_type: string;
  cost_name_ar: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_local: number;
  distribution_method: string;
}

const costTypes = [
  { type: "shipping", label: "🚢 شحن بحري", defaultMethod: "cbm", accountCode: "5210", capitalize: true },
  { type: "air_shipping", label: "✈️ شحن جوي", defaultMethod: "cbm", accountCode: "5210", capitalize: true },
  { type: "customs_duties", label: "🏛️ جمارك", defaultMethod: "value", accountCode: "5220", capitalize: true },
  { type: "port_fees", label: "📋 رسوم مرفأ", defaultMethod: "value", accountCode: "5240", capitalize: true },
  { type: "foreign_office", label: "🏢 مكتب خارجي", defaultMethod: "equal", accountCode: "5250", capitalize: true },
  { type: "clearance_agent", label: "🔓 مخلص جمركي", defaultMethod: "equal", accountCode: "5230", capitalize: true },
  { type: "bank_fees", label: "🏦 عمولة بنك", defaultMethod: "value", accountCode: "6110", capitalize: false },
  { type: "interest", label: "💰 فوائد", defaultMethod: "value", accountCode: "6100", capitalize: false },
  { type: "inland_transport", label: "🚛 نقل داخلي", defaultMethod: "equal", accountCode: "5260", capitalize: true },
  { type: "storage", label: "📦 تخزين", defaultMethod: "equal", accountCode: "5270", capitalize: true },
  { type: "insurance", label: "🔧 تأمين", defaultMethod: "value", accountCode: "5280", capitalize: true },
  { type: "other", label: "➕ أخرى", defaultMethod: "value", accountCode: "5290", capitalize: true },
];

const distributionMethods = [
  { value: "cbm", label: "CBM (حجم)" },
  { value: "value", label: "قيمة" },
  { value: "quantity", label: "كمية" },
  { value: "equal", label: "متساوٍ" },
];

// ═══════ FLEXIBLE COLUMN DETECTION ═══════

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map(h => h ? normalizeColumnName(String(h)) : "");
  const normalizedNames = possibleNames.map(normalizeColumnName);

  // Priority 1: Exact match
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.indexOf(name);
    if (idx !== -1) return idx;
  }
  // Priority 2: Starts with
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex(h => h.startsWith(name));
    if (idx !== -1) return idx;
  }
  // Priority 3: Contains
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex(h => h.includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let cleaned = value.toString().replace(/\s/g, "").replace(/[R$€¥£]/g, "");

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot === -1 && lastComma === -1) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const ImportWizardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [shipmentName, setShipmentName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currencyId, setCurrencyId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierInvoiceTotal, setSupplierInvoiceTotal] = useState<number>(0);

  // Step 2 state
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [autoCalcWarning, setAutoCalcWarning] = useState("");

  // Step 3 state
  const [costs, setCosts] = useState<ImportCost[]>([]);

  // Tenant-safe: filter by effective owner, never rely on RLS alone (P0-2026-06).
  const { data: contacts = [], refetch: refetchContacts } = useQuery({
    queryKey: ["suppliers-for-import", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, contact_name")
        .eq("user_id", dataOwnerId!)
        .eq("contact_type", "مورد")
        .neq("is_archived", true);
      return data || [];
    },
  });

  const handleAddSupplier = async () => {
    if (!user || !newSupplierName.trim()) return;
    setAddingSupplier(true);
    try {
      const { data, error } = await supabase.from("contacts").insert({
        user_id: user.id,
        contact_name: newSupplierName.trim(),
        contact_type: "مورد",
      }).select("id").single();
      if (error) throw error;
      await refetchContacts();
      setSupplierId(data.id);
      setNewSupplierName("");
      setShowNewSupplier(false);
      toast.success("تم إضافة المورد بنجاح");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingSupplier(false);
    }
  };

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies-for-import"],
    queryFn: async () => {
      const { data } = await supabase.from("currencies").select("id, code, name_ar, symbol");
      return data || [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-import", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("user_id", dataOwnerId!)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const selectedCurrency = currencies.find((c: any) => c.id === currencyId);

  // Items calculations
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalForeign = items.reduce((s, i) => s + (i.total_price_foreign || 0), 0);
  const totalCBM = items.reduce((s, i) => s + (i.total_cbm || 0), 0);
  const totalLocal = totalForeign * exchangeRate;
  const totalCtnQty = items.reduce((s, i) => s + (i.ctn_qty || 0), 0);
  const totalCtns = items.reduce((s, i) => s + (i.ctns || 0), 0);

  // Validation: compare calculated total with supplier invoice total
  const invoiceTotalMismatch = supplierInvoiceTotal > 0 && Math.abs(totalForeign - supplierInvoiceTotal) > 0.01;

  // Costs calculations
  const totalCosts = costs.reduce((s, c) => s + (c.amount_local || 0), 0);
  const totalLanded = totalLocal + totalCosts;
  const costRatio = totalLocal > 0 ? (totalCosts / totalLocal) * 100 : 0;

  // ═══════ EXCEL UPLOAD WITH CORRECT COLUMN MAPPING ═══════
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "" });

        if (!rows.length) {
          toast.error("الملف فارغ");
          return;
        }

        // Score rows to find header
        const headerKeywords = [
          "qty", "quantity", "price", "amount", "description", "desc", "product", "item",
          "model", "code", "ctn", "ctns", "carton", "cbm", "color", "size", "total",
          "الكمية", "الوصف", "السعر", "كود"
        ];

        const scoreRow = (row: (string | number)[]) => {
          const cells = row.map(c => normalizeColumnName(String(c ?? "")));
          return headerKeywords.reduce(
            (score, k) => score + (cells.some(cell => cell.includes(k)) ? 1 : 0), 0
          );
        };

        const headerIndex = rows
          .slice(0, Math.min(rows.length, 15))
          .map((row, idx) => ({ idx, score: scoreRow(row) }))
          .sort((a, b) => b.score - a.score)[0]?.idx ?? 0;

        const rawHeaders = (rows[headerIndex] || []).map(h => String(h ?? ""));

        // ═══════ FLEXIBLE COLUMN DETECTION ═══════
        const colModel = findColumnIndex(rawHeaders, ["model", "code", "item no", "item#", "ctn no", "ref", "sku", "كود"]);
        const colDesc = findColumnIndex(rawHeaders, ["description", "desc", "item", "product", "name", "الوصف"]);
        const colCtnQty = findColumnIndex(rawHeaders, ["ctn/qty", "qty/ctn", "pcs/ctn", "qty per ctn", "pcs per carton"]);
        const colCtns = findColumnIndex(rawHeaders, ["ctns", "cartons", "boxes", "cases", "عدد الكرتونات"]);
        const colTotalQty = findColumnIndex(rawHeaders, ["t/qty", "total qty", "total quantity", "الكمية الإجمالية"]);
        const colUnitPrice = findColumnIndex(rawHeaders, ["u/price", "unit price", "price", "ex-works", "cost", "سعر"]);
        const colAmt = findColumnIndex(rawHeaders, ["amt", "amount", "total", "value", "المبلغ", "الإجمالي"]);
        const colColor = findColumnIndex(rawHeaders, ["color", "colour", "اللون"]);
        const colSize = findColumnIndex(rawHeaders, ["size", "dimension", "mm", "cm", "الأبعاد"]);
        const colCbm = findColumnIndex(rawHeaders, ["cbm", "volume", "m3", "الحجم"]);

        // Fallback: if no T/QTY column but we have CTN/QTY and CTNS, we'll compute
        const hasTotalQtyCol = colTotalQty >= 0;
        const hasCtnSystem = colCtnQty >= 0 && colCtns >= 0;

        // Also try to detect qty column as fallback (generic "qty" without ctn prefix)
        let colGenericQty = -1;
        if (!hasTotalQtyCol && !hasCtnSystem) {
          colGenericQty = findColumnIndex(rawHeaders, ["qty", "quantity", "pcs", "الكمية", "عدد"]);
        }

        if (!hasTotalQtyCol && hasCtnSystem) {
          setAutoCalcWarning("سيتم حساب الكمية الإجمالية تلقائياً: CTN/QTY × CTNS");
        } else {
          setAutoCalcWarning("");
        }

        const dataRows = rows.slice(headerIndex + 1);
        const mapped: ShipmentItem[] = dataRows
          .map((row, idx) => {
            const getVal = (colIdx: number) => colIdx >= 0 ? row[colIdx] : null;
            const getNum = (colIdx: number) => colIdx >= 0 ? (parseNumericValue(row[colIdx]) ?? 0) : 0;
            const getStr = (colIdx: number) => colIdx >= 0 ? String(row[colIdx] ?? "").trim() : "";

            const ctnQty = getNum(colCtnQty);
            const ctns = getNum(colCtns);
            const unitPrice = getNum(colUnitPrice);

            // ═══ QUANTITY: Priority T/QTY > CTN/QTY×CTNS > generic qty ═══
            let totalQtyVal: number;
            const rawTQty = getVal(colTotalQty);
            const parsedTQty = parseNumericValue(rawTQty);
            if (hasTotalQtyCol && parsedTQty !== null && parsedTQty > 0) {
              totalQtyVal = parsedTQty;
            } else if (hasCtnSystem && ctnQty > 0 && ctns > 0) {
              totalQtyVal = ctnQty * ctns;
            } else if (colGenericQty >= 0) {
              totalQtyVal = getNum(colGenericQty);
            } else {
              totalQtyVal = ctnQty > 0 ? ctnQty : 1;
            }
            totalQtyVal = Math.max(0, Math.round(totalQtyVal));

            // ═══ AMOUNT: Priority AMT column > T/QTY × U/PRICE ═══
            let amtVal: number;
            const rawAmt = getVal(colAmt);
            const parsedAmt = parseNumericValue(rawAmt);
            if (colAmt >= 0 && parsedAmt !== null && parsedAmt > 0) {
              amtVal = parsedAmt;
            } else {
              amtVal = totalQtyVal * unitPrice;
            }

            // CBM: only from explicit CBM column, default 0
            const cbmPerUnit = getNum(colCbm);
            // CBM total = cbm_per_unit × ctns (carton volume, not piece volume)
            const totalCbmVal = cbmPerUnit * (ctns > 0 ? ctns : 1);

            return {
              line_number: idx + 1,
              model_code: getStr(colModel),
              description_en: getStr(colDesc),
              description_ar: "",
              color: getStr(colColor),
              size_mm: getStr(colSize),
              unit_price_foreign: unitPrice,
              quantity: totalQtyVal,
              total_price_foreign: amtVal,
              cbm_per_unit: cbmPerUnit,
              total_cbm: totalCbmVal,
              ctn_qty: Math.round(ctnQty),
              ctns: Math.round(ctns),
            };
          })
          .filter(i => i.description_en || i.model_code || i.total_price_foreign > 0 || i.quantity > 0);

        if (!mapped.length) {
          toast.error("لم يتم التعرف على أعمدة الملف. جرّب قالب الاستيراد أو راجع أسماء الأعمدة.");
          return;
        }

        setItems(mapped);
        toast.success(`تم استخراج ${mapped.length} بند من الملف`);
      } catch {
        toast.error("فشل قراءة الملف. تأكد من صيغة Excel/CSV صحيحة.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }, []);

  // Add empty item row
  const addItem = () => {
    setItems(prev => [...prev, {
      line_number: prev.length + 1,
      model_code: "", description_en: "", description_ar: "", color: "", size_mm: "",
      unit_price_foreign: 0, quantity: 1, total_price_foreign: 0, cbm_per_unit: 0, total_cbm: 0,
      ctn_qty: 0, ctns: 1,
    }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };

      // Recalculate quantity when ctn_qty or ctns change
      if (field === "ctn_qty" || field === "ctns") {
        updated.quantity = (updated.ctn_qty || 0) * (updated.ctns || 1);
        updated.total_price_foreign = updated.quantity * (updated.unit_price_foreign || 0);
      }

      // Recalculate total when price or quantity change
      if (field === "unit_price_foreign" || field === "quantity") {
        updated.total_price_foreign = (updated.unit_price_foreign || 0) * (updated.quantity || 0);
      }

      // CBM total = cbm_per_unit × ctns (carton-based, NOT piece-based)
      if (field === "cbm_per_unit" || field === "ctns") {
        updated.total_cbm = (updated.cbm_per_unit || 0) * (updated.ctns || 1);
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, line_number: i + 1 })));
  };

  // Add cost row
  const addCost = (costType?: string) => {
    const ct = costTypes.find(c => c.type === costType) || costTypes[costTypes.length - 1];
    setCosts(prev => [...prev, {
      id: crypto.randomUUID(),
      cost_type: ct.type,
      cost_name_ar: ct.label.replace(/^[^\s]+\s/, ""),
      amount: 0,
      currency: "ILS",
      exchange_rate: 1,
      amount_local: 0,
      distribution_method: ct.defaultMethod,
    }]);
  };

  const updateCost = (id: string, field: string, value: any) => {
    setCosts(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === "amount" || field === "exchange_rate") {
        updated.amount_local = (updated.amount || 0) * (updated.exchange_rate || 1);
      }
      return updated;
    }));
  };

  const removeCost = (id: string) => setCosts(prev => prev.filter(c => c.id !== id));

  // Calculate cost distribution for review
  const getDistributedItems = () => {
    return items.map(item => {
      let allocatedShipping = 0, allocatedCustoms = 0, allocatedOther = 0;
      costs.forEach(cost => {
        let weight = 0;
        switch (cost.distribution_method) {
          case "cbm": weight = totalCBM > 0 ? (item.total_cbm / totalCBM) : 0; break;
          case "value": weight = totalForeign > 0 ? (item.total_price_foreign / totalForeign) : 0; break;
          case "quantity": weight = totalQty > 0 ? (item.quantity / totalQty) : 0; break;
          case "equal": weight = items.length > 0 ? (1 / items.length) : 0; break;
        }
        const allocated = cost.amount_local * weight;
        if (cost.cost_type === "shipping" || cost.cost_type === "air_shipping") allocatedShipping += allocated;
        else if (cost.cost_type === "customs_duties" || cost.cost_type === "port_fees") allocatedCustoms += allocated;
        else allocatedOther += allocated;
      });
      const totalAllocated = allocatedShipping + allocatedCustoms + allocatedOther;
      const itemLocal = item.total_price_foreign * exchangeRate;
      const landedTotal = itemLocal + totalAllocated;
      return {
        ...item,
        total_price_local: itemLocal,
        allocated_shipping: allocatedShipping,
        allocated_customs: allocatedCustoms,
        allocated_other_costs: allocatedOther,
        total_allocated_costs: totalAllocated,
        landed_cost_total: landedTotal,
        landed_cost_per_unit: item.quantity > 0 ? landedTotal / item.quantity : 0,
      };
    });
  };

  // Save
  const handleSave = async (post = false) => {
    if (!user) return;

    // Pre-flight validation for posting
    if (post) {
      if (!warehouseId) { toast.error("⚠️ يجب تحديد المستودع قبل الترحيل"); return; }
      if (!currencyId) { toast.error("⚠️ يجب تحديد العملة قبل الترحيل"); return; }
      if (items.length === 0 || items.every(i => !i.quantity || i.quantity <= 0)) {
        toast.error("⚠️ لا يوجد بنود صالحة بكميات للترحيل"); return;
      }
    }

    setSaving(true);
    try {
      const status = post ? "posted" : items.length > 0 ? (costs.length > 0 ? "distributed" : "items_entered") : "draft";
      
      const { data: shipment, error: shipErr } = await supabase.from("import_shipments").insert({
        user_id: user.id,
        shipment_number: "",
        shipment_name: shipmentName,
        supplier_id: supplierId || null,
        supplier_invoice_number: supplierInvoice,
        invoice_date: invoiceDate || null,
        currency_id: currencyId || null,
        warehouse_id: warehouseId || null,
        exchange_rate: exchangeRate,
        status: post ? 'draft' : status,  // RPC will mark as 'posted'
        total_items_cost_foreign: totalForeign,
        total_items_cost_local: totalLocal,
        total_import_costs: totalCosts,
        total_landed_cost: totalLanded,
        created_by: user.id,
        posted_at: null,  // RPC sets this
        notes,
      }).select("id").single();
      
      if (shipErr) throw shipErr;

      const distributed = getDistributedItems();
      if (distributed.length > 0) {
        const { error: itemsErr } = await supabase.from("import_shipment_items").insert(
          distributed.map(item => ({
            shipment_id: shipment.id,
            line_number: item.line_number,
            model_code: item.model_code,
            description_en: item.description_en,
            description_ar: item.description_ar,
            color: item.color,
            size_mm: item.size_mm,
            unit_price_foreign: item.unit_price_foreign,
            quantity: item.quantity,
            cbm_per_unit: item.cbm_per_unit,
            total_cbm: item.total_cbm,
            total_price_foreign: item.total_price_foreign,
            total_price_local: item.total_price_local,
            allocated_shipping: item.allocated_shipping,
            allocated_customs: item.allocated_customs,
            allocated_other_costs: item.allocated_other_costs,
            total_allocated_costs: item.total_allocated_costs,
            landed_cost_total: item.landed_cost_total,
            landed_cost_per_unit: item.landed_cost_per_unit,
            ctn_qty: item.ctn_qty,
            ctns: item.ctns,
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      if (costs.length > 0) {
        const { error: costsErr } = await supabase.from("import_costs").insert(
          costs.map(c => ({
            shipment_id: shipment.id,
            cost_type: c.cost_type,
            cost_name_ar: c.cost_name_ar,
            amount: c.amount,
            exchange_rate: c.exchange_rate,
            amount_local: c.amount_local,
            distribution_method: c.distribution_method,
          }))
        );
        if (costsErr) throw costsErr;
      }

      // === ATOMIC POSTING: products + stock + capitalized journal ===
      if (post) {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          'post_import_shipment_atomic' as any,
          { p_shipment_id: shipment.id, p_user_id: user.id }
        );
        if (rpcErr) throw rpcErr;
        const result = rpcRes as any;
        if (!result?.success) {
          throw new Error(result?.error || 'فشل ترحيل الشحنة');
        }
        toast.success(
          `✅ تم الترحيل: ${result.products_created} صنف جديد + ${result.products_linked} صنف مربوط + ${result.movements_created} حركة مخزون`
        );
      } else {
        toast.success("تم حفظ الشحنة كمسودة");
      }
      navigate("/purchases/import");
    } catch (err: any) {
      toast.error(err.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const steps = [
    { num: 1, label: "معلومات الشحنة" },
    { num: 2, label: "البنود" },
    { num: 3, label: "التكاليف" },
    { num: 4, label: "المراجعة" },
  ];

  // Check if any items have color or size data to show those columns
  const hasColorData = items.some(i => i.color);
  const hasSizeData = items.some(i => i.size_mm);
  const hasCtnData = items.some(i => i.ctn_qty > 0 || i.ctns > 0);

  return (
    <AccountingShell>
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <BackButton />
        <Package className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>استيراد جديد</h1>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 bg-card rounded-xl border p-4">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => s.num <= step && setStep(s.num)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                step === s.num ? "bg-primary text-primary-foreground" : step > s.num ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-background/20">
                {step > s.num ? <Check className="h-3 w-3" /> : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Info */}
      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">معلومات الشحنة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>اسم الشحنة *</Label>
              <Input placeholder="أثاث مكتبي - مارس 2026" value={shipmentName} onChange={e => setShipmentName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="اختر مورد" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}
                  <div className="border-t mt-1 pt-1 px-2 pb-1">
                    {!showNewSupplier ? (
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-primary" onClick={(e) => { e.preventDefault(); setShowNewSupplier(true); }}>
                        <Plus className="h-3.5 w-3.5" /> إضافة مورد جديد
                      </Button>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="اسم المورد الجديد"
                          value={newSupplierName}
                          onChange={e => setNewSupplierName(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleAddSupplier(); if (e.key === 'Escape') { setShowNewSupplier(false); setNewSupplierName(''); } }}
                        />
                        <Button size="sm" className="h-8 px-2" disabled={!newSupplierName.trim() || addingSupplier} onClick={handleAddSupplier}>
                          {addingSupplier ? "..." : <Check className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>رقم فاتورة المورد</Label>
              <Input placeholder="INV-2024-098" value={supplierInvoice} onChange={e => setSupplierInvoice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الفاتورة</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>العملة *</Label>
              <Select value={currencyId} onValueChange={setCurrencyId}>
                <SelectTrigger><SelectValue placeholder="اختر العملة" /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name_ar} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>سعر الصرف (₪ لكل {selectedCurrency?.code || "وحدة"})</Label>
              <Input type="number" step="0.0001" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>إجمالي فاتورة المورد ({selectedCurrency?.code || "—"})</Label>
              <Input type="number" step="0.01" placeholder="للتحقق من مطابقة البنود" value={supplierInvoiceTotal || ""} onChange={e => setSupplierInvoiceTotal(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>المستودع * <span className="text-xs text-muted-foreground">(إجباري للترحيل)</span></Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="اختر المستودع المستلم" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-start">
            <Button onClick={() => setStep(2)} disabled={!shipmentName}>
              التالي <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Items */}
      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">بنود الشحنة</h2>
          <Tabs defaultValue="upload">
            <TabsList>
              <TabsTrigger value="upload" className="gap-2"><Upload className="h-4 w-4" /> رفع ملف Excel</TabsTrigger>
              <TabsTrigger value="manual" className="gap-2"><Plus className="h-4 w-4" /> إدخال يدوي</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-4">
              <div className="border-2 border-dashed rounded-xl p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-primary/40 mb-3" />
                <h3 className="font-medium mb-1">ارفع فاتورة المورد</h3>
                <p className="text-xs text-muted-foreground mb-4">Excel أو CSV</p>
                <Button variant="outline" type="button" onClick={() => document.getElementById('import-file-input')?.click()}>اختر الملف</Button>
                <input id="import-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              </div>
            </TabsContent>
            <TabsContent value="manual" className="mt-4">
              <Button variant="outline" size="sm" onClick={addItem} className="mb-3">
                <Plus className="h-4 w-4 ml-1" /> إضافة بند
              </Button>
            </TabsContent>
          </Tabs>

          {/* Warnings */}
          {autoCalcWarning && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>⚠️ {autoCalcWarning}</span>
            </div>
          )}

          {invoiceTotalMismatch && items.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                🔴 الإجمالي المحسوب ({fmt(totalForeign)}) لا يتطابق مع إجمالي الفاتورة ({fmt(supplierInvoiceTotal)})
                — فرق = {fmt(Math.abs(totalForeign - supplierInvoiceTotal))} — تحقق من الكميات قبل المتابعة
              </span>
            </div>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>كود الموديل</TableHead>
                    <TableHead>الوصف</TableHead>
                    {hasColorData && <TableHead>اللون</TableHead>}
                    {hasSizeData && <TableHead>الأبعاد</TableHead>}
                    <TableHead>السعر ({selectedCurrency?.code || "—"})</TableHead>
                    {hasCtnData && <TableHead>كمية/كرتونة</TableHead>}
                    {hasCtnData && <TableHead>عدد الكرتونات</TableHead>}
                    <TableHead className="bg-blue-50 dark:bg-blue-950/30 font-bold">الكمية الإجمالية ★</TableHead>
                    <TableHead className="bg-blue-50 dark:bg-blue-950/30 font-bold">الإجمالي ★</TableHead>
                    <TableHead>CBM/وحدة</TableHead>
                    <TableHead>CBM إجمالي</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs text-muted-foreground">{item.line_number}</TableCell>
                      <TableCell><Input className="h-8 text-xs w-24" value={item.model_code} onChange={e => updateItem(idx, "model_code", e.target.value)} /></TableCell>
                      <TableCell><Input className="h-8 text-xs w-40" value={item.description_en} onChange={e => updateItem(idx, "description_en", e.target.value)} /></TableCell>
                      {hasColorData && <TableCell><Input className="h-8 text-xs w-20" value={item.color} onChange={e => updateItem(idx, "color", e.target.value)} /></TableCell>}
                      {hasSizeData && <TableCell><Input className="h-8 text-xs w-28" value={item.size_mm} onChange={e => updateItem(idx, "size_mm", e.target.value)} /></TableCell>}
                      <TableCell><Input className="h-8 text-xs w-20 font-mono" type="number" value={item.unit_price_foreign} onChange={e => updateItem(idx, "unit_price_foreign", parseFloat(e.target.value) || 0)} /></TableCell>
                      {hasCtnData && <TableCell><Input className="h-8 text-xs w-16 font-mono" type="number" value={item.ctn_qty} onChange={e => updateItem(idx, "ctn_qty", parseInt(e.target.value) || 0)} /></TableCell>}
                      {hasCtnData && <TableCell><Input className="h-8 text-xs w-16 font-mono" type="number" value={item.ctns} onChange={e => updateItem(idx, "ctns", parseInt(e.target.value) || 0)} /></TableCell>}
                      <TableCell className="bg-blue-50/50 dark:bg-blue-950/20">
                        <Input className="h-8 text-xs w-16 font-mono font-bold" type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} />
                      </TableCell>
                      <TableCell className="bg-blue-50/50 dark:bg-blue-950/20 font-mono text-xs font-bold">{fmt(item.total_price_foreign)}</TableCell>
                      <TableCell><Input className="h-8 text-xs w-16 font-mono" type="number" step="0.01" value={item.cbm_per_unit} onChange={e => updateItem(idx, "cbm_per_unit", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell className="font-mono text-xs">{item.total_cbm.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={hasColorData && hasSizeData ? 5 : hasColorData || hasSizeData ? 4 : 3} className="font-bold">الإجمالي</TableCell>
                    <TableCell></TableCell>
                    {hasCtnData && <TableCell className="font-mono font-bold">{totalCtnQty}</TableCell>}
                    {hasCtnData && <TableCell className="font-mono font-bold">{totalCtns}</TableCell>}
                    <TableCell className="font-mono font-bold bg-blue-50/50 dark:bg-blue-950/20">{totalQty}</TableCell>
                    <TableCell className="font-mono font-bold bg-blue-50/50 dark:bg-blue-950/20">{fmt(totalForeign)} {selectedCurrency?.code}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="font-mono font-bold">{totalCBM.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={hasCtnData ? (hasColorData && hasSizeData ? 10 : hasColorData || hasSizeData ? 9 : 8) : (hasColorData && hasSizeData ? 8 : hasColorData || hasSizeData ? 7 : 6)} className="font-bold">بالشيكل</TableCell>
                    <TableCell colSpan={4} className="font-mono font-bold text-primary">₪ {fmt(totalLocal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              <Button variant="outline" size="sm" onClick={addItem} className="mt-2"><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ChevronRight className="h-4 w-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(3)} disabled={items.length === 0}>التالي <ChevronLeft className="h-4 w-4 mr-1" /></Button>
          </div>
        </Card>
      )}

      {/* Step 3: Costs */}
      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">أعباء وتكاليف الاستيراد</h2>
              <p className="text-xs text-muted-foreground">ستُوزَّع هذه التكاليف على البنود لحساب التكلفة الحقيقية</p>
            </div>
            <Card className="p-4 min-w-[200px] bg-accent/30">
              <p className="text-xs text-muted-foreground">قيمة البضاعة</p>
              <p className="font-mono font-bold">₪ {fmt(totalLocal)}</p>
              <p className="text-xs text-muted-foreground mt-2">إجمالي التكاليف</p>
              <p className="font-mono font-bold text-primary">₪ {fmt(totalCosts)}</p>
              <div className="border-t mt-2 pt-2">
                <p className="text-xs text-muted-foreground">التكلفة الإجمالية</p>
                <p className="font-mono font-bold text-lg">₪ {fmt(totalLanded)}</p>
                <p className="text-xs text-muted-foreground">نسبة الأعباء: {costRatio.toFixed(1)}%</p>
              </div>
            </Card>
          </div>

          <div className="space-y-2">
            {costs.map(cost => (
              <div key={cost.id} className="flex items-center gap-2 flex-wrap bg-muted/30 rounded-lg p-3">
                <Select value={cost.cost_type} onValueChange={v => updateCost(cost.id, "cost_type", v)}>
                  <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{costTypes.map(ct => <SelectItem key={ct.type} value={ct.type}>{ct.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9 text-xs w-32" placeholder="الوصف" value={cost.cost_name_ar} onChange={e => updateCost(cost.id, "cost_name_ar", e.target.value)} />
                <Input className="h-9 text-xs w-24 font-mono" type="number" placeholder="المبلغ" value={cost.amount || ""} onChange={e => updateCost(cost.id, "amount", parseFloat(e.target.value) || 0)} />
                <Select value={cost.currency} onValueChange={v => updateCost(cost.id, "currency", v)}>
                  <SelectTrigger className="w-[90px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ ILS</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="CNY">¥ CNY</SelectItem>
                    <SelectItem value="EUR">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
                {cost.currency !== "ILS" && (
                  <Input className="h-9 text-xs w-20 font-mono" type="number" step="0.01" placeholder="الصرف" value={cost.exchange_rate} onChange={e => updateCost(cost.id, "exchange_rate", parseFloat(e.target.value) || 1)} />
                )}
                <span className="text-xs font-mono text-muted-foreground min-w-[80px]">₪ {fmt(cost.amount_local)}</span>
                <Select value={cost.distribution_method} onValueChange={v => updateCost(cost.id, "distribution_method", v)}>
                  <SelectTrigger className="w-[100px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{distributionMethods.map(dm => <SelectItem key={dm.value} value={dm.value}>{dm.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCost(cost.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {costTypes.slice(0, 6).map(ct => (
              <Button key={ct.type} variant="outline" size="sm" onClick={() => addCost(ct.type)} className="text-xs">
                {ct.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => addCost("other")} className="text-xs">➕ أخرى</Button>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}><ChevronRight className="h-4 w-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(4)}>التالي <ChevronLeft className="h-4 w-4 mr-1" /></Button>
          </div>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-6">
          {/* Summary Info */}
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4">معلومات الشحنة</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">اسم الشحنة:</span> <span className="font-medium">{shipmentName}</span></div>
              <div><span className="text-muted-foreground">تاريخ الفاتورة:</span> <span className="font-medium">{invoiceDate || "—"}</span></div>
              <div><span className="text-muted-foreground">العملة:</span> <span className="font-medium">{selectedCurrency?.name_ar || "—"}</span></div>
              <div><span className="text-muted-foreground">سعر الصرف:</span> <span className="font-mono font-medium">{exchangeRate}</span></div>
            </div>
          </Card>

          {/* Items with landed cost */}
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4">ملخص البنود مع التكلفة الحقيقية</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>سعر الوحدة</TableHead>
                  <TableHead>التكلفة المحلية</TableHead>
                  <TableHead>التكاليف الموزعة</TableHead>
                  <TableHead className="bg-accent/30">التكلفة الحقيقية/وحدة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getDistributedItems().map(item => (
                  <TableRow key={item.line_number}>
                    <TableCell className="text-xs">{item.line_number}</TableCell>
                    <TableCell className="text-sm">{item.description_en || item.model_code}</TableCell>
                    <TableCell className="font-mono">{item.quantity}</TableCell>
                    <TableCell className="font-mono">{fmt(item.unit_price_foreign)}</TableCell>
                    <TableCell className="font-mono">₪ {fmt(item.total_price_local)}</TableCell>
                    <TableCell className="font-mono text-primary">₪ {fmt(item.total_allocated_costs)}</TableCell>
                    <TableCell className="font-mono font-bold bg-accent/10">₪ {fmt(item.landed_cost_per_unit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-bold">الإجمالي</TableCell>
                  <TableCell className="font-mono font-bold">₪ {fmt(totalLocal)}</TableCell>
                  <TableCell className="font-mono font-bold text-primary">₪ {fmt(totalCosts)}</TableCell>
                  <TableCell className="font-mono font-bold bg-accent/10">₪ {fmt(totalLanded)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          {/* Cost breakdown */}
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4">توزيع التكاليف</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground">قيمة البضاعة</p>
                <p className="font-mono font-bold text-lg">₪ {fmt(totalLocal)}</p>
                <p className="text-xs text-muted-foreground">{totalLanded > 0 ? ((totalLocal / totalLanded) * 100).toFixed(1) : 0}%</p>
              </div>
              {costs.length > 0 && costs.slice(0, 3).map(c => (
                <div key={c.id} className="text-center p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground">{c.cost_name_ar}</p>
                  <p className="font-mono font-bold">₪ {fmt(c.amount_local)}</p>
                  <p className="text-xs text-muted-foreground">{totalLanded > 0 ? ((c.amount_local / totalLanded) * 100).toFixed(1) : 0}%</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(3)}><ChevronRight className="h-4 w-4 ml-1" /> السابق</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4 ml-1" /> حفظ كمسودة
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving}>
                <Check className="h-4 w-4 ml-1" /> ترحيل الشحنة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AccountingShell>
  );
};

export default ImportWizardPage;
