import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import {
  Loader2, Plus, Package, Search, AlertTriangle, TrendingUp, TrendingDown,
  Pencil, Trash2, History, X, ArrowUpDown, ChevronLeft, ChevronRight,
  ClipboardList, ChefHat, Camera, ScanLine, Barcode, RefreshCw, Download,
  Printer, Upload, FolderPlus, ClipboardCheck, Boxes, MoreVertical, Filter,
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";
import {
  FinanceShell, ColumnVisibilityMenu, useColumnVisibility, applyFilters,
} from "@/components/finance/shell";
import type { ActionTab, ColumnDef, FilterField, FilterCondition } from "@/components/finance/shell";
import EmptyState from "@/components/EmptyState";

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

type SortKey = "name" | "category" | "quantity" | "min_quantity" | "buy_price" | "sell_price" | "sku" | "unit";
type SortDir = "asc" | "desc";

const stockStatus = (p: Product) => {
  if (p.quantity <= 0) return "نفد";
  if (p.min_quantity > 0 && p.quantity <= p.min_quantity) return "منخفض";
  return "متوفر";
};

const fmtPrice = (n: number) => n === 0 ? "—" : `₪${n.toLocaleString()}`;

const InventoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);

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
    const { data, error } = await supabase
      .from("products").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "خطأ في تحميل المنتجات", variant: "destructive" });
    } else {
      setProducts((data || []).map((p: any) => ({ ...p, kitchen_station_id: p.kitchen_station_id || null })));
    }
    setLoading(false);
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
      .eq("user_id", user.id)
      .in("account_type", ["إيرادات", "مصاريف", "أصول"])
      .eq("is_active", true)
      .order("account_code");
    setAccounts((data as AccountOption[]) || []);
  }, [user]);

  useEffect(() => { fetchProducts(); fetchStations(); fetchAccounts(); }, [user]);

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
              toast({ title: "تم مسح الباركود ✅" });
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
      user_id: user.id, name: form.name.trim(), category: form.category as any,
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
      else toast({ title: "تم تحديث المنتج ✅" });
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) toast({ title: "خطأ في إضافة المنتج", description: error.message, variant: "destructive" });
      else toast({ title: "تم إضافة المنتج ✅" });
    }
    setSaving(false);
    setShowProductDialog(false);
    resetForm();
    fetchProducts();
  };

  const handleDelete = async (product: Product) => {
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) toast({ title: "خطأ في حذف المنتج", variant: "destructive" });
    else { toast({ title: "تم حذف المنتج 🗑️" }); fetchProducts(); }
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
    let data = [...products];
    if (filterCategory !== "all") data = data.filter(p => p.category === filterCategory);
    if (stockFilter === "متوفر") data = data.filter(p => stockStatus(p) === "متوفر");
    else if (stockFilter === "منخفض") data = data.filter(p => stockStatus(p) === "منخفض");
    else if (stockFilter === "نفد") data = data.filter(p => stockStatus(p) === "نفد");
    if (searchQuery) {
      data = data.filter(p => multiWordMatchAny(searchQuery, p.name, p.sku, p.category, p.barcode));
    }
    if (dateFrom) data = data.filter(p => (p.created_at?.split("T")[0] || "") >= dateFrom);
    if (dateTo) data = data.filter(p => (p.created_at?.split("T")[0] || "") <= dateTo);
    return data;
  }, [products, filterCategory, stockFilter, searchQuery, dateFrom, dateTo]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paged = sorted.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [searchQuery, filterCategory, stockFilter]);

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
  const totalValue = products.reduce((s, p) => s + p.quantity * (p.buy_price || p.sell_price), 0);
  const lowStock = products.filter(p => stockStatus(p) === "منخفض").length;
  const outStock = products.filter(p => stockStatus(p) === "نفد").length;

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

  return (
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title="المخزون" breadcrumb={["إدارة المخزون", "المنتجات"]} />
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filtered.length} صنف من أصل {products.length}</p>
        <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => { resetForm(); setShowProductDialog(true); }}>
          <Plus className="h-4 w-4" /> إضافة منتج
        </Button>
      </div>

      {/* KPI Cards */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الأصناف", value: products.length, icon: Package, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
            { label: "قيمة المخزون", value: `₪${totalValue.toLocaleString()}`, icon: Package, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
            { label: "مخزون منخفض", value: lowStock, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800" },
            { label: "نفد المخزون", value: outStock, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/5 border-destructive/10" },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {products.length > 0 && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="ابحث باسم الصنف أو الكود..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-10 rounded-xl bg-muted/30"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category pills + stock filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              <button onClick={() => setFilterCategory("all")} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterCategory === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                الكل
              </button>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterCategory === cat ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  {cat}
                </button>
              ))}
            </div>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-[140px] rounded-xl text-xs">
                <SelectValue placeholder="حالة المخزون" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="متوفر">✅ متوفر</SelectItem>
                <SelectItem value="منخفض">⚠️ منخفض</SelectItem>
                <SelectItem value="نفد">🔴 نفد</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => { setDateFrom(""); setDateTo(""); }}
              compact
            />
          </div>

          {selected.size > 0 && (
            <div className="text-xs text-primary font-semibold">{selected.size} صنف محدد</div>
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
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Package className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد منتجات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف أول منتج لبدء تتبع المخزون</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => { resetForm(); setShowProductDialog(true); }}>
            <Plus className="h-4 w-4" /> إضافة منتج
          </Button>
        </div>
      )}

      {/* No results */}
      {!loading && products.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد أصناف تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterCategory("all"); setStockFilter("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              {/* Header */}
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-primary-foreground/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الكود" field="sku" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="اسم الصنف" field="name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الفئة" field="category" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الكمية" field="quantity" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحد الأدنى" field="min_quantity" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="سعر الشراء" field="buy_price" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="سعر البيع" field="sell_price" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الوحدة" field="unit" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">الحالة</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => {
                  const st = stockStatus(p);
                  const isSelected = selected.has(p.id);
                  const margin = p.buy_price > 0 && p.sell_price > 0
                    ? Math.round(((p.sell_price - p.buy_price) / p.sell_price) * 100) : null;
                  const stStyles = {
                    "متوفر": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    "منخفض": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                    "نفد": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  }[st];
                  const dotColor = {
                    "متوفر": "bg-green-500",
                    "منخفض": "bg-yellow-500",
                    "نفد": "bg-red-500",
                  }[st];
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-border/50 transition-colors ${
                        isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                      } hover:bg-primary/5`}
                    >
                      <td className="px-3 py-3">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(p.id)} />
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground font-mono" dir="ltr">{p.sku || "—"}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => openMovements(p)} className="text-sm font-semibold text-foreground hover:text-primary hover:underline transition-colors text-right">
                          {p.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{p.category}</td>
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">{p.quantity.toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">{p.min_quantity}</td>
                      <td className="px-3 py-3 text-xs tabular-nums">{fmtPrice(p.buy_price)}</td>
                      <td className="px-3 py-3">
                        <p className="text-xs tabular-nums">{fmtPrice(p.sell_price)}</p>
                        {margin !== null && (
                          <p className={`text-[10px] ${margin > 30 ? "text-green-600" : "text-yellow-600"}`}>هامش {margin}%</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{p.unit}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${stStyles}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {st}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="تعديل">
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </button>
                          <button onClick={() => openMovements(p)} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors" title="حركات المخزون">
                            <ClipboardList className="h-3.5 w-3.5 text-accent-foreground" />
                          </button>
                          <button onClick={() => navigate(`/stock-movements?product=${p.id}`)} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors" title="تفاصيل الحركات">
                            <History className="h-3.5 w-3.5 text-accent-foreground" />
                          </button>
                          <button onClick={() => setBarcodePrintProduct(p)} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="طباعة باركود">
                            <Barcode className="h-3.5 w-3.5 text-primary" />
                          </button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="حذف">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={4} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} صنف)</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">{filtered.reduce((s, p) => s + p.quantity, 0).toLocaleString()}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, p) => s + p.sell_price * p.quantity, 0).toLocaleString()}</td>
                  <td colSpan={3} className="px-3 py-3 text-xs text-muted-foreground font-normal">قيمة البيع الإجمالية</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > perPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
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
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, page - 3), Math.min(totalPages, page + 2)
                ).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} صنف محدد` : `صفحة ${page} من ${totalPages}`}
              </p>
            </div>
          )}
        </div>
      )}

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
                    <SelectItem value="product">📦 منتج (له مخزون)</SelectItem>
                    <SelectItem value="service">🔧 خدمة (بدون مخزون)</SelectItem>
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

                  <div className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-2.5">
                    💡 سيتم عرض معلومات الكفالة (المدة + النوع) تلقائياً في الفاتورة عند بيع هذا المنتج، ويمكنك إنشاء بطاقة كفالة لاحقاً من موديول إدارة الكفالات.
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
            <p className="text-[11px] text-muted-foreground">⚙️ هذه إعدادات محاسبية متقدمة، القيم الافتراضية تعمل لمعظم الحالات.</p>

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

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl gap-2 shadow-md shadow-primary/20 mt-4">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editMode ? "حفظ التعديلات" : "إضافة المنتج"}
          </Button>
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
                <p className="text-xs text-yellow-600 mt-2">
                  ⚠️ الكمية الحالية ({selectedProduct.quantity}) تم إدخالها يدوياً عند إنشاء/تعديل المنتج ولم تُسجل كحركة مخزون
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
    </div>
  );
};

export default InventoryPage;
