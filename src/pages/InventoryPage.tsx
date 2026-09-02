import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import {
  Loader2, Plus, Package, Search, AlertTriangle, TrendingUp, TrendingDown,
  Pencil, Trash2, History, X, ArrowUpDown, ChevronLeft, ChevronRight,
  ClipboardList, ChefHat, Camera, ScanLine, Barcode, RefreshCw, Download,
  Printer, Upload, FolderPlus, ClipboardCheck, Boxes, MoreVertical, Filter, Warehouse,
} from "lucide-react";
import BarcodePrintDialog from "@/components/inventory/BarcodePrintDialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";
import {
  FinanceShell, ColumnVisibilityMenu, useColumnVisibility, applyFilters,
} from "@/components/finance/shell";
import type { ActionTab, ColumnDef, FilterField, FilterCondition } from "@/components/finance/shell";
import EmptyState from "@/components/EmptyState";
import { usePageSessionState, usePageScrollRestoration } from "@/hooks/usePageSessionState";

interface Product {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
  kitchen_station_id: string | null;
  barcode: string | null;
  tax_rate: number | null;
  is_sold: boolean;
  is_purchased: boolean;
  is_pos_product: boolean;
  sales_account_code: string | null;
  purchase_account_code: string | null;
  description: string | null;
  terms: string | null;
  product_type?: string;
  service_direction?: string | null;
}

interface AccountOption {
  account_code: string;
  account_name: string;
  account_type: string;
}

interface KitchenStation {
  id: string;
  name: string;
  color: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface StockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_note: string | null;
  created_at: string;
}

const DEFAULT_CATEGORIES = ["بضاعة عامة", "مواد خام", "مواد تعبئة", "قطع غيار", "أخرى"];
const DEFAULT_UNITS = ["قطعة", "كيلو", "لتر", "متر", "علبة", "كرتونة", "طن"];
const PAGE_SIZE_OPTIONS = [15, 30, 100];

const CATEGORY_PREFIXES: Record<string, string> = {
  "بضاعة عامة": "GEN",
  "مواد خام": "RAW",
  "مواد تعبئة": "PKG",
  "قطع غيار": "SPR",
  "أخرى": "OTH",
};

type SortKey = "name" | "category" | "quantity" | "min_quantity" | "buy_price" | "sell_price" | "sku" | "unit" | "model" | "color" | "warehouses_label";
type SortDir = "asc" | "desc";

const COLOR_NAME_HEX: Record<string, string> = {
  "اسود": "#111827", "أسود": "#111827", "بلاك": "#111827",
  "ابيض": "#FFFFFF", "أبيض": "#FFFFFF",
  "احمر": "#DC2626", "أحمر": "#DC2626",
  "ازرق": "#2563EB", "أزرق": "#2563EB",
  "اخضر": "#16A34A", "أخضر": "#16A34A",
  "اصفر": "#EAB308", "أصفر": "#EAB308",
  "برتقالي": "#F97316", "زهري": "#EC4899", "بني": "#78350F",
  "بيج": "#D6C7A1", "سكني": "#8A7F6B", "كحلي": "#1E3A5F",
  "ذهبي": "#D4AF37", "فضي": "#C0C0C0", "سلفر": "#C0C0C0",
  "نيكل": "#B8BCC0", "كربون": "#2F3336", "صحراوي": "#C2B280", "جيشي": "#4B5320",
};

/** يرجع لون معاينة فقط إذا كانت القيمة hex صالحة أو اسم لون معروف، وإلا null (وصف نصي مثل «خزانة» أو «فراولة») */
const colorSwatch = (raw?: string | null): string | null => {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  return COLOR_NAME_HEX[v] ?? null;
};


const stockStatus = (p: Product) => {
  if (p.quantity <= 0) return "نفد";
  if (p.min_quantity > 0 && p.quantity <= p.min_quantity) return "منخفض";
  return "متوفر";
};

const fmtPrice = (n: number) => n === 0 ? "—" : `₪${n.toLocaleString()}`;

const InventoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { toast } = useToast();
  const { settings } = useCompanySettings();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = usePageSessionState<string>("searchQuery", "");
  const [filterCategory, setFilterCategory] = usePageSessionState<string>("filterCategory", "all");
  const [stockFilter, setStockFilter] = usePageSessionState<string>("stockFilter", "all");
  const [warehouseFilter, setWarehouseFilter] = usePageSessionState<string>("warehouseFilter", "all");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [whStockMap, setWhStockMap] = useState<Map<string, number>>(new Map());
  const [dateFrom, setDateFrom] = usePageSessionState<string>("dateFrom", "");
  const [dateTo, setDateTo] = usePageSessionState<string>("dateTo", "");
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showMovementsDialog, setShowMovementsDialog] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [showCustomUnit, setShowCustomUnit] = useState(false);

  const [sortKey, setSortKey] = usePageSessionState<SortKey>("sortKey", "name");
  const [sortDir, setSortDir] = usePageSessionState<SortDir>("sortDir", "asc");
  const [page, setPage] = usePageSessionState<number>("page", 1);
  const [perPage, setPerPage] = usePageSessionState<number>("perPage", 15);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);
  const [shellFilters, setShellFilters] = usePageSessionState<FilterCondition[]>("shellFilters", []);
  usePageScrollRestoration();

  const [form, setForm] = useState({
    name: "", category: "بضاعة عامة", skuPrefix: "GEN",
    buy_price: "", sell_price: "", quantity: "", min_quantity: "",
    unit: "قطعة", notes: "", kitchen_station_id: "" as string,
    barcode: "", tax_rate: "0", custom_tax_rate: "",
    is_sold: true, is_purchased: true, is_pos_product: false,
    sales_account_code: "4100", purchase_account_code: "5110",
    description: "", terms: "",
    product_type: "product" as string,
    service_direction: "" as string,
    has_warranty: false,
    warranty_duration: "" as string,
    warranty_unit: "months" as string,
    warranty_type: "" as string,
    warranty_notes: "" as string,
  });

  const CATEGORIES = useMemo(() =>
    [...new Set([...DEFAULT_CATEGORIES, ...products.map(p => p.category), form.category])].filter(Boolean),
    [products, form.category]
  );
  const UNITS = useMemo(() =>
    [...new Set([...DEFAULT_UNITS, ...products.map(p => p.unit), form.unit])].filter(Boolean),
    [products, form.unit]
  );

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodePrintProduct, setBarcodePrintProduct] = useState<Product | null>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement>(null);
  const barcodeStreamRef = useRef<MediaStream | null>(null);

  const TAX_OPTIONS = ["0", "5", "7.5", "10", "16", "17", "أخرى"];

  const generateSKU = (prefix: string) => {
    const existingWithPrefix = products.filter(p => p.sku?.startsWith(prefix + "-"));
    const maxNum = existingWithPrefix.reduce((max, p) => {
      const num = parseInt(p.sku?.split("-")[1] || "0");
      return num > max ? num : max;
    }, 0);
    return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
  };

  const getCategoryPrefix = (category: string): string =>
    CATEGORY_PREFIXES[category] || category.substring(0, 3).toUpperCase();

  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { fetchAllRows } = await import("@/lib/fetch-all-rows");
      // NOTE: paging with a non-unique sort key (created_at) returns unstable
      // pages — rows silently repeat or go missing, which skewed the KPIs and
      // the inventory value. Always page on a unique key.
      const rows = await fetchAllRows<any>((from, to) =>
        supabase
          .from("products")
          .select("*")
          .eq("user_id", ownerId)
          .order("id", { ascending: true })
          .range(from, to)
      );

      // keep the previous UX order (newest first) after the stable id-paged fetch
      rows.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      setProducts(rows.map((p: any) => ({ ...p, kitchen_station_id: p.kitchen_station_id || null })));

    } catch (error) {
      toast({ title: "خطأ في تحميل المنتجات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("kitchen_stations")
      .select("id, name, color")
      .eq("is_active", true)
      .order("display_order");
    setKitchenStations((data as KitchenStation[]) || []);
  }, [user]);

  const fetchAccounts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("accounts")
      .select("account_code, account_name, account_type")
      .eq("user_id", ownerId)
      .in("account_type", ["إيرادات", "مصاريف", "أصول"])
      .eq("is_active", true)
      .order("account_code");
    setAccounts((data as AccountOption[]) || []);
  }, [user]);

  useEffect(() => { fetchProducts(); fetchStations(); fetchAccounts(); }, [user]);

  // Warehouses list for the top-strip filter
  useEffect(() => {
    if (!ownerId) return;
    supabase
      .from("warehouses")
      .select("id, name, is_default")
      .eq("user_id", ownerId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name")
      .then(({ data }) => setWarehouses((data as WarehouseOption[]) || []));
  }, [ownerId]);

  // Per-warehouse on-hand quantities when a warehouse filter is active.
  // NOTE: PostgREST caps a response at 1000 rows — with thousands of products the
  // map used to be silently truncated and most items showed 0. We page through
  // the whole set and cache each warehouse so switching back is instant.
  const whStockCache = useRef<Map<string, { qty: Map<string, number>; carded: Set<string> }>>(new Map());
  const [whCardedIds, setWhCardedIds] = useState<Set<string>>(new Set());
  const [whStockLoading, setWhStockLoading] = useState(false);

  useEffect(() => {
    if (!ownerId || warehouseFilter === "all") { setWhStockMap(new Map()); setWhCardedIds(new Set()); setWhStockLoading(false); return; }
    const cached = whStockCache.current.get(warehouseFilter);
    if (cached) { setWhStockMap(cached.qty); setWhCardedIds(cached.carded); setWhStockLoading(false); return; }

    let cancelled = false;
    setWhStockLoading(true);
    (async () => {
      const m = new Map<string, number>();
      const carded = new Set<string>();
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        // NOTE: paging a view without an explicit order returns unstable pages
        // (rows repeat / go missing) — always order by a unique key.
        const { data, error } = await supabase
          .from("product_warehouse_stock")
          .select("product_id, quantity_on_hand, movement_count")
          .eq("user_id", ownerId)
          .eq("warehouse_id", warehouseFilter)
          .order("product_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data) break;
        data.forEach((r: any) => {
          m.set(r.product_id, Number(r.quantity_on_hand) || 0);
          if (Number(r.movement_count) > 0) carded.add(r.product_id);
        });
        if (data.length < PAGE) break;
      }
      if (cancelled) return;
      whStockCache.current.set(warehouseFilter, { qty: m, carded });
      setWhStockMap(m);
      setWhCardedIds(carded);
      setWhStockLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ownerId, warehouseFilter]);

  // Invalidate the warehouse stock cache whenever products reload (edits, imports…)
  useEffect(() => { whStockCache.current.clear(); }, [ownerId]);

  // Full per-product warehouse breakdown (used by the "المستودعات" column so the
  // user can tell which warehouse an item belongs to while viewing "كل المستودعات").
  const [whBreakdown, setWhBreakdown] = useState<Map<string, { name: string; qty: number }[]>>(new Map());
  useEffect(() => {
    if (!ownerId || warehouses.length === 0) { setWhBreakdown(new Map()); return; }
    const nameById = new Map(warehouses.map(w => [w.id, w.name]));
    let cancelled = false;
    (async () => {
      const m = new Map<string, { name: string; qty: number }[]>();
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("product_warehouse_stock")
          .select("product_id, warehouse_id, quantity_on_hand, movement_count")
          .eq("user_id", ownerId)
          .order("product_id", { ascending: true })
          .order("warehouse_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data) break;
        (data as any[]).forEach(r => {
          if (!(Number(r.movement_count) > 0)) return;
          const name = nameById.get(r.warehouse_id);
          if (!name) return;
          const list = m.get(r.product_id) || [];
          list.push({ name, qty: Number(r.quantity_on_hand) || 0 });
          m.set(r.product_id, list);
        });
        if (data.length < PAGE) break;
      }
      if (cancelled) return;
      m.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setWhBreakdown(m);
    })();
    return () => { cancelled = true; };
  }, [ownerId, warehouses]);

  // Products with quantity overridden by the selected warehouse's on-hand qty.
  // Only items that actually have a stock card (movement) in that warehouse are shown,
  // so KPIs (value / out-of-stock) reflect the warehouse and not the whole catalog.
  const displayProducts = useMemo(() => {
    const withWh = (p: Product) => {
      const list = whBreakdown.get(p.id) || [];
      return { ...p, _warehouses: list, warehouses_label: list.map(w => w.name).join("، ") };
    };
    if (warehouseFilter === "all") return products.map(withWh);
    return products
      .filter(p => whCardedIds.has(p.id))
      .map(p => ({ ...withWh(p), quantity: whStockMap.get(p.id) ?? 0 }));
  }, [products, warehouseFilter, whStockMap, whCardedIds, whBreakdown]);


  const resetForm = () => {
    setForm({ name: "", category: "بضاعة عامة", skuPrefix: "GEN", buy_price: "", sell_price: "", quantity: "", min_quantity: "", unit: "قطعة", notes: "", kitchen_station_id: "", barcode: "", tax_rate: "0", custom_tax_rate: "", is_sold: true, is_purchased: true, is_pos_product: false, sales_account_code: "4100", purchase_account_code: "5110", description: "", terms: "", product_type: "product", service_direction: "", has_warranty: false, warranty_duration: "", warranty_unit: "months", warranty_type: "", warranty_notes: "" });
    setEditMode(false);
    setSelectedProduct(null);
    stopBarcodeScanner();
  };

  const startBarcodeScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      barcodeStreamRef.current = stream;
      setShowBarcodeScanner(true);
      setTimeout(() => {
        if (barcodeVideoRef.current) {
          barcodeVideoRef.current.srcObject = stream;
          barcodeVideoRef.current.play();
        }
      }, 100);
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] });
        const scanLoop = async () => {
          if (!barcodeVideoRef.current || !barcodeStreamRef.current) return;
          try {
            const barcodes = await detector.detect(barcodeVideoRef.current);
            if (barcodes.length > 0) {
              setForm(p => ({ ...p, barcode: barcodes[0].rawValue }));
              stopBarcodeScanner();
              toast({ title: "تم مسح الباركود" });
              return;
            }
          } catch {}
          if (barcodeStreamRef.current) requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      } else {
        toast({ title: "المتصفح لا يدعم مسح الباركود", description: "يرجى إدخاله يدوياً", variant: "destructive" });
        stopBarcodeScanner();
      }
    } catch {
      toast({ title: "لا يمكن الوصول للكاميرا", variant: "destructive" });
    }
  };

  const stopBarcodeScanner = () => {
    barcodeStreamRef.current?.getTracks().forEach(t => t.stop());
    barcodeStreamRef.current = null;
    setShowBarcodeScanner(false);
  };

  const openEdit = (product: Product) => {
    // Open new full-page product editor (Dynamics F&O style)
    navigate(`/inventory/products/${product.id}/edit`);
    return;
    // eslint-disable-next-line no-unreachable
    const prefix = product.sku?.split("-")[0] || getCategoryPrefix(product.category);
    const taxStr = String(product.tax_rate || 0);
    const isCustomTax = !["0", "5", "7.5", "10", "16", "17"].includes(taxStr);
    setForm({
      name: product.name, category: product.category, skuPrefix: prefix,
      buy_price: String(product.buy_price), sell_price: String(product.sell_price),
      quantity: String(product.quantity), min_quantity: String(product.min_quantity),
      unit: product.unit, notes: product.notes || "",
      kitchen_station_id: product.kitchen_station_id || "",
      barcode: product.barcode || "",
      tax_rate: isCustomTax ? "أخرى" : taxStr,
      custom_tax_rate: isCustomTax ? taxStr : "",
      is_sold: product.is_sold ?? true,
      is_purchased: product.is_purchased ?? true,
      is_pos_product: product.is_pos_product ?? false,
      sales_account_code: product.sales_account_code || "4100",
      purchase_account_code: product.purchase_account_code || "5110",
      description: product.description || "",
      terms: product.terms || "",
      product_type: (product as any).product_type || "product",
      service_direction: (product as any).service_direction || "",
      has_warranty: !!(product as any).has_warranty,
      warranty_duration: (product as any).warranty_duration ? String((product as any).warranty_duration) : "",
      warranty_unit: (product as any).warranty_unit || "months",
      warranty_type: (product as any).warranty_type || "",
      warranty_notes: (product as any).warranty_notes || "",
    });
    setSelectedProduct(product);
    setEditMode(true);
    setShowProductDialog(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) {
      toast({ title: "يرجى إدخال اسم المنتج", variant: "destructive" });
      return;
    }
    setSaving(true);
    const autoSKU = editMode && selectedProduct?.sku ? selectedProduct.sku : generateSKU(form.skuPrefix);
    const taxRate = form.tax_rate === "أخرى" ? parseFloat(form.custom_tax_rate) || 0 : parseFloat(form.tax_rate) || 0;
    const payload: any = {
      user_id: ownerId, name: form.name.trim(), category: form.category as any,
      sku: autoSKU, buy_price: parseFloat(form.buy_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0, quantity: parseFloat(form.quantity) || 0,
      min_quantity: parseFloat(form.min_quantity) || 0, unit: form.unit,
      notes: form.notes.trim() || null,
      kitchen_station_id: form.kitchen_station_id || null,
      barcode: form.barcode.trim() || null,
      tax_rate: taxRate,
      is_sold: form.is_sold,
      is_purchased: form.is_purchased,
      is_pos_product: form.is_pos_product,
      sales_account_code: form.is_sold ? (form.sales_account_code || null) : null,
      purchase_account_code: form.is_purchased ? (form.purchase_account_code || null) : null,
      description: form.description.trim() || null,
      terms: form.terms.trim() || null,
      product_type: form.product_type,
      service_direction: form.product_type === "service" ? (form.service_direction || null) : null,
      has_warranty: form.has_warranty,
      warranty_duration: form.has_warranty && form.warranty_duration ? parseInt(form.warranty_duration) : null,
      warranty_unit: form.has_warranty ? (form.warranty_unit || "months") : null,
      warranty_type: form.has_warranty ? (form.warranty_type || null) : null,
      warranty_notes: form.has_warranty ? (form.warranty_notes.trim() || null) : null,
    };
    if (editMode && selectedProduct) {
      const { error } = await supabase.from("products").update(payload).eq("id", selectedProduct.id);
      if (error) toast({ title: "خطأ في تحديث المنتج", variant: "destructive" });
      else toast({ title: "تم تحديث المنتج" });
    } else {
      const { data: inserted, error } = await supabase
        .from("products")
        .insert(payload)
        .select("id, quantity")
        .single();
      if (error) toast({ title: "خطأ في إضافة المنتج", description: error.message, variant: "destructive" });
      else {
        toast({ title: "تم إضافة المنتج" });
        // Opening balance → write a stock movement to the default warehouse so per-warehouse
        // availability (used in invoices/POS) reflects the manual opening quantity.
        const openingQty = Number(payload.quantity) || 0;
        if (inserted?.id && openingQty > 0 && form.product_type !== "service") {
          const { data: defWh } = await supabase
            .from("warehouses")
            .select("id")
            .eq("user_id", ownerId)
            .eq("is_default", true)
            .maybeSingle();
          if (defWh?.id) {
            await supabase.from("stock_movements").insert({
              user_id: ownerId,
              product_id: inserted.id,
              warehouse_id: defWh.id,
              movement_type: "وارد" as any,
              quantity: openingQty,
              reference_type: "opening_balance",
              reference_note: "رصيد افتتاحي",
              unit_cost: parseFloat(form.buy_price) || 0,
            });
          }
        }
      }
    }
    setSaving(false);
    setShowProductDialog(false);
    resetForm();
    fetchProducts();
  };

  const handleDelete = async (product: Product) => {
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) toast({ title: "خطأ في حذف المنتج", variant: "destructive" });
    else { toast({ title: "تم حذف المنتج" }); fetchProducts(); }
  };

  const openMovements = async (product: Product) => {
    setSelectedProduct(product);
    setShowMovementsDialog(true);
    setMovementsLoading(true);
    
    // Query all movement sources in parallel
    const [stockRes, posInvRes, posLinesRes] = await Promise.all([
      supabase.from("stock_movements").select("*").eq("product_id", product.id),
      supabase.from("pos_inventory_movements").select("*").eq("product_id", product.id),
      supabase.from("pos_order_lines").select("id, qty, created_at, order_id, pos_orders!inner(state, order_number)").eq("product_id", product.id),
    ]);

    const allMovements: StockMovement[] = [];

    // stock_movements
    (stockRes.data || []).forEach((m: any) => {
      allMovements.push({
        id: m.id,
        product_id: m.product_id,
        movement_type: m.movement_type,
        quantity: m.quantity,
        reference_note: m.reference_note,
        created_at: m.created_at,
      });
    });

    // pos_inventory_movements (manual input / purchases)
    (posInvRes.data || []).forEach((m: any) => {
      const typeMap: Record<string, string> = {
        production_in: "إدخال بضاعة",
        purchase_in: "مشتريات",
        adjustment: "تعديل يدوي",
      };
      allMovements.push({
        id: m.id,
        product_id: m.product_id,
        movement_type: typeMap[m.type] || m.type,
        quantity: m.quantity,
        reference_note: m.notes || null,
        created_at: m.created_at,
      });
    });

    // POS sales (completed orders)
    (posLinesRes.data || []).forEach((line: any) => {
      const order = line.pos_orders;
      if (!order) return;
      const stateLabel = order.state === 'completed' ? 'مبيعات POS' : 
                         order.state === 'cancelled' ? 'طلب ملغي' : order.state;
      allMovements.push({
        id: line.id,
        product_id: product.id,
        movement_type: order.state === 'completed' ? 'بيع POS' : 
                       order.state === 'cancelled' ? 'طلب ملغي' : 'طلب POS',
        quantity: line.qty,
        reference_note: `${stateLabel} - طلب #${order.order_number}`,
        created_at: line.created_at,
      });
    });

    // Sort by date descending
    allMovements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setMovements(allMovements);
    setMovementsLoading(false);
  };

  // Filtering
  const filtered = useMemo(() => {
    let data = [...displayProducts];
    if (filterCategory !== "all") data = data.filter(p => p.category === filterCategory);
    if (stockFilter === "متوفر") data = data.filter(p => stockStatus(p) === "متوفر");
    else if (stockFilter === "منخفض") data = data.filter(p => stockStatus(p) === "منخفض");
    else if (stockFilter === "نفد") data = data.filter(p => stockStatus(p) === "نفد");
    else if (stockFilter === "سالب") data = data.filter(p => Number(p.quantity) < 0);
    else if (stockFilter === "صفر") data = data.filter(p => Number(p.quantity) === 0);
    else if (stockFilter === "سالب_صفر") data = data.filter(p => Number(p.quantity) <= 0);
    if (searchQuery) {
      data = data.filter(p => multiWordMatchAny(searchQuery, p.name, p.sku, p.category, p.barcode, (p as any).brand, (p as any).manufacturer, (p as any).model, (p as any).original_number, (p as any).factory_number, (p as any).print_name));
    }
    if (dateFrom) data = data.filter(p => (p.created_at?.split("T")[0] || "") >= dateFrom);
    if (dateTo) data = data.filter(p => (p.created_at?.split("T")[0] || "") <= dateTo);
    return applyFilters(data, shellFilters);
  }, [displayProducts, filterCategory, stockFilter, searchQuery, dateFrom, dateTo, shellFilters]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = (a as any)[sortKey], bv: any = (b as any)[sortKey];
      if (sortKey === "warehouses_label") {
        const as_ = (av || "").toString(), bs = (bv || "").toString();
        // Items with no warehouse always go last, then alphabetical (Arabic-aware)
        if (!as_ && !bs) return 0;
        if (!as_) return 1;
        if (!bs) return -1;
        const c = as_.localeCompare(bs, "ar");
        return sortDir === "asc" ? c : -c;
      }
      if (sortKey === "model" || sortKey === "color") { av = (av || "").toString().toLowerCase(); bv = (bv || "").toString().toLowerCase(); }
      else if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paged = sorted.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [searchQuery, filterCategory, stockFilter, warehouseFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allPageSelected = paged.length > 0 && paged.every(p => selected.has(p.id));
  const toggleAllPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) paged.forEach(p => next.delete(p.id));
      else paged.forEach(p => next.add(p.id));
      return next;
    });
  };

  // KPI
  const totalValue = displayProducts.reduce((s, p) => s + p.quantity * (p.buy_price || p.sell_price), 0);
  const lowStock = displayProducts.filter(p => stockStatus(p) === "منخفض").length;
  const outStock = displayProducts.filter(p => stockStatus(p) === "نفد").length;
  const negStock = displayProducts.filter(p => Number(p.quantity) < 0).length;
  const zeroStock = displayProducts.filter(p => Number(p.quantity) === 0).length;

  const movementTypeLabel: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
    "وارد": { label: "وارد", color: "text-primary", icon: TrendingUp },
    "صادر": { label: "صادر", color: "text-destructive", icon: TrendingDown },
    "تعديل يدوي": { label: "تعديل", color: "text-yellow-600", icon: Pencil },
    "إدخال بضاعة": { label: "إدخال بضاعة", color: "text-primary", icon: TrendingUp },
    "مشتريات": { label: "مشتريات", color: "text-primary", icon: TrendingUp },
    "بيع POS": { label: "بيع POS", color: "text-destructive", icon: TrendingDown },
    "طلب ملغي": { label: "طلب ملغي", color: "text-muted-foreground", icon: History },
    "طلب POS": { label: "طلب POS", color: "text-yellow-600", icon: History },
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  // ============ COLUMN VISIBILITY ============
  const INVENTORY_COLUMNS: ColumnDef[] = [
    { key: "sku", label: "الكود", defaultVisible: true },
    { key: "name", label: "اسم الصنف", required: true },
    { key: "category", label: "الفئة", defaultVisible: true },
    { key: "warehouses", label: "المستودعات", defaultVisible: true },
    { key: "model", label: "الموديل", defaultVisible: true },
    { key: "color", label: "اللون", defaultVisible: true },
    { key: "quantity", label: "الكمية", required: true },
    { key: "min_quantity", label: "الحد الأدنى", defaultVisible: true },
    { key: "buy_price", label: "سعر الشراء", defaultVisible: true },
    { key: "sell_price", label: "سعر البيع", defaultVisible: true },
    { key: "unit", label: "الوحدة", defaultVisible: false },
    { key: "stock_value", label: "قيمة المخزون", defaultVisible: false },
{ key: "barcode", label: "الباركود", defaultVisible: false },
    { key: "brand", label: "العلامة التجارية", defaultVisible: false },
    { key: "manufacturer", label: "الشركة المنتجة", defaultVisible: false },

    { key: "product_type", label: "نوع الصنف", defaultVisible: false },
    { key: "lifecycle_status", label: "دورة الحياة", defaultVisible: false },
    { key: "flags", label: "خصائص", defaultVisible: false },
    { key: "status", label: "الحالة", required: true },
    { key: "actions", label: "إجراءات", required: true },
  ];
  const cols = useColumnVisibility("inventory:cols-v1", INVENTORY_COLUMNS);
  const show = cols.isVisible;

  // ============ FILTER FIELDS ============
  const categoryOptions = useMemo(
    () => CATEGORIES.map(c => ({ value: c, label: c })),
    [CATEGORIES]
  );
  const unitOptions = useMemo(
    () => UNITS.map(u => ({ value: u, label: u })),
    [UNITS]
  );
  const filterFields: FilterField[] = useMemo(() => ([
    { key: "category", label: "الفئة", type: "option", options: categoryOptions },
    { key: "unit", label: "الوحدة", type: "option", options: unitOptions },
    { key: "quantity", label: "الكمية", type: "number" },
    { key: "buy_price", label: "سعر الشراء", type: "number" },
    { key: "sell_price", label: "سعر البيع", type: "number" },
    { key: "sku", label: "الكود", type: "text" },
    { key: "barcode", label: "الباركود", type: "text" },
    { key: "created_at", label: "تاريخ الإضافة", type: "date" },
    { key: "brand", label: "العلامة التجارية", type: "text" },
    { key: "manufacturer", label: "الشركة المنتجة", type: "text" },
    { key: "model", label: "الموديل", type: "text" },
    { key: "original_number", label: "الرقم الأصلي (OEM)", type: "text" },
    { key: "factory_number", label: "رقم المصنع", type: "text" },
    { key: "product_type", label: "نوع الصنف", type: "option", options: [
      { value: "raw", label: "مادة خام" },
      { value: "sub_assembly", label: "تجميعة فرعية" },
      { value: "wip", label: "تحت التصنيع" },
      { value: "finished", label: "منتج نهائي" },
      { value: "service", label: "خدمة" },
    ] },
    { key: "lifecycle_status", label: "دورة الحياة", type: "option", options: [
      { value: "active", label: "مستمر" },
      { value: "discontinued", label: "متوقف" },
      { value: "will_stop", label: "سوف يتوقف" },
      { value: "replaced", label: "مستبدل" },
    ] },
    { key: "is_manufactured", label: "قيد التصنيع", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "is_pos_product", label: "في POS", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "is_sold", label: "يُباع", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "is_purchased", label: "يُشترى", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "has_expiry", label: "له صلاحية", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "is_hazardous", label: "مادة خطيرة", type: "option", options: [
      { value: "true", label: "نعم" }, { value: "false", label: "لا" },
    ] },
    { key: "default_supplier_id", label: "المورد الافتراضي", type: "text" },
    { key: "tax_rate", label: "نسبة الضريبة", type: "number" },
  ]), [categoryOptions, unitOptions]);

  // Count visible columns for proper colSpan in footer / empty rows
  const optionalVisible = ["sku","category","warehouses","min_quantity","buy_price","sell_price","unit","stock_value","barcode","brand","manufacturer","product_type","lifecycle_status","flags"]
    .filter(k => show(k)).length;
  const visibleColCount = 1 /* checkbox */ + 1 /* name */ + optionalVisible + 2 /* status + actions */;

  // ============ ACTION TABS ============
  const oneSelected = selected.size === 1;
  const selectedProductFromSet = useMemo(() => {
    if (selected.size !== 1) return null;
    const id = Array.from(selected)[0];
    return products.find(p => p.id === id) || null;
  }, [selected, products]);

  const actionTabs: ActionTab[] = [{
    key: "home", label: "عام",
    groups: [
      {
        key: "new", label: "جديد", items: [
          { key: "new-product",  label: "إضافة منتج", icon: Plus,        variant: "primary", onClick: () => navigate("/inventory/products/new") },
          { key: "quick-add",    label: "إضافة سريعة", icon: Plus,       onClick: () => { resetForm(); setShowProductDialog(true); } },
          { key: "new-category", label: "إضافة فئة",  icon: FolderPlus,  disabled: true, tooltip: "أضف الفئة من نموذج المنتج" },
        ],
      },
      {
        key: "movements", label: "حركات", items: [
          { key: "stock-mov",    label: "حركة مخزون",    icon: Boxes,           onClick: () => navigate("/inventory-movements") },
          { key: "stock-docs",   label: "سندات المخزون", icon: ClipboardCheck,  onClick: () => navigate("/stock-documents") },
          { key: "goods-in",     label: "سند إدخال",     icon: Plus,            onClick: () => navigate("/stock-documents/new?type=in") },
          { key: "goods-out",    label: "سند إخراج",     icon: Pencil,          onClick: () => navigate("/stock-documents/new?type=out") },
          {
            key: "print-barcode", label: "طباعة باركود", icon: Barcode,
            disabled: !oneSelected,
            tooltip: oneSelected ? undefined : "اختر منتجاً واحداً",
            onClick: () => { if (selectedProductFromSet) setBarcodePrintProduct(selectedProductFromSet); },
          },
        ],
      },
      {
        key: "actions", label: "إجراءات", items: [
          { key: "refresh", label: "تحديث",  icon: RefreshCw, onClick: fetchProducts, disabled: loading },
          { key: "import",  label: "استيراد", icon: Upload,    disabled: true, tooltip: "غير مفعّل حالياً" },
        ],
      },
      {
        key: "export", label: "تصدير وطباعة", items: [
          { key: "excel", label: "Excel",  icon: Download, disabled: filtered.length === 0,
            tooltip: filtered.length === 0 ? "لا توجد بيانات" : undefined,
            onClick: () => {
              const headers = [
                "الكود","الاسم","اسم الطباعة","الفئة","النوع","دورة الحياة","الوحدة",
                "الباركود","العلامة","الشركة المنتجة","الموديل","اللون","الرقم الأصلي","رقم المصنع",
                "الكمية","الحد الأدنى","سعر الشراء","سعر البيع","السعر الخاص","التكلفة المعيارية","متوسط التكلفة",
                "قيمة المخزون","نسبة الضريبة","حساب المبيعات","حساب المشتريات",
                "قيد التصنيع","في POS","يُباع","يُشترى","له صلاحية","خطر","سيريال","Batch","الحالة"
              ];
              const b = (v: any) => v ? "نعم" : "لا";
              const csvEscape = (v: any) => {
                const s = String(v ?? "");
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              };
              const rows = filtered.map((p: any) => [
                p.sku || "", p.name, p.print_name || "", p.category, p.product_type || "", p.lifecycle_status || "active", p.unit,
                p.barcode || "", p.brand || "", p.manufacturer || "", p.model || "", p.color || "", p.original_number || "", p.factory_number || "",
                p.quantity, p.min_quantity, p.buy_price, p.sell_price, p.special_price ?? "", p.standard_cost ?? "", p.average_cost ?? "",
                (p.quantity * (p.buy_price || p.sell_price)) || 0, p.tax_rate ?? "", p.sales_account_code || "", p.purchase_account_code || "",
                b(p.is_manufactured), b(p.is_pos_product), b(p.is_sold), b(p.is_purchased), b(p.has_expiry), b(p.is_hazardous), b(p.is_serialized), b(p.requires_batch_tracking), stockStatus(p),
              ]);
              const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "inventory.csv"; a.click();
            },
          },
          {
            key: "profit-report", label: "تقرير ربحية الأصناف", icon: TrendingUp,
            onClick: () => navigate("/inventory/profit-report"),
          },
          { key: "print", label: "طباعة", icon: Printer, disabled: filtered.length === 0,
            tooltip: filtered.length === 0 ? "لا توجد بيانات" : undefined,
            onClick: () => {
              const fmt = (n: number) => n === 0 ? "—" : `₪${n.toLocaleString()}`;
              const filteredValue = filtered.reduce((s, p) => s + p.quantity * (p.buy_price || p.sell_price), 0);
              const fLow = filtered.filter(p => stockStatus(p) === "منخفض").length;
              const fOut = filtered.filter(p => stockStatus(p) === "نفد").length;
              const rowsHtml = filtered.map(p => {
                const st = stockStatus(p);
                const stClass = st === "نفد" ? "text-red" : st === "منخفض" ? "text-primary" : "text-green";
                const lineValue = p.quantity * (p.buy_price || p.sell_price);
                return `<tr>
                  <td class="font-mono">${p.sku || "—"}</td>
                  <td>${p.name}</td>
                  <td>${p.category || "—"}</td>
                  <td class="font-mono">${p.quantity.toLocaleString()}</td>
                  <td class="font-mono text-muted">${p.min_quantity || "—"}</td>
                  <td>${p.unit || "—"}</td>
                  <td class="font-mono">${fmt(p.buy_price || 0)}</td>
                  <td class="font-mono">${fmt(p.sell_price || 0)}</td>
                  <td class="font-mono font-bold">${fmt(lineValue)}</td>
                  <td class="${stClass}">${st}</td>
                </tr>`;
              }).join("");
              const contentHtml = `
                <div class="print-header">
                  <div>
                    <div class="company-name">${settings.company_name || "الشركة"}</div>
                    <div class="report-title">تقرير المخزون</div>
                  </div>
                  <div class="print-date">${filtered.length} صنف</div>
                </div>
                <div class="summary-row">
                  <div class="summary-card"><div class="summary-label">إجمالي الأصناف</div><div class="summary-value">${filtered.length}</div></div>
                  <div class="summary-card"><div class="summary-label">قيمة المخزون</div><div class="summary-value">₪${filteredValue.toLocaleString()}</div></div>
                  <div class="summary-card"><div class="summary-label">مخزون منخفض</div><div class="summary-value">${fLow}</div></div>
                  <div class="summary-card"><div class="summary-label">نفد المخزون</div><div class="summary-value red">${fOut}</div></div>
                </div>
                <table>
                  <thead><tr>
                    <th>الكود</th><th>اسم الصنف</th><th>الفئة</th><th>الكمية</th><th>الحد الأدنى</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>قيمة المخزون</th><th>الحالة</th>
                  </tr></thead>
                  <tbody>${rowsHtml}</tbody>
                  <tfoot><tr>
                    <td colspan="8" style="text-align:right">إجمالي قيمة المخزون (${filtered.length} صنف)</td>
                    <td class="font-mono font-bold">₪${filteredValue.toLocaleString()}</td>
                    <td></td>
                  </tr></tfoot>
                </table>
              `;
              import("@/lib/printUtils").then(({ printReport }) => {
                printReport({
                  title: "تقرير المخزون",
                  companyName: settings.company_name || "الشركة",
                  contentHtml,
                });
              });
            },
          },
        ],
      },
    ],
  }];

  const rightSlot = (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="اسم، كود، باركود..."
          className="h-8 w-56 pr-8 text-xs"
          dir="rtl"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {warehouses.length > 0 && (
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="h-8 w-44 text-xs" dir="rtl">
            {whStockLoading
              ? <RefreshCw className="h-3.5 w-3.5 ml-1 animate-spin text-muted-foreground/70" />
              : <Warehouse className="h-3.5 w-3.5 ml-1 text-muted-foreground/70" />}
            <SelectValue placeholder="كل المستودعات" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all" className="text-xs">كل المستودعات</SelectItem>
            {warehouses.map(w => (
              <SelectItem key={w.id} value={w.id} className="text-xs">
                {w.name}{w.is_default ? " (افتراضي)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <ColumnVisibilityMenu state={cols} />
    </div>
  );

  const statusBadge = (st: string) => {
    const cls =
      st === "متوفر" ? "bg-primary/10 text-primary border-primary/20" :
      st === "منخفض" ? "bg-muted text-foreground border-border" :
      "bg-destructive/10 text-destructive border-destructive/20";
    const Icon = st === "نفد" ? AlertTriangle : st === "منخفض" ? AlertTriangle : Package;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
        <Icon className="h-3 w-3" />
        {st}
      </span>
    );
  };

  return (
    <>
    <FinanceShell
      title="المخزون"
      subtitle="إدارة الأصناف والكميات والتنبيهات وحركات المخزون."
      breadcrumb={[{ label: "إدارة المخزون", href: "/inventory" }, { label: "المنتجات" }]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey="inventory-page"
      rightSlot={rightSlot}
    >
    <div className="space-y-4" dir="rtl">

      {/* KPI Cards — neutral, can act as quick filters */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "إجمالي الأصناف", value: displayProducts.length,            icon: Package,        onClick: () => setStockFilter("all"),     active: stockFilter === "all" },
            { label: "قيمة المخزون",   value: `₪${totalValue.toLocaleString()}`, icon: Boxes,          onClick: undefined,                       active: false },
            { label: "مخزون منخفض",    value: lowStock,                          icon: AlertTriangle,  onClick: () => setStockFilter("منخفض"),  active: stockFilter === "منخفض" },
            { label: "نفد المخزون",    value: outStock,                          icon: AlertTriangle,  onClick: () => setStockFilter("نفد"),    active: stockFilter === "نفد",  negative: outStock > 0 },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={k.onClick}
                disabled={!k.onClick}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-right transition-colors ${
                  k.active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                } ${k.onClick ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="w-8 h-8 rounded flex items-center justify-center bg-muted text-muted-foreground shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold tabular-nums truncate ${k.negative ? "text-destructive" : "text-foreground"}`}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Secondary toolbar: category pills + date + selection count */}
      {products.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-semibold">حالة الكمية:</span>
          {[
            { key: "all", label: "الكل", count: products.length },
            { key: "سالب", label: "سالب", count: negStock },
            { key: "صفر", label: "صفر", count: zeroStock },
            { key: "سالب_صفر", label: "سالب + صفر", count: negStock + zeroStock },
            { key: "منخفض", label: "منخفض", count: lowStock },
          ].map(o => (
            <button
              key={o.key}
              onClick={() => setStockFilter(o.key)}
              className={`px-3 py-1 rounded border text-[11px] font-semibold whitespace-nowrap transition-colors ${
                stockFilter === o.key ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {o.label} ({o.count})
            </button>
          ))}
        </div>
      )}

      {products.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1 min-w-0">
            <button onClick={() => setFilterCategory("all")} className={`px-3 py-1 rounded border text-[11px] font-semibold whitespace-nowrap transition-colors ${filterCategory === "all" ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/40"}`}>
              الكل
            </button>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-3 py-1 rounded border text-[11px] font-semibold whitespace-nowrap transition-colors ${filterCategory === cat ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/40"}`}>
                {cat}
              </button>
            ))}
          </div>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClear={() => { setDateFrom(""); setDateTo(""); }}
            compact
          />
          {selected.size > 0 && (
            <span className="text-[11px] text-primary font-semibold">{selected.size} صنف محدد</span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && products.length === 0 && (
        <EmptyState
          icon={<Package className="h-16 w-16" />}
          title="لا توجد أصناف بعد"
          description="أضف أول منتج لبدء تتبع المخزون والحركات."
          primaryAction={{ label: "إضافة منتج", onClick: () => navigate("/inventory/products/new"), icon: <Plus className="h-4 w-4" /> }}
          secondaryAction={{ label: "استيراد منتجات", onClick: () => toast({ title: "غير مفعّل حالياً" }), icon: <Upload className="h-4 w-4" /> }}
        />
      )}

      {/* No results */}
      {!loading && products.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2 border border-border rounded bg-card">
          <Search className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد أصناف تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterCategory("all"); setStockFilter("all"); setShellFilters([]); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2.5 text-right w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-primary-foreground/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                  </th>
                  {show("sku") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الكود" field="sku" /></th>}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="اسم الصنف" field="name" /></th>
                  {show("category") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الفئة" field="category" /></th>}
                  {show("warehouses") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="المستودعات" field="warehouses_label" /></th>}
                  {show("model") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الموديل" field="model" /></th>}
                  {show("color") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="اللون" field="color" /></th>}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الكمية" field="quantity" /></th>
                  {show("min_quantity") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الحد الأدنى" field="min_quantity" /></th>}
                  {show("buy_price") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="سعر الشراء" field="buy_price" /></th>}
                  {show("sell_price") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="سعر البيع" field="sell_price" /></th>}
                  {show("unit") && <th className="px-3 py-2.5 text-right text-xs font-semibold"><SortHeader label="الوحدة" field="unit" /></th>}
                  {show("stock_value") && <th className="px-3 py-2.5 text-right text-xs font-semibold">قيمة المخزون</th>}
                  {show("barcode") && <th className="px-3 py-2.5 text-right text-xs font-semibold">الباركود</th>}
                  {show("brand") && <th className="px-3 py-2.5 text-right text-xs font-semibold">العلامة</th>}
{show("manufacturer") && <th className="px-3 py-2.5 text-right text-xs font-semibold">الشركة المنتجة</th>}
                  {show("product_type") && <th className="px-3 py-2.5 text-right text-xs font-semibold">النوع</th>}
                  {show("lifecycle_status") && <th className="px-3 py-2.5 text-right text-xs font-semibold">دورة الحياة</th>}
                  {show("flags") && <th className="px-3 py-2.5 text-right text-xs font-semibold">خصائص</th>}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold w-[80px]">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => {
                  const st = stockStatus(p);
                  const isSelected = selected.has(p.id);
                  const margin = p.buy_price > 0 && p.sell_price > 0
                    ? Math.round(((p.sell_price - p.buy_price) / p.sell_price) * 100) : null;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-border/50 transition-colors ${
                        isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                      } hover:bg-primary/5`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(p.id)} />
                      </td>
                      {show("sku") && <td className="px-3 py-2 text-xs text-muted-foreground font-mono" dir="ltr">{p.sku || "—"}</td>}
 <td className="px-3 py-2">
                        <button onClick={() => navigate(`/inventory-movements?product=${p.id}`)} className="text-sm font-semibold text-foreground hover:text-primary hover:underline transition-colors text-right">
                          {p.name}
                        </button>
                      </td>
                      {show("category") && <td className="px-3 py-2 text-xs text-muted-foreground">{p.category}</td>}
                      {show("warehouses") && (
                        <td className="px-3 py-2 text-xs">
                          {((p as any)._warehouses || []).length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {((p as any)._warehouses as { name: string; qty: number }[]).map(w => (
                                <span
                                  key={w.name}
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${
                                    w.qty < 0
                                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                                      : w.qty === 0
                                        ? "border-border bg-muted/40 text-muted-foreground"
                                        : "border-border bg-secondary/40 text-foreground"
                                  }`}
                                  title={`${w.name}: ${w.qty}`}
                                >
                                  {w.name}
                                  <span className="tabular-nums font-semibold">{w.qty}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                      {show("model") && <td className="px-3 py-2 text-xs text-muted-foreground">{(p as any).model || "—"}</td>}
                      {show("color") && (
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {(p as any).color && (p as any).color !== "#3B82F6" ? (
                            <span className="flex items-center gap-1.5">
                              {colorSwatch((p as any).color) && (
                                <span className="inline-block h-3 w-3 rounded-full border border-border" style={{ backgroundColor: colorSwatch((p as any).color) as string }} />
                              )}
                              {(p as any).color}
                            </span>
                          ) : "—"}
                        </td>
                      )}

                      <td className="px-3 py-2 text-sm font-bold tabular-nums text-foreground">{p.quantity.toLocaleString()}</td>
                      {show("min_quantity") && <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{p.min_quantity}</td>}
                      {show("buy_price") && <td className="px-3 py-2 text-xs tabular-nums">{fmtPrice(p.buy_price)}</td>}
                      {show("sell_price") && (
                        <td className="px-3 py-2">
                          <p className="text-xs tabular-nums">{fmtPrice(p.sell_price)}</p>
                          {margin !== null && (
                            <p className={`text-[10px] ${margin > 30 ? "text-primary" : "text-muted-foreground"}`}>هامش {margin}%</p>
                          )}
                        </td>
                      )}
                      {show("unit") && <td className="px-3 py-2 text-xs text-muted-foreground">{p.unit}</td>}
                      {show("stock_value") && (
                        <td className="px-3 py-2 text-xs tabular-nums text-foreground">
                          ₪{(p.quantity * (p.buy_price || p.sell_price)).toLocaleString()}
                        </td>
                      )}
                      {show("barcode") && <td className="px-3 py-2 text-xs text-muted-foreground font-mono" dir="ltr">{(p as any).barcode || "—"}</td>}
                      {show("brand") && <td className="px-3 py-2 text-xs text-muted-foreground">{(p as any).brand || "—"}</td>}
{show("manufacturer") && <td className="px-3 py-2 text-xs text-muted-foreground">{(p as any).manufacturer || "—"}</td>}
                      {show("product_type") && <td className="px-3 py-2 text-xs text-muted-foreground">{
                        ({raw:"مادة خام",sub_assembly:"تجميعة",wip:"WIP",finished:"نهائي",service:"خدمة"} as any)[(p as any).product_type] ?? "—"
                      }</td>}
                      {show("lifecycle_status") && <td className="px-3 py-2 text-xs">{
                        (() => {
                          const ls = (p as any).lifecycle_status ?? "active";
                          const map: any = { active: ["مستمر","bg-emerald-100 text-emerald-700"], discontinued: ["متوقف","bg-rose-100 text-rose-700"], will_stop: ["سيتوقف","bg-amber-100 text-amber-700"], replaced: ["مستبدل","bg-slate-100 text-slate-700"] };
                          const [txt, cls] = map[ls] ?? [ls, "bg-slate-100"];
                          return <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls}`}>{txt}</span>;
                        })()
                      }</td>}
                      {show("flags") && <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
                        {(p as any).is_manufactured && <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-100 text-indigo-700">تصنيع</span>}
                        {(p as any).is_pos_product && <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-700">POS</span>}
                        {(p as any).has_expiry && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700">صلاحية</span>}
                        {(p as any).is_hazardous && <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-100 text-rose-700">خطر</span>}
                        {(p as any).is_serialized && <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700">سيريال</span>}
                        {(p as any).requires_batch_tracking && <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-100 text-cyan-700">Batch</span>}
                      </div></td>}
                      <td className="px-3 py-2">{statusBadge(st)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="تعديل" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="حركات المخزون" onClick={() => navigate(`/inventory-movements?product=${p.id}`)}>
                            <ClipboardList className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="طباعة باركود" onClick={() => setBarcodePrintProduct(p)}>
                            <Barcode className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="حذف" onClick={() => handleDelete(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 border-t border-border font-bold text-sm">
                  <td colSpan={visibleColCount} className="px-3 py-2.5 text-right text-foreground">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span>المجموع: {filtered.length} صنف</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        إجمالي الكميات: <span className="text-foreground font-semibold tabular-nums">{filtered.reduce((s, p) => s + p.quantity, 0).toLocaleString()}</span>
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        قيمة البيع: <span className="text-foreground font-semibold tabular-nums">₪{filtered.reduce((s, p) => s + p.sell_price * p.quantity, 0).toLocaleString()}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > perPage && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  عرض {Math.min((page - 1) * perPage + 1, sorted.length)}–{Math.min(page * perPage, sorted.length)} من {sorted.length}
                </p>
                <Select value={String(perPage)} onValueChange={v => { setPerPage(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, page - 3), Math.min(totalPages, page + 2)
                ).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                صفحة {page} من {totalPages}
              </p>
            </div>
          )}
        </div>
      )}
    </div>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={(o) => { setShowProductDialog(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editMode ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
            <DialogDescription>{editMode ? "عدّل بيانات المنتج" : "أدخل بيانات المنتج الجديد"}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="basic" className="mt-2" dir="rtl">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="basic">الأساسية</TabsTrigger>
              <TabsTrigger value="pricing">الأسعار والمخزون</TabsTrigger>
              <TabsTrigger value="warranty">الكفالة</TabsTrigger>
              <TabsTrigger value="advanced">إعدادات متقدمة</TabsTrigger>
            </TabsList>

            {/* ============ TAB 1: Basic ============ */}
            <TabsContent value="basic" className="space-y-4 mt-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم المنتج *</label>
              <Input placeholder="مثال: قميص أبيض" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">التصنيف</label>
                {showCustomCategory ? (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-2 space-y-2">
                    <Input placeholder="اسم التصنيف الجديد" value={customCategoryInput} onChange={e => setCustomCategoryInput(e.target.value)} className="rounded-lg" autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && customCategoryInput.trim()) {
                        const cat = customCategoryInput.trim();
                        setForm(p => ({ ...p, category: cat, skuPrefix: getCategoryPrefix(cat) }));
                        setShowCustomCategory(false); setCustomCategoryInput("");
                      } }}
                    />
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="rounded-lg flex-1 h-7 text-xs" disabled={!customCategoryInput.trim()} onClick={() => {
                        const cat = customCategoryInput.trim();
                        setForm(p => ({ ...p, category: cat, skuPrefix: getCategoryPrefix(cat) }));
                        setShowCustomCategory(false); setCustomCategoryInput("");
                      }}>حفظ</Button>
                      <Button type="button" size="sm" variant="ghost" className="rounded-lg h-7 text-xs" onClick={() => { setShowCustomCategory(false); setCustomCategoryInput(""); }}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <Select value={form.category} onValueChange={v => {
                    if (v === "__custom__") { setShowCustomCategory(true); return; }
                    setForm(p => ({ ...p, category: v, skuPrefix: getCategoryPrefix(v) }));
                  }}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1">
                        <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> إضافة تصنيف جديد</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الوحدة</label>
                {showCustomUnit ? (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-2 space-y-2">
                    <Input placeholder="اسم الوحدة الجديدة" value={customUnitInput} onChange={e => setCustomUnitInput(e.target.value)} className="rounded-lg" autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && customUnitInput.trim()) {
                        setForm(p => ({ ...p, unit: customUnitInput.trim() }));
                        setShowCustomUnit(false); setCustomUnitInput("");
                      } }}
                    />
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="rounded-lg flex-1 h-7 text-xs" disabled={!customUnitInput.trim()} onClick={() => {
                        setForm(p => ({ ...p, unit: customUnitInput.trim() }));
                        setShowCustomUnit(false); setCustomUnitInput("");
                      }}>حفظ</Button>
                      <Button type="button" size="sm" variant="ghost" className="rounded-lg h-7 text-xs" onClick={() => { setShowCustomUnit(false); setCustomUnitInput(""); }}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <Select value={form.unit} onValueChange={v => {
                    if (v === "__custom__") { setShowCustomUnit(true); return; }
                    setForm(p => ({ ...p, unit: v }));
                  }}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1">
                        <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> إضافة وحدة جديدة</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* SKU + Barcode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">كود المنتج (SKU) - تلقائي</label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="العائلة"
                    value={form.skuPrefix}
                    onChange={e => setForm(p => ({ ...p, skuPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 5) }))}
                    className="rounded-xl w-16 text-center font-mono text-xs" dir="ltr" maxLength={5}
                  />
                  <div className="flex-1 h-9 rounded-xl bg-muted/50 border border-border/50 flex items-center px-2 text-xs text-muted-foreground font-mono" dir="ltr">
                    {editMode && selectedProduct?.sku ? selectedProduct.sku : generateSKU(form.skuPrefix)}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الباركود</label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="أدخل الباركود"
                    value={form.barcode}
                    onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))}
                    className="rounded-xl flex-1 font-mono text-xs" dir="ltr"
                  />
                  <Button type="button" size="sm" variant="outline" className="rounded-xl px-2.5 shrink-0" onClick={startBarcodeScanner} title="مسح بالكاميرا">
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                {showBarcodeScanner && (
                  <div className="mt-2 relative rounded-xl overflow-hidden border border-border">
                    <video ref={barcodeVideoRef} className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <ScanLine className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                    <Button type="button" size="sm" variant="destructive" className="absolute top-1 left-1 h-6 w-6 p-0 rounded-full" onClick={stopBarcodeScanner}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2">غيّر العائلة (مثل GEN, RAW, PKG) للتحكم بأنواع المخزون</p>

            {/* Product Type + checkboxes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">نوع الصنف</label>
                <Select value={form.product_type} onValueChange={v => setForm(p => ({ ...p, product_type: v, service_direction: v === "product" ? "" : p.service_direction }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">منتج (له مخزون)</SelectItem>
                    <SelectItem value="service">خدمة (بدون مخزون)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.product_type === "service" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">اتجاه الخدمة</label>
                  <Select value={form.service_direction} onValueChange={v => setForm(p => ({ ...p, service_direction: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختياري" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provided">خدمة مقدمة (نبيعها)</SelectItem>
                      <SelectItem value="received">خدمة متلقاة (نشتريها)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4 py-2 border-y border-border/50">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={form.is_sold} onCheckedChange={v => setForm(p => ({ ...p, is_sold: !!v }))} />
                يُباع
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={form.is_purchased} onCheckedChange={v => setForm(p => ({ ...p, is_purchased: !!v }))} />
                يُشترى
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={form.is_pos_product} onCheckedChange={v => setForm(p => ({ ...p, is_pos_product: !!v }))} />
                منتج نقاط البيع
              </label>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">وصف المنتج</label>
              <Textarea placeholder="وصف تفصيلي للمنتج أو الخدمة..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl min-h-[60px] resize-none" rows={2} />
            </div>
            </TabsContent>

            {/* ============ TAB 2: Pricing & Stock ============ */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">سعر الشراء (₪)</label>
                <Input type="number" placeholder="0" value={form.buy_price} onChange={e => setForm(p => ({ ...p, buy_price: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">سعر البيع (₪)</label>
                <Input type="number" placeholder="0" value={form.sell_price} onChange={e => setForm(p => ({ ...p, sell_price: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الكمية الحالية</label>
                <Input type="number" placeholder="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الحد الأدنى (للتنبيه)</label>
                <Input type="number" placeholder="0" value={form.min_quantity} onChange={e => setForm(p => ({ ...p, min_quantity: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
            </div>

            {/* Tax Rate */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نسبة الضريبة %</label>
              <div className="flex gap-2">
                <Select value={form.tax_rate} onValueChange={v => setForm(p => ({ ...p, tax_rate: v, custom_tax_rate: v === "أخرى" ? p.custom_tax_rate : "" }))}>
                  <SelectTrigger className="rounded-xl flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_OPTIONS.map(t => <SelectItem key={t} value={t}>{t === "أخرى" ? "أخرى (يدوي)" : `${t}%`}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.tax_rate === "أخرى" && (
                  <Input type="number" placeholder="%" value={form.custom_tax_rate} onChange={e => setForm(p => ({ ...p, custom_tax_rate: e.target.value }))} className="rounded-xl w-24" dir="ltr" min="0" max="100" step="0.5" />
                )}
              </div>
            </div>
            </TabsContent>

            {/* ============ TAB 3: Warranty ============ */}
            <TabsContent value="warranty" className="space-y-4 mt-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                <div>
                  <p className="text-sm font-semibold">المنتج عليه كفالة</p>
                  <p className="text-[11px] text-muted-foreground">يتم عرض معلومات الكفالة في الفاتورة عند البيع</p>
                </div>
                <Checkbox checked={form.has_warranty} onCheckedChange={v => setForm(p => ({ ...p, has_warranty: !!v }))} />
              </div>

              {form.has_warranty && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">مدة الكفالة</label>
                      <Input type="number" min="0" placeholder="مثال: 12" value={form.warranty_duration} onChange={e => setForm(p => ({ ...p, warranty_duration: e.target.value }))} className="rounded-xl" dir="ltr" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">الوحدة</label>
                      <Select value={form.warranty_unit} onValueChange={v => setForm(p => ({ ...p, warranty_unit: v }))}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">أيام</SelectItem>
                          <SelectItem value="months">أشهر</SelectItem>
                          <SelectItem value="years">سنوات</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">نوع الكفالة</label>
                    <Select value={form.warranty_type || "none"} onValueChange={v => setForm(p => ({ ...p, warranty_type: v === "none" ? "" : v }))}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر نوع الكفالة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— غير محدد —</SelectItem>
                        <SelectItem value="company">كفالة الشركة المصنعة</SelectItem>
                        <SelectItem value="supplier">كفالة المورد</SelectItem>
                        <SelectItem value="store">كفالة المحل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">ملاحظات الكفالة</label>
                    <Textarea placeholder="شروط الكفالة، الاستثناءات، طريقة المطالبة..." value={form.warranty_notes} onChange={e => setForm(p => ({ ...p, warranty_notes: e.target.value }))} className="rounded-xl min-h-[70px] resize-none" rows={3} />
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-xl p-2.5">
                    سيتم عرض معلومات الكفالة (المدة + النوع) تلقائياً في الفاتورة عند بيع هذا المنتج، ويمكنك إنشاء بطاقة كفالة لاحقاً من موديول إدارة الكفالات.
                  </div>
                </>
              )}

              {!form.has_warranty && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">المنتج بدون كفالة</p>
                  <p className="text-xs mt-1">فعّل الخيار أعلاه لإضافة معلومات الكفالة</p>
                </div>
              )}
            </TabsContent>

            {/* ============ TAB 4: Advanced ============ */}
            <TabsContent value="advanced" className="space-y-4 mt-4">
            <p className="text-[11px] text-muted-foreground">هذه إعدادات محاسبية متقدمة، القيم الافتراضية تعمل لمعظم الحالات.</p>

            {/* Sales Account */}
            {form.is_sold && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">حساب المبيعات</label>
                <Select value={form.sales_account_code} onValueChange={v => setForm(p => ({ ...p, sales_account_code: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر حساب الإيرادات" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {accounts.filter(a => a.account_type === "إيرادات").map(a => (
                      <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Purchase Account */}
            {form.is_purchased && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">حساب المشتريات</label>
                <Select value={form.purchase_account_code} onValueChange={v => setForm(p => ({ ...p, purchase_account_code: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر حساب المصاريف" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {accounts.filter(a => a.account_type === "مصاريف" || a.account_type === "أصول").map(a => (
                      <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Input placeholder="اختياري" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-xl" />
            </div>

            {/* Terms */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الشروط والأحكام</label>
              <Textarea placeholder="اختياري..." value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} className="rounded-xl min-h-[50px] resize-none" rows={2} />
            </div>

            {kitchenStations.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                  <ChefHat className="h-3.5 w-3.5" />
                  محطة المطبخ (للطباعة التلقائية)
                </label>
                <Select value={form.kitchen_station_id || "none"} onValueChange={v => setForm(p => ({ ...p, kitchen_station_id: v === "none" ? "" : v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="بدون محطة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون محطة</SelectItem>
                    {kitchenStations.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border">
            <div>
              {editMode && selectedProduct && (
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl gap-2"
                  disabled={saving}
                  onClick={() => { handleDelete(selectedProduct); setShowProductDialog(false); }}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف المنتج
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setShowProductDialog(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2 shadow-md shadow-primary/20">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editMode ? "حفظ التعديلات" : "إضافة المنتج"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Movements Dialog */}
      <Dialog open={showMovementsDialog} onOpenChange={setShowMovementsDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>حركات المخزون</DialogTitle>
            <DialogDescription>{selectedProduct?.name}</DialogDescription>
          </DialogHeader>
          {movementsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد حركات مسجلة بعد</p>
              {selectedProduct && selectedProduct.quantity > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  الكمية الحالية ({selectedProduct.quantity}) تم إدخالها يدوياً عند إنشاء/تعديل المنتج ولم تُسجل كحركة مخزون
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {movements.map(m => {
                const config = movementTypeLabel[m.movement_type] || { label: m.movement_type, color: "text-muted-foreground", icon: History };
                const Icon = config.icon;
                const isOutgoing = ['بيع POS', 'صادر'].includes(m.movement_type);
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <div>
                        <p className={`text-sm font-semibold ${config.color}`}>
                          {config.label}: {isOutgoing ? '-' : '+'}{m.quantity}
                        </p>
                        {m.reference_note && <p className="text-[10px] text-muted-foreground">{m.reference_note}</p>}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleDateString("en-GB")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Barcode Print Dialog */}
      <BarcodePrintDialog
        open={!!barcodePrintProduct}
        onOpenChange={(o) => !o && setBarcodePrintProduct(null)}
        product={barcodePrintProduct}
      />
    </FinanceShell>
    </>
  );
};

export default InventoryPage;
