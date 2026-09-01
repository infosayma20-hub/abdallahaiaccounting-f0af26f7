import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Save, ArrowRight, Loader2, CheckCircle2, Trash2, Plus, Package, Barcode,
  DollarSign, Warehouse, Tags, ShoppingCart, Store, Factory, LifeBuoy,
  ShieldCheck, Ruler, FlaskConical, Shield, Calculator, Globe, Paperclip,
  Copy, Printer, Activity, Layers, AlertTriangle, Search, ChevronRight, ChevronLeft, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { FinanceShell } from "@/components/finance/shell/FinanceShell";
import type { ActionTab } from "@/components/finance/shell/types";
import ProductCategorySelect from "@/components/inventory/ProductCategorySelect";
import ProductUnitSelect from "@/components/inventory/ProductUnitSelect";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProductRow {
  [k: string]: any;
  id?: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_quantity: number;
}

interface UnitRow { id?: string; unit_name: string; conversion_factor: number; is_sale: boolean; is_purchase: boolean; is_default: boolean; is_active: boolean; barcode?: string; notes?: string; }
interface BarcodeRow { id?: string; barcode: string; unit_id?: string | null; description?: string; is_default: boolean; }
interface PriceTierRow { id?: string; tier_name: string; price: number; min_price?: number | null; max_price?: number | null; currency: string; min_qty: number; is_active: boolean; }
interface WarehouseSettingRow { id?: string; warehouse_id: string; opening_qty: number; min_qty: number; reorder_qty: number; max_qty?: number | null; is_default: boolean; }
interface WarehouseOpt { id: string; name: string; }
interface AccountOpt { id: string; account_code: string; account_name: string; }
interface FormulaOpt { id: string; name: string; code: string | null; status: string; version: number; }

const DEFAULT_CATEGORIES = ["بضاعة عامة", "مواد خام", "مواد تعبئة", "قطع غيار", "أخرى"];
const DEFAULT_UNITS = ["قطعة", "كيلو", "لتر", "متر", "علبة", "كرتونة", "طن"];

const emptyProduct = (userId: string): ProductRow => ({
  user_id: userId,
  name: "", sku: null, category: "بضاعة عامة", unit: "قطعة",
  buy_price: 0, sell_price: 0, quantity: 0, min_quantity: 0,
  barcode: null, tax_rate: 0, description: null,
  is_sold: true, is_purchased: true, is_pos_product: false,
  product_type: "finished", is_manufactured: false,
  lifecycle_status: "active", is_hazardous: false, is_serialized: false,
  requires_batch_tracking: false, has_expiry: false,
  valuation_method: "weighted_avg",
  sales_commission_pct: 0, sales_commission_fixed: 0,
  max_discount_pct: 0, min_order_qty: 0,
  production_yield_pct: 100, publish_to_ecommerce: false,
  is_tax_exempt: false, has_warranty: false, tags: [],
});

/* ------------------------------------------------------------------ */
/*  Small building blocks                                             */
/* ------------------------------------------------------------------ */

function FastTab({ id, icon: Icon, label, badge, children }: any) {
  return (
    <TabsContent value={id} className="mt-0 space-y-4">
      <Card className="border-t-2 border-t-primary/40 shadow-sm">
        <CardHeader className="py-3 border-b bg-muted/30 flex flex-row items-center gap-2 space-y-0">
          <Icon className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
          {badge != null && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
        </CardHeader>
        <CardContent className="pt-4">{children}</CardContent>
      </Card>
    </TabsContent>
  );
}

function Field({ label, children, hint, className = "" }: any) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id || "";
  const isNew = !id || id === "new";

  const [tab, setTab] = useState("general");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [product, setProduct] = useState<ProductRow>(() => emptyProduct(ownerId));
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>([]);
  const [tiers, setTiers] = useState<PriceTierRow[]>([]);
  const [whSettings, setWhSettings] = useState<WarehouseSettingRow[]>([]);
  /**
   * Quantity is a DERIVED field: `products.quantity` is maintained by the
   * `tg_sync_product_qty` trigger from `stock_movements`. Writing it directly
   * desyncs the per-warehouse view and gets overwritten by the next movement.
   * So we keep the original value and turn any manual change into a real
   * adjustment movement on a chosen warehouse.
   */
  const [origQty, setOrigQty] = useState<number>(0);
  const [adjWarehouseId, setAdjWarehouseId] = useState<string>("");
  /** Live per-warehouse on-hand quantities (authoritative ledger view). */
  const [whStock, setWhStock] = useState<{ warehouse_id: string; warehouse_name: string; qty: number; movements: number }[]>([]);
  /** Edited target quantity per warehouse (string while typing). */
  const [qtyTargets, setQtyTargets] = useState<Record<string, string>>({});
  const [stockLoading, setStockLoading] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; sku: string | null }[]>([]);
  const [formulas, setFormulas] = useState<FormulaOpt[]>([]);
  const [whereUsedCount, setWhereUsedCount] = useState<number>(0);
  const [lookupOpen, setLookupOpen] = useState(false);

  const patch = (u: Partial<ProductRow>) => { setProduct(p => ({ ...p, ...u })); setDirty(true); };

  /**
   * Reload the per-warehouse on-hand quantities for this product from the
   * `product_warehouse_stock` view — the exact same source the inventory list
   * and warehouse filter use, so the card can never drift from the grid.
   */
  const loadStock = async (pid?: string) => {
    const target = pid || product.id;
    if (!target || !ownerId) return;
    setStockLoading(true);
    const [{ data: rows }, { data: p }] = await Promise.all([
      supabase
        .from("product_warehouse_stock")
        .select("warehouse_id, warehouse_name, quantity_on_hand, movement_count")
        .eq("user_id", ownerId)
        .eq("product_id", target),
      supabase.from("products").select("quantity").eq("id", target).maybeSingle(),
    ]);
    const list = (rows ?? []).map((r: any) => ({
      warehouse_id: r.warehouse_id as string,
      warehouse_name: (r.warehouse_name as string) ?? "—",
      qty: Number(r.quantity_on_hand) || 0,
      movements: Number(r.movement_count) || 0,
    }))
      // Show active warehouses, plus any archived one that still holds stock or
      // history for this item (so nothing is hidden from the balance).
      .filter(r => activeWhIds.current.size === 0 || activeWhIds.current.has(r.warehouse_id) || r.qty !== 0 || r.movements > 0)
      .sort((a, b) => (b.movements - a.movements) || a.warehouse_name.localeCompare(b.warehouse_name, "ar"));
    setWhStock(list);
    setQtyTargets(Object.fromEntries(list.map(r => [r.warehouse_id, String(r.qty)])));
    if (p) {
      setProduct(prev => ({ ...prev, quantity: Number((p as any).quantity) || 0 }));
      setOrigQty(Number((p as any).quantity) || 0);
    }
    setStockLoading(false);
  };


  /* -------- keyboard shortcuts for navigation -------- */
  const currentIdx = product.id ? products.findIndex(p => p.id === product.id) : -1;
  const prevProduct = currentIdx > 0 ? products[currentIdx - 1] : null;
  const nextProduct = currentIdx >= 0 && currentIdx < products.length - 1 ? products[currentIdx + 1] : null;
  const goTo = (pid: string) => {
    if (dirty && !confirm("لديك تعديلات غير محفوظة. المتابعة؟")) return;
    nav(`/inventory/products/${pid}/edit`);
  };

  /* -------- initial load -------- */
  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const [{ data: whs }, { data: accs }, { data: sups }, { data: prods }] = await Promise.all([
        supabase.from("warehouses").select("id,name").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("accounts").select("id,account_code,account_name").eq("user_id", ownerId).eq("is_active", true).order("account_code"),
        supabase.from("suppliers").select("id,name").eq("user_id", ownerId).order("name"),
        supabase.from("products").select("id,name,sku").eq("user_id", ownerId).order("name").limit(1000),
      ]);
      setWarehouses((whs ?? []) as any);
      setAdjWarehouseId(prev => prev || (whs?.[0]?.id ?? ""));
      setAccounts((accs ?? []) as any);
      setSuppliers((sups ?? []) as any);
      setProducts((prods ?? []) as any);

      if (!isNew && id) {
        const [{ data: p }, { data: u }, { data: b }, { data: t }, { data: ws }] = await Promise.all([
          supabase.from("products").select("*").eq("id", id).maybeSingle(),
          supabase.from("product_units" as any).select("*").eq("product_id", id).order("is_default", { ascending: false }),
          supabase.from("product_barcodes" as any).select("*").eq("product_id", id).order("is_default", { ascending: false }),
          supabase.from("product_price_tiers" as any).select("*").eq("product_id", id).order("min_qty"),
          supabase.from("product_warehouse_settings" as any).select("*").eq("product_id", id),
        ]);
        if (p) { setProduct(p as any); setOrigQty(Number((p as any).quantity) || 0); }
        setUnits((u ?? []) as any);
        setBarcodes((b ?? []) as any);
        setTiers((t ?? []) as any);
        setWhSettings((ws ?? []) as any);
        loadStock(id);

        // fetch formulas for this product
        const { data: fs } = await supabase.from("production_formulas" as any)
          .select("id,name,code,status,version")
          .eq("output_product_id", id)
          .order("version", { ascending: false });
        setFormulas((fs ?? []) as any);

        // where-used count
        const { count } = await supabase.from("production_formula_items" as any)
          .select("id", { count: "exact", head: true })
          .eq("product_id", id);
        setWhereUsedCount(count ?? 0);

        setLoading(false);
      } else {
        // preset from query string (e.g. from formula "create for product")
        const preName = sp.get("name"); if (preName) patch({ name: preName });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ownerId]);

  /* -------- categories/units options -------- */
  const categoryOpts = useMemo(() =>
    Array.from(new Set([...DEFAULT_CATEGORIES, product.category].filter(Boolean))), [product.category]);
  const unitOpts = useMemo(() =>
    Array.from(new Set([...DEFAULT_UNITS, product.unit].filter(Boolean))), [product.unit]);

  /* -------- SKU auto-generate -------- */
  const genSKU = async () => {
    const prefix = ({ "بضاعة عامة": "عام", "مواد خام": "خام", "مواد تعبئة": "تعبئة", "قطع غيار": "قطع" }[product.category] ?? "صنف");
    const { data } = await supabase.from("products").select("sku").eq("user_id", ownerId).like("sku", `${prefix}-%`).limit(2000);
    const max = (data ?? []).reduce((m, r: any) => Math.max(m, parseInt((r.sku ?? "").split("-")[1] || "0")), 0);
    patch({ sku: `${prefix}-${String(max + 1).padStart(4, "0")}` });
  };

  /* -------- save -------- */
  const validate = () => {
    if (!product.name?.trim()) return "أدخل اسم المنتج";
    if (barcodes.filter(b => b.is_default).length > 1) return "يوجد أكثر من باركود افتراضي";
    if (units.filter(u => u.is_default).length > 1) return "يوجد أكثر من وحدة افتراضية";
    return null;
  };

  /** Total on-hand across warehouses (authoritative ledger sum). */
  const derivedTotal = useMemo(
    () => Math.round(whStock.reduce((s, r) => s + r.qty, 0) * 1000) / 1000,
    [whStock],
  );
  /** Target total after the pending per-warehouse edits. */
  const targetTotal = useMemo(
    () => Math.round(whStock.reduce((s, r) => {
      const t = qtyTargets[r.warehouse_id];
      return s + (t === "" || t === undefined ? r.qty : Number(t) || 0);
    }, 0) * 1000) / 1000,
    [whStock, qtyTargets],
  );
  /** Per-warehouse adjustments waiting to be posted. */
  const pendingAdjustments = useMemo(
    () => whStock
      .map(r => {
        const raw = qtyTargets[r.warehouse_id];
        const target = raw === "" || raw === undefined ? r.qty : Number(raw) || 0;
        return { ...r, target, delta: Math.round((target - r.qty) * 1000) / 1000 };
      })
      .filter(r => r.delta !== 0),
    [whStock, qtyTargets],
  );

  /** Opening quantity typed on a brand-new product (posted as a movement). */
  const qtyDelta = useMemo(
    () => (isNew ? Math.round(((Number(product.quantity) || 0) - (origQty || 0)) * 1000) / 1000 : 0),
    [isNew, product.quantity, origQty],
  );

  const save = async (closeAfter: boolean) => {
    if (!user) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    if (qtyDelta !== 0 && !adjWarehouseId) {
      toast.error("اختر المستودع الذي ستُسجَّل عليه الكمية الافتتاحية");
      return;
    }

    setSaving(true);
    try {
      const payload: any = { ...product, user_id: ownerId };
      // Keep POS visibility flags in sync so items appear/disappear in POS as expected
      payload.is_pos_available = !!product.is_pos_product;
      // ensure sku on new
      if (!payload.sku) {
        const prefix = "صنف";
        payload.sku = `${prefix}-${Date.now().toString().slice(-6)}`;
      }
      delete payload.created_at;
      delete payload.updated_at;
      // quantity is derived from stock_movements — never write it directly
      delete payload.quantity;

      let pid = product.id;
      if (pid) {
        const { error } = await supabase.from("products").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        delete payload.id;
        payload.quantity = 0; // opening qty is posted as a movement below
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        pid = (data as any).id;
      }

      // Quantity is never written directly: every change is posted as a real
      // stock movement through `adjust_product_stock`, which also re-syncs
      // `products.quantity` from the ledger so the card, the inventory grid and
      // the per-warehouse views always agree.
      if (qtyDelta !== 0) {
        const { error: mvErr } = await supabase.rpc("adjust_product_stock" as any, {
          _product_id: pid,
          _warehouse_id: adjWarehouseId,
          _delta: qtyDelta,
          _note: "كمية افتتاحية من بطاقة الصنف",
        });
        if (mvErr) throw mvErr;
      }
      for (const adj of pendingAdjustments) {
        const { error: adjErr } = await supabase.rpc("adjust_product_stock" as any, {
          _product_id: pid,
          _warehouse_id: adj.warehouse_id,
          _delta: adj.delta,
          _note: `تسوية كمية من بطاقة الصنف — ${adj.warehouse_name}`,
        });
        if (adjErr) throw adjErr;
      }


      // upsert child collections (delete-then-insert simplicity)
      await Promise.all([
        supabase.from("product_units" as any).delete().eq("product_id", pid),
        supabase.from("product_barcodes" as any).delete().eq("product_id", pid),
        supabase.from("product_price_tiers" as any).delete().eq("product_id", pid),
        supabase.from("product_warehouse_settings" as any).delete().eq("product_id", pid),
      ]);

      if (units.length) {
        await supabase.from("product_units" as any).insert(units.map(u => ({
          product_id: pid, user_id: ownerId,
          unit_name: u.unit_name, conversion_factor: Number(u.conversion_factor) || 1,
          is_sale: !!u.is_sale, is_purchase: !!u.is_purchase,
          is_default: !!u.is_default, is_active: !!u.is_active,
          barcode: u.barcode || null, notes: u.notes || null,
        })));
      }
      if (barcodes.length) {
        await supabase.from("product_barcodes" as any).insert(barcodes.map(b => ({
          product_id: pid, user_id: ownerId,
          barcode: b.barcode, description: b.description || null,
          is_default: !!b.is_default,
        })));
      }
      if (tiers.length) {
        await supabase.from("product_price_tiers" as any).insert(tiers.map(t => ({
          product_id: pid, user_id: ownerId,
          tier_name: t.tier_name, price: Number(t.price) || 0,
          min_price: t.min_price ?? null, max_price: t.max_price ?? null,
          currency: t.currency || "ILS", min_qty: Number(t.min_qty) || 0,
          is_active: t.is_active ?? true,
        })));
      }
      if (whSettings.length) {
        await supabase.from("product_warehouse_settings" as any).insert(whSettings.map(w => ({
          product_id: pid, user_id: ownerId,
          warehouse_id: w.warehouse_id,
          opening_qty: Number(w.opening_qty) || 0,
          min_qty: Number(w.min_qty) || 0,
          reorder_qty: Number(w.reorder_qty) || 0,
          max_qty: w.max_qty ?? null,
          is_default: !!w.is_default,
        })));
      }

      // Re-read the ledger so the card reflects exactly what the grid will show
      await loadStock(pid!);
      toast.success(
        pendingAdjustments.length
          ? `تم الحفظ وتسجيل ${pendingAdjustments.length} تسوية كمية`
          : "تم حفظ بطاقة الصنف",
      );
      setDirty(false);
      if (closeAfter) nav("/inventory");
      else if (isNew) nav(`/inventory/products/${pid}/edit`, { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    } finally { setSaving(false); }
  };

  const back = () => {
    if (dirty && !confirm("لديك تعديلات غير محفوظة. الخروج؟")) return;
    nav("/inventory");
  };

  const duplicate = () => {
    if (!product.id) { toast.error("احفظ المنتج أولاً"); return; }
    const clone = { ...product, id: undefined, name: product.name + " (نسخة)", sku: null };
    setProduct(clone as any); setUnits([...units]); setBarcodes([]); setTiers([...tiers]); setWhSettings([...whSettings]);
    setDirty(true);
    nav("/inventory/products/new");
    toast.message("جهزنا لك نسخة — احفظ لإنشاء منتج مستقل");
  };

  const delProduct = async () => {
    if (!product.id) return;
    if (!confirm("حذف هذا المنتج؟ لا يمكن التراجع")) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    nav("/inventory");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const stockStatus =
    product.quantity <= 0 ? { text: "نفد", cls: "bg-rose-500" }
    : product.min_quantity > 0 && product.quantity <= product.min_quantity ? { text: "منخفض", cls: "bg-amber-500" }
    : { text: "متوفر", cls: "bg-emerald-600" };

  /* -------- Action tabs (Dynamics-style ribbon via FinanceShell) -------- */
  const actionTabs: ActionTab[] = [{
    key: "general", label: "عام", groups: [
      { key: "save", label: "حفظ", items: [
        { key: "save", label: "حفظ", icon: Save, variant: "primary",
          onClick: () => save(false), disabled: saving || !dirty },
        { key: "saveClose", label: "حفظ وإغلاق", icon: CheckCircle2,
          onClick: () => save(true), disabled: saving },
      ]},
      { key: "new", label: "جديد", items: [
        { key: "new", label: "صنف جديد", icon: Plus,
          onClick: () => { if (dirty && !confirm("لديك تعديلات غير محفوظة. المتابعة؟")) return; nav("/inventory/products/new"); } },
        { key: "dup", label: "جديد مشابه", icon: Copy, onClick: duplicate, disabled: !product.id },
        { key: "del", label: "حذف", icon: Trash2, variant: "danger", onClick: delProduct, disabled: !product.id },
      ]},
      { key: "nav", label: "تنقل", items: [
        { key: "prev", label: "السابق", icon: ChevronRight,
          onClick: () => prevProduct && goTo(prevProduct.id), disabled: !prevProduct },
        { key: "next", label: "التالي", icon: ChevronLeft,
          onClick: () => nextProduct && goTo(nextProduct.id), disabled: !nextProduct },
        { key: "query", label: "استعلام", icon: Search, onClick: () => setLookupOpen(true) },
      ]},
      { key: "related", label: "ذات صلة", items: [
        { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print(), disabled: !product.id },
        ...(!isNew ? [{ key: "moves", label: "حركات المخزون", icon: Activity,
            onClick: () => nav(`/inventory-movements?product_id=${product.id}`) }] : []),
        ...(product.is_manufactured && !isNew ? [{ key: "formulas", label: "معادلات الإنتاج", icon: Factory,
            onClick: () => nav(`/production/formulas?product_id=${product.id}`) }] : []),
        { key: "center", label: "فتح المخزون", icon: Warehouse, onClick: back },
      ]},
    ],
  }];

  return (
    <FinanceShell
      title={isNew ? "بطاقة الصنف" : (product.name || "بطاقة الصنف")}
      breadcrumb={[
        { label: "المخزون", href: "/inventory" },
        { label: "الأصناف", href: "/inventory" },
        { label: isNew ? "منتج جديد" : (product.name || "تعديل") },
      ]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-5">تعديلات غير محفوظة</Badge>}
          {currentIdx >= 0 && (
            <span className="text-[10px] text-muted-foreground">{currentIdx + 1}/{products.length}</span>
          )}
        </div>
      }
    >
    <div dir="rtl">
      {/* ============= LOOKUP DIALOG ============= */}
      <CommandDialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <CommandInput placeholder="ابحث بالاسم أو رقم الصنف..." />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="الأصناف">
            {products.slice(0, 200).map(p => (
              <CommandItem key={p.id} value={`${p.name} ${p.sku ?? ""}`} onSelect={() => { setLookupOpen(false); goTo(p.id); }}>
                <Package className="w-4 h-4 ml-2" />
                <span className="flex-1 text-right">{p.name}</span>
                {p.sku && <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* ============= BODY ============= */}
      <div className="max-w-[1600px] mx-auto">
        <Tabs value={tab} onValueChange={setTab} dir="rtl">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1 mb-4">
            <TabsTrigger value="general" className="gap-1 text-xs"><Package className="w-3.5 h-3.5" /> عام</TabsTrigger>
            <TabsTrigger value="units" className="gap-1 text-xs"><Layers className="w-3.5 h-3.5" /> الوحدات {units.length ? `(${units.length})` : ""}</TabsTrigger>
            <TabsTrigger value="barcodes" className="gap-1 text-xs"><Barcode className="w-3.5 h-3.5" /> الباركود {barcodes.length ? `(${barcodes.length})` : ""}</TabsTrigger>
            <TabsTrigger value="prices" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /> الأسعار {tiers.length ? `(${tiers.length})` : ""}</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1 text-xs"><Warehouse className="w-3.5 h-3.5" /> المخزون {whSettings.length ? `(${whSettings.length})` : ""}</TabsTrigger>
            <TabsTrigger value="classification" className="gap-1 text-xs"><Tags className="w-3.5 h-3.5" /> التصنيف</TabsTrigger>
            <TabsTrigger value="purchase" className="gap-1 text-xs"><ShoppingCart className="w-3.5 h-3.5" /> الشراء</TabsTrigger>
            <TabsTrigger value="sales" className="gap-1 text-xs"><Store className="w-3.5 h-3.5" /> البيع ونقاط البيع</TabsTrigger>
            <TabsTrigger value="manufacturing" className="gap-1 text-xs"><Factory className="w-3.5 h-3.5" /> التصنيع {formulas.length ? `(${formulas.length})` : ""}</TabsTrigger>
            <TabsTrigger value="lifecycle" className="gap-1 text-xs"><LifeBuoy className="w-3.5 h-3.5" /> دورة الحياة</TabsTrigger>
            <TabsTrigger value="quality" className="gap-1 text-xs"><FlaskConical className="w-3.5 h-3.5" /> الجودة/الصلاحية</TabsTrigger>
            <TabsTrigger value="dimensions" className="gap-1 text-xs"><Ruler className="w-3.5 h-3.5" /> الأبعاد</TabsTrigger>
            <TabsTrigger value="tracking" className="gap-1 text-xs"><ShieldCheck className="w-3.5 h-3.5" /> التتبع</TabsTrigger>
            <TabsTrigger value="warranty" className="gap-1 text-xs"><Shield className="w-3.5 h-3.5" /> الكفالة</TabsTrigger>
            <TabsTrigger value="accounting" className="gap-1 text-xs"><Calculator className="w-3.5 h-3.5" /> الضريبة والمحاسبة</TabsTrigger>
            <TabsTrigger value="ecommerce" className="gap-1 text-xs"><Globe className="w-3.5 h-3.5" /> التجارة الإلكترونية</TabsTrigger>
            <TabsTrigger value="attachments" className="gap-1 text-xs"><Paperclip className="w-3.5 h-3.5" /> المرفقات</TabsTrigger>
          </TabsList>

          {/* ========== GENERAL ========== */}
          <FastTab id="general" icon={Package} label="بيانات الصنف الأساسية">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="اسم الصنف *">
                <Input value={product.name ?? ""} onChange={e => patch({ name: e.target.value })} placeholder="مثال: قميص أبيض" />
              </Field>
              <Field label="اسم الطباعة">
                <Input value={product.print_name ?? ""} onChange={e => patch({ print_name: e.target.value })} placeholder="يُطبع على الفواتير/الملصقات" />
              </Field>
              <Field label="رقم الصنف">
                <div className="flex gap-1">
                  <Input value={product.sku ?? ""} onChange={e => patch({ sku: e.target.value })} placeholder="تلقائي" />
                  <Button type="button" variant="outline" size="sm" onClick={genSKU}>توليد</Button>
                </div>
              </Field>

              <Field label="التصنيف">
                <ProductCategorySelect value={product.category} onChange={v => patch({ category: v })} ownerId={ownerId} />
              </Field>
              <Field label="الوحدة الأساسية">
                <ProductUnitSelect value={product.unit} onChange={v => patch({ unit: v })} ownerId={ownerId} />
              </Field>
              <Field label="نوع الصنف">
                <Select value={product.product_type ?? "finished"} onValueChange={v => patch({ product_type: v, is_manufactured: v === "finished" || v === "sub_assembly" ? product.is_manufactured : false })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw">مادة خام</SelectItem>
                    <SelectItem value="sub_assembly">تجميعة فرعية</SelectItem>
                    <SelectItem value="wip">تحت التصنيع (تحت التصنيع)</SelectItem>
                    <SelectItem value="finished">منتج نهائي</SelectItem>
                    <SelectItem value="service">خدمة</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="العلامة التجارية">
                <Input value={product.brand ?? ""} onChange={e => patch({ brand: e.target.value })} />
              </Field>
              <Field label="الشركة المنتجة">
                <Input value={product.manufacturer ?? ""} onChange={e => patch({ manufacturer: e.target.value })} />
              </Field>
              <Field label="الموديل / الطراز">
                <Input value={product.model ?? ""} onChange={e => patch({ model: e.target.value })} />
              </Field>

              <Field label="اللون">
                <Input value={product.color ?? ""} onChange={e => patch({ color: e.target.value })} placeholder="مثال: أسود / أحمر — يظهر للمستخدمين فقط إذا أدخلته" />
              </Field>
              <Field label="الرقم الأصلي (الأصلي)">
                <Input value={product.original_number ?? ""} onChange={e => patch({ original_number: e.target.value })} />
              </Field>
              <Field label="رقم المصنع">
                <Input value={product.factory_number ?? ""} onChange={e => patch({ factory_number: e.target.value })} />
              </Field>

              <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!product.is_sold} onCheckedChange={c => patch({ is_sold: !!c })} /> يُباع
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!product.is_purchased} onCheckedChange={c => patch({ is_purchased: !!c })} /> يُشترى
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!product.is_pos_product} onCheckedChange={c => patch({ is_pos_product: !!c })} /> يظهر في نقاط البيع
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!product.is_hazardous} onCheckedChange={c => patch({ is_hazardous: !!c })} />
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> مادة خطيرة
                </label>
              </div>

              <Field label="الوصف" className="md:col-span-3">
                <Textarea rows={3} value={product.description ?? ""} onChange={e => patch({ description: e.target.value })} placeholder="وصف تفصيلي للمنتج أو الخدمة..." />
              </Field>
            </div>
          </FastTab>

          {/* ========== UNITS ========== */}
          <FastTab id="units" icon={Layers} label="الوحدات المتعددة" badge={units.length}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-muted-foreground">
                عرّف وحدات إضافية لنفس الصنف (مثل: كرتونة = 12 قطعة). الوحدة الأساسية تبقى: <b>{product.unit}</b>
              </p>
              <Button size="sm" variant="outline" onClick={() => setUnits(u => [...u, { unit_name: "", conversion_factor: 1, is_sale: true, is_purchase: true, is_default: u.length === 0, is_active: true }])}>
                <Plus className="w-4 h-4" /> وحدة
              </Button>
            </div>
            {units.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">لا يوجد وحدات إضافية</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الوحدة</TableHead>
                    <TableHead>معامل التحويل</TableHead>
                    <TableHead>للبيع</TableHead>
                    <TableHead>للشراء</TableHead>
                    <TableHead>افتراضية</TableHead>
                    <TableHead>نشطة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell><Input value={u.unit_name} onChange={e => { const c = [...units]; c[i].unit_name = e.target.value; setUnits(c); setDirty(true); }} placeholder="كرتونة" /></TableCell>
                      <TableCell><Input type="number" step="0.001" value={u.conversion_factor} onChange={e => { const c = [...units]; c[i].conversion_factor = parseFloat(e.target.value) || 0; setUnits(c); setDirty(true); }} /></TableCell>
                      <TableCell><Checkbox checked={u.is_sale} onCheckedChange={v => { const c = [...units]; c[i].is_sale = !!v; setUnits(c); setDirty(true); }} /></TableCell>
                      <TableCell><Checkbox checked={u.is_purchase} onCheckedChange={v => { const c = [...units]; c[i].is_purchase = !!v; setUnits(c); setDirty(true); }} /></TableCell>
                      <TableCell><Checkbox checked={u.is_default} onCheckedChange={v => { const c = units.map((x, j) => ({ ...x, is_default: j === i ? !!v : false })); setUnits(c); setDirty(true); }} /></TableCell>
                      <TableCell><Checkbox checked={u.is_active} onCheckedChange={v => { const c = [...units]; c[i].is_active = !!v; setUnits(c); setDirty(true); }} /></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => { setUnits(units.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FastTab>

          {/* ========== BARCODES ========== */}
          <FastTab id="barcodes" icon={Barcode} label="الباركود" badge={barcodes.length}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-muted-foreground">يمكن للصنف امتلاك عدة باركود (لكل وحدة أو تعبئة). واحد فقط يكون افتراضيًا.</p>
              <Button size="sm" variant="outline" onClick={() => setBarcodes(b => [...b, { barcode: "", description: "", is_default: b.length === 0 }])}>
                <Plus className="w-4 h-4" /> باركود
              </Button>
            </div>
            {barcodes.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">لا يوجد باركود مسجل</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الباركود</TableHead>
                    <TableHead>الوصف / الوحدة</TableHead>
                    <TableHead>افتراضي</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {barcodes.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell><Input value={b.barcode} onChange={e => { const c = [...barcodes]; c[i].barcode = e.target.value; setBarcodes(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input value={b.description ?? ""} onChange={e => { const c = [...barcodes]; c[i].description = e.target.value; setBarcodes(c); setDirty(true); }} placeholder="مثلاً: كرتونة / لون أزرق" /></TableCell>
                      <TableCell><Checkbox checked={b.is_default} onCheckedChange={v => { const c = barcodes.map((x, j) => ({ ...x, is_default: j === i ? !!v : false })); setBarcodes(c); setDirty(true); }} /></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => { setBarcodes(barcodes.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FastTab>

          {/* ========== PRICES ========== */}
          <FastTab id="prices" icon={DollarSign} label="التكلفة والأسعار">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pb-4 border-b">
              <Field label="تكلفة الشراء الافتراضية">
                <Input type="number" step="0.01" value={product.buy_price ?? 0} onChange={e => patch({ buy_price: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="سعر البيع">
                <Input type="number" step="0.01" value={product.sell_price ?? 0} onChange={e => patch({ sell_price: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="سعر خاص">
                <Input type="number" step="0.01" value={product.special_price ?? ""} onChange={e => patch({ special_price: e.target.value ? parseFloat(e.target.value) : null })} />
              </Field>
              <Field label="التكلفة المعيارية (للتصنيع)" hint="محسوبة من معادلة الإنتاج">
                <Input type="number" value={product.standard_cost ?? 0} readOnly className="bg-muted" />
              </Field>
              <Field label="متوسط التكلفة" hint="محسوب من الحركات">
                <Input type="number" value={product.average_cost ?? 0} readOnly className="bg-muted" />
              </Field>
              <Field label="عمولة المبيعات %">
                <Input type="number" step="0.01" value={product.sales_commission_pct ?? 0} onChange={e => patch({ sales_commission_pct: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="عمولة ثابتة (₪/وحدة)">
                <Input type="number" step="0.01" value={product.sales_commission_fixed ?? 0} onChange={e => patch({ sales_commission_fixed: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="أقصى نسبة خصم %">
                <Input type="number" step="0.01" value={product.max_discount_pct ?? 0} onChange={e => patch({ max_discount_pct: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>

            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold">فئات الأسعار</h4>
              <Button size="sm" variant="outline" onClick={() => setTiers(t => [...t, { tier_name: "", price: 0, min_price: null, max_price: null, currency: "ILS", min_qty: 0, is_active: true }])}>
                <Plus className="w-4 h-4" /> فئة سعر
              </Button>
            </div>
            {tiers.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">لا يوجد فئات أسعار (مفرق / جملة / مميز...)</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم الفئة</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>حد أدنى</TableHead>
                    <TableHead>حد أعلى</TableHead>
                    <TableHead>أدنى كمية</TableHead>
                    <TableHead>العملة</TableHead>
                    <TableHead>نشطة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell><Input value={t.tier_name} onChange={e => { const c = [...tiers]; c[i].tier_name = e.target.value; setTiers(c); setDirty(true); }} placeholder="مفرق / جملة" /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={t.price} onChange={e => { const c = [...tiers]; c[i].price = parseFloat(e.target.value) || 0; setTiers(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={t.min_price ?? ""} onChange={e => { const c = [...tiers]; c[i].min_price = e.target.value ? parseFloat(e.target.value) : null; setTiers(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={t.max_price ?? ""} onChange={e => { const c = [...tiers]; c[i].max_price = e.target.value ? parseFloat(e.target.value) : null; setTiers(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={t.min_qty} onChange={e => { const c = [...tiers]; c[i].min_qty = parseFloat(e.target.value) || 0; setTiers(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input value={t.currency} onChange={e => { const c = [...tiers]; c[i].currency = e.target.value; setTiers(c); setDirty(true); }} className="w-16" /></TableCell>
                      <TableCell><Checkbox checked={t.is_active} onCheckedChange={v => { const c = [...tiers]; c[i].is_active = !!v; setTiers(c); setDirty(true); }} /></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => { setTiers(tiers.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FastTab>

          {/* ========== INVENTORY / WAREHOUSES ========== */}
          <FastTab id="inventory" icon={Warehouse} label="المخزون والمستودعات">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b">
              <Field label="طريقة التقييم">
                <Select value={product.valuation_method ?? "weighted_avg"} onValueChange={v => patch({ valuation_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weighted_avg">متوسط مرجّح</SelectItem>
                    <SelectItem value="fifo">الوارد أولاً</SelectItem>
                    <SelectItem value="standard">تكلفة معيارية</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {isNew ? (
                <>
                  <Field label="الكمية الافتتاحية">
                    <Input type="number" step="any" value={product.quantity ?? 0} onChange={e => patch({ quantity: parseFloat(e.target.value) || 0 })} />
                  </Field>
                  {qtyDelta !== 0 && (
                    <Field label="مستودع الكمية الافتتاحية">
                      <Select value={adjWarehouseId} onValueChange={setAdjWarehouseId}>
                        <SelectTrigger><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                        <SelectContent>
                          {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </>
              ) : (
                <Field label="الكمية الحالية (كامل الشركة)">
                  <Input
                    type="number"
                    readOnly
                    value={targetTotal}
                    className={targetTotal !== derivedTotal ? "font-bold border-amber-500 text-amber-700" : "font-bold"}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {stockLoading
                      ? "جارٍ قراءة حركات المخزون…"
                      : targetTotal !== derivedTotal
                        ? `الرصيد الحالي ${derivedTotal} — سيصبح ${targetTotal} بعد الحفظ`
                        : "الكمية مشتقّة من حركات المخزون — عدّلها من جدول الأرصدة لكل مستودع أدناه."}
                  </p>
                </Field>
              )}

              <Field label="حد أدنى عام (تذكير)">
                <Input type="number" value={product.min_quantity ?? 0} onChange={e => patch({ min_quantity: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>

            {!isNew && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">أرصدة المخزون لكل مستودع (قابلة للتعديل)</h4>
                  <Button size="sm" variant="ghost" onClick={() => loadStock()} disabled={stockLoading}>
                    تحديث الأرصدة
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  أي تعديل هنا يُسجَّل كحركة مخزون رسمية (وارد/صادر) ويظهر فوراً في جدول المخزون وبطاقة الصنف وكل التقارير.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المستودع</TableHead>
                      <TableHead>الرصيد الحالي</TableHead>
                      <TableHead>الكمية الجديدة</TableHead>
                      <TableHead>الفرق</TableHead>
                      <TableHead>عدد الحركات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whStock.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                          {stockLoading ? "جارٍ التحميل…" : "لا يوجد مستودعات"}
                        </TableCell>
                      </TableRow>
                    ) : whStock.map(r => {
                      const raw = qtyTargets[r.warehouse_id];
                      const target = raw === "" || raw === undefined ? r.qty : Number(raw) || 0;
                      const delta = Math.round((target - r.qty) * 1000) / 1000;
                      return (
                        <TableRow key={r.warehouse_id}>
                          <TableCell className="font-medium">{r.warehouse_name}</TableCell>
                          <TableCell className="tabular-nums">{r.qty}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="any"
                              className="w-32"
                              value={raw ?? String(r.qty)}
                              onChange={e => { setQtyTargets(t => ({ ...t, [r.warehouse_id]: e.target.value })); setDirty(true); }}
                            />
                          </TableCell>
                          <TableCell className={`tabular-nums ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">{r.movements}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold">إعدادات لكل مستودع</h4>
              <Button size="sm" variant="outline" disabled={!warehouses.length}
                onClick={() => setWhSettings(w => [...w, { warehouse_id: warehouses[0]?.id ?? "", opening_qty: 0, min_qty: 0, reorder_qty: 0, max_qty: null, is_default: w.length === 0 }])}>
                <Plus className="w-4 h-4" /> مستودع
              </Button>
            </div>
            {whSettings.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">
                {warehouses.length === 0 ? "لا يوجد مستودعات مسجلة — أنشئ مستودعًا أولاً" : "لم يتم تخصيص هذا الصنف لأي مستودع"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستودع</TableHead>
                    <TableHead>الكمية الابتدائية</TableHead>
                    <TableHead>حد أدنى</TableHead>
                    <TableHead>حد إعادة الطلب</TableHead>
                    <TableHead>حد أقصى</TableHead>
                    <TableHead>افتراضي</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whSettings.map((w, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={w.warehouse_id} onValueChange={v => { const c = [...whSettings]; c[i].warehouse_id = v; setWhSettings(c); setDirty(true); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {warehouses.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" value={w.opening_qty} onChange={e => { const c = [...whSettings]; c[i].opening_qty = parseFloat(e.target.value) || 0; setWhSettings(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" value={w.min_qty} onChange={e => { const c = [...whSettings]; c[i].min_qty = parseFloat(e.target.value) || 0; setWhSettings(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" value={w.reorder_qty} onChange={e => { const c = [...whSettings]; c[i].reorder_qty = parseFloat(e.target.value) || 0; setWhSettings(c); setDirty(true); }} /></TableCell>
                      <TableCell><Input type="number" value={w.max_qty ?? ""} onChange={e => { const c = [...whSettings]; c[i].max_qty = e.target.value ? parseFloat(e.target.value) : null; setWhSettings(c); setDirty(true); }} /></TableCell>
                      <TableCell><Checkbox checked={w.is_default} onCheckedChange={v => { const c = whSettings.map((x, j) => ({ ...x, is_default: j === i ? !!v : false })); setWhSettings(c); setDirty(true); }} /></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => { setWhSettings(whSettings.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </FastTab>

          {/* ========== CLASSIFICATION ========== */}
          <FastTab id="classification" icon={Tags} label="التصنيف والصفات">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="التصنيف الرئيسي">
                <ProductCategorySelect value={product.category} onChange={v => patch({ category: v })} ownerId={ownerId} />
              </Field>
              <Field label="وسوم (افصل بفواصل)">
                <Input value={(product.tags ?? []).join(", ")} onChange={e => patch({ tags: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} placeholder="مميز, عروض, صيف" />
              </Field>
            </div>
          </FastTab>

          {/* ========== PURCHASE ========== */}
          <FastTab id="purchase" icon={ShoppingCart} label="بيانات الشراء">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="المورد الافتراضي">
                <Select value={product.default_supplier_id ?? ""} onValueChange={v => patch({ default_supplier_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سعر الشراء الافتراضي">
                <Input type="number" step="0.01" value={product.default_purchase_price ?? ""} onChange={e => patch({ default_purchase_price: e.target.value ? parseFloat(e.target.value) : null })} />
              </Field>
              <Field label="مدة التوريد (أيام)">
                <Input type="number" value={product.lead_time_days ?? ""} onChange={e => patch({ lead_time_days: e.target.value ? parseInt(e.target.value) : null })} />
              </Field>
              <Field label="أدنى كمية طلب">
                <Input type="number" step="0.01" value={product.min_order_qty ?? 0} onChange={e => patch({ min_order_qty: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="حساب المشتريات">
                <Input value={product.purchase_account_code ?? ""} onChange={e => patch({ purchase_account_code: e.target.value })} placeholder="5110" />
              </Field>
            </div>
          </FastTab>

          {/* ========== SALES / POS ========== */}
          <FastTab id="sales" icon={Store} label="البيع ونقاط البيع">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="حساب الإيرادات">
                <Input value={product.sales_account_code ?? ""} onChange={e => patch({ sales_account_code: e.target.value })} placeholder="4100" />
              </Field>
              <Field label="لون الزر في نقاط البيع">
                <Input type="color" value={(product as any).pos_tile_color ?? "#3B82F6"} onChange={e => patch({ pos_tile_color: e.target.value } as any)} />
              </Field>
              <Field label="ترتيب في نقاط البيع">
                <Input type="number" value={product.pos_sort_order ?? 0} onChange={e => patch({ pos_sort_order: parseInt(e.target.value) || 0 })} />
              </Field>
              <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!product.is_pos_product} onCheckedChange={c => patch({ is_pos_product: !!c })} /> يظهر في نقاط البيع</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!product.show_in_qr_menu} onCheckedChange={c => patch({ show_in_qr_menu: !!c })} /> قائمة الـ QR</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!product.is_weighted} onCheckedChange={c => patch({ is_weighted: !!c })} /> بيع بالوزن</label>
              </div>
            </div>
          </FastTab>

          {/* ========== MANUFACTURING ========== */}
          <FastTab id="manufacturing" icon={Factory} label="التصنيع ومعادلة الإنتاج (BOM)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b">
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <Switch checked={!!product.is_manufactured} onCheckedChange={c => patch({ is_manufactured: !!c })} />
                هذا المنتج يتم تصنيعه داخليًا
              </label>
              {product.is_manufactured && (
                <>
                  <Field label="وقت الإنتاج القياسي (دقيقة)">
                    <Input type="number" value={product.standard_production_time_minutes ?? ""} onChange={e => patch({ standard_production_time_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                  </Field>
                  <Field label="نسبة الإنتاجية المتوقعة %">
                    <Input type="number" step="0.1" value={product.production_yield_pct ?? 100} onChange={e => patch({ production_yield_pct: parseFloat(e.target.value) || 100 })} />
                  </Field>
                  <Field label="معادلة الإنتاج الافتراضية">
                    <Select value={product.default_bom_id ?? ""} onValueChange={v => patch({ default_bom_id: v || null })}>
                      <SelectTrigger><SelectValue placeholder={formulas.length ? "اختر معادلة" : "لا توجد معادلات بعد"} /></SelectTrigger>
                      <SelectContent>
                        {formulas.map(f => <SelectItem key={f.id} value={f.id}>{f.name} (v{f.version})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}
            </div>

            {product.is_manufactured && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold">معادلات الإنتاج لهذا المنتج ({formulas.length})</h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => nav(`/production/formulas/new?output_product_id=${product.id ?? ""}`)}>
                      <Plus className="w-4 h-4" /> معادلة جديدة
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => nav("/production/formulas")}>عرض الكل</Button>
                  </div>
                </div>
                {formulas.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6 border rounded">
                    لا توجد معادلة إنتاج لهذا المنتج بعد.
                  </div>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الكود</TableHead><TableHead>الإصدار</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {formulas.map(f => (
                        <TableRow key={f.id}>
                          <TableCell>{f.name}</TableCell>
                          <TableCell>{f.code ?? "—"}</TableCell>
                          <TableCell>v{f.version}</TableCell>
                          <TableCell><Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status}</Badge></TableCell>
                          <TableCell><Button size="sm" variant="ghost" onClick={() => nav(`/production/formulas/${f.id}/edit`)}>فتح</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="mt-6 p-3 bg-muted/30 border rounded flex items-center justify-between">
                  <div className="text-sm">
                    <b>Where-used:</b> هذا المنتج مستخدم كمكوّن في <b>{whereUsedCount}</b> معادلة أخرى.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => nav(`/production/formulas?component=${product.id ?? ""}`)} disabled={!whereUsedCount}>عرض المعادلات</Button>
                </div>
              </div>
            )}
          </FastTab>

          {/* ========== LIFECYCLE ========== */}
          <FastTab id="lifecycle" icon={LifeBuoy} label="دورة الحياة والتوفر">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="الحالة">
                <Select value={product.lifecycle_status ?? "active"} onValueChange={v => patch({ lifecycle_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">مستمر (نشط)</SelectItem>
                    <SelectItem value="discontinued">متوقف</SelectItem>
                    <SelectItem value="will_stop">سوف يتوقف</SelectItem>
                    <SelectItem value="replaced">مستبدل بمنتج آخر</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="تاريخ الإطلاق">
                <Input type="date" value={product.launch_date ?? ""} onChange={e => patch({ launch_date: e.target.value || null })} />
              </Field>
              {product.lifecycle_status === "will_stop" && (
                <Field label="تاريخ التوقف">
                  <Input type="date" value={product.will_stop_date ?? ""} onChange={e => patch({ will_stop_date: e.target.value || null })} />
                </Field>
              )}
              {product.lifecycle_status === "replaced" && (
                <Field label="المنتج البديل" className="md:col-span-2">
                  <Select value={product.replaced_by_product_id ?? ""} onValueChange={v => patch({ replaced_by_product_id: v || null })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {products.filter(p => p.id !== product.id).map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          </FastTab>

          {/* ========== QUALITY / EXPIRY ========== */}
          <FastTab id="quality" icon={FlaskConical} label="الجودة والصلاحية">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <Switch checked={!!product.has_expiry} onCheckedChange={c => patch({ has_expiry: !!c })} />
                هذا المنتج له تاريخ صلاحية
              </label>
              {product.has_expiry && (
                <>
                  <Field label="مدة الصلاحية الافتراضية (أيام)">
                    <Input type="number" value={product.default_shelf_life_days ?? ""} onChange={e => patch({ default_shelf_life_days: e.target.value ? parseInt(e.target.value) : null })} />
                  </Field>
                  <Field label="تذكير قبل الانتهاء بـ (يوم)">
                    <Input type="number" value={product.expiry_reminder_days ?? ""} onChange={e => patch({ expiry_reminder_days: e.target.value ? parseInt(e.target.value) : null })} />
                  </Field>
                  <Field label="أدنى مدة صلاحية مقبولة عند الاستلام (يوم)">
                    <Input type="number" value={product.min_shelf_life_days ?? ""} onChange={e => patch({ min_shelf_life_days: e.target.value ? parseInt(e.target.value) : null })} />
                  </Field>
                </>
              )}
            </div>
          </FastTab>

          {/* ========== DIMENSIONS ========== */}
          <FastTab id="dimensions" icon={Ruler} label="الأبعاد والوزن">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="الطول (سم)"><Input type="number" step="0.01" value={product.length ?? ""} onChange={e => patch({ length: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
              <Field label="العرض (سم)"><Input type="number" step="0.01" value={product.width ?? ""} onChange={e => patch({ width: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
              <Field label="الارتفاع (سم)"><Input type="number" step="0.01" value={product.height ?? ""} onChange={e => patch({ height: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
              <Field label="الوزن الصافي (كغ)"><Input type="number" step="0.001" value={product.net_weight ?? ""} onChange={e => patch({ net_weight: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
              <Field label="الوزن القائم (كغ)"><Input type="number" step="0.001" value={product.gross_weight ?? ""} onChange={e => patch({ gross_weight: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
              <Field label="الحجم (لتر)"><Input type="number" step="0.01" value={product.volume ?? ""} onChange={e => patch({ volume: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
            </div>
          </FastTab>

          {/* ========== TRACKING ========== */}
          <FastTab id="tracking" icon={ShieldCheck} label="تتبع الدفعات والسيريال">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!product.requires_batch_tracking} onCheckedChange={c => patch({ requires_batch_tracking: !!c })} />
                تتبع الدفعات
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!product.is_serialized} onCheckedChange={c => patch({ is_serialized: !!c })} />
                تتبع الأرقام التسلسلية (Serial)
              </label>
              <p className="text-xs text-muted-foreground">تفعيل التتبع يجعل كل حركة مخزون تتطلب رقم دفعة/سيريال ويظهر في جداول <code>product_batches</code>.</p>
            </div>
          </FastTab>

          {/* ========== WARRANTY ========== */}
          <FastTab id="warranty" icon={Shield} label="الكفالة">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!product.has_warranty} onCheckedChange={c => patch({ has_warranty: !!c })} />
                هذا المنتج له كفالة
              </label>
              {product.has_warranty && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="مدة الكفالة">
                    <Input type="number" value={product.warranty_duration ?? ""} onChange={e => patch({ warranty_duration: e.target.value ? parseInt(e.target.value) : null })} />
                  </Field>
                  <Field label="وحدة المدة">
                    <Select value={product.warranty_unit ?? "months"} onValueChange={v => patch({ warranty_unit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">أيام</SelectItem>
                        <SelectItem value="months">أشهر</SelectItem>
                        <SelectItem value="years">سنوات</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="نوع الكفالة">
                    <Input value={product.warranty_type ?? ""} onChange={e => patch({ warranty_type: e.target.value })} placeholder="وكيل / موزع / محلي" />
                  </Field>
                  <Field label="ملاحظات الكفالة" className="md:col-span-3">
                    <Textarea rows={3} value={product.warranty_notes ?? ""} onChange={e => patch({ warranty_notes: e.target.value })} placeholder="شروط الكفالة، الاستثناءات، طريقة المطالبة..." />
                  </Field>
                </div>
              )}
            </div>
          </FastTab>

          {/* ========== ACCOUNTING ========== */}
          <FastTab id="accounting" icon={Calculator} label="الضريبة والحسابات">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="نسبة الضريبة %">
                <Input type="number" step="0.01" value={product.tax_rate ?? 0} onChange={e => patch({ tax_rate: parseFloat(e.target.value) || 0 })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!product.is_tax_exempt} onCheckedChange={c => patch({ is_tax_exempt: !!c })} />
                معفى من الضريبة
              </label>
              <Field label="حساب الإيرادات">
                <Input value={product.sales_account_code ?? ""} onChange={e => patch({ sales_account_code: e.target.value })} placeholder="4100" />
              </Field>
              <Field label="حساب تكلفة البضاعة المباعة">
                <Input value={product.purchase_account_code ?? ""} onChange={e => patch({ purchase_account_code: e.target.value })} placeholder="5110" />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground mt-3">إن ترك حساب فارغاً يُستخدم الحساب الافتراضي من إعدادات المحاسبة العامة.</p>
          </FastTab>

          {/* ========== ECOMMERCE ========== */}
          <FastTab id="ecommerce" icon={Globe} label="التجارة الإلكترونية">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!product.publish_to_ecommerce} onCheckedChange={c => patch({ publish_to_ecommerce: !!c })} />
                نشر إلى المتجر الإلكتروني / قائمة الـ QR
              </label>
              {product.publish_to_ecommerce && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="SEO Title"><Input value={product.seo_title ?? ""} onChange={e => patch({ seo_title: e.target.value })} maxLength={60} /></Field>
                  <Field label="SEO Description" className="md:col-span-2"><Textarea rows={2} value={product.seo_description ?? ""} onChange={e => patch({ seo_description: e.target.value })} maxLength={160} /></Field>
                </div>
              )}
            </div>
          </FastTab>

          {/* ========== ATTACHMENTS ========== */}
          <FastTab id="attachments" icon={Paperclip} label="المرفقات والملاحظات">
            <div className="space-y-4">
              <Field label="صورة المنتج (URL)">
                <Input value={product.image_url ?? ""} onChange={e => patch({ image_url: e.target.value })} placeholder="https://..." />
                {product.image_url && <img src={product.image_url} alt="" className="mt-2 w-24 h-24 object-cover rounded border" />}
              </Field>
              <Field label="ملاحظات داخلية">
                <Textarea rows={4} value={product.notes ?? ""} onChange={e => patch({ notes: e.target.value })} />
              </Field>
              <Field label="الشروط والأحكام (تظهر في الفاتورة)">
                <Textarea rows={3} value={product.terms ?? ""} onChange={e => patch({ terms: e.target.value })} />
              </Field>
            </div>
          </FastTab>
        </Tabs>

        {/* ============= FOOTER ============= */}
        <div className="sticky bottom-0 mt-6 -mx-4 px-4 py-3 bg-card border-t flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {product.updated_at && `آخر تعديل: ${new Date(product.updated_at).toLocaleString("ar")}`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={back} disabled={saving}>إلغاء</Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving || !dirty} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
            </Button>
            <Button onClick={() => save(true)} disabled={saving} className="gap-1">
              <CheckCircle2 className="w-4 h-4" /> حفظ وإغلاق
            </Button>
          </div>
        </div>
      </div>
    </div>
    </FinanceShell>
  );
}