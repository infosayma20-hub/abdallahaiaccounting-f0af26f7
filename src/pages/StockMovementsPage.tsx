import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, Search, TrendingUp, TrendingDown, Pencil, FileSpreadsheet, Filter, X, LayoutGrid, Table2, ArrowUpDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, ExternalLink, Warehouse as WarehouseIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";
import SmartSearchableDropdown from "@/components/forms/SmartSearchableDropdown";

import { setNextExportBranding } from "@/lib/excel-export";
interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  sku?: string | null;
  barcode?: string | null;
}

interface StockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_note: string | null;
  created_at: string;
  warehouse_id?: string | null;
}

interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
}

// Movement direction: incoming (+), outgoing (-), neutral (0)
const getMovementDirection = (type: string): "in" | "out" | "neutral" => {
  if (["وارد", "مرتجع مبيعات", "تسوية موجبة"].includes(type)) return "in";
  if (["صادر", "مرتجع مشتريات", "تسوية سالبة"].includes(type)) return "out";
  return "neutral";
};

const movementMeta: Record<string, { label: string; badgeClass: string; icon: typeof TrendingUp; iconBg: string }> = {
  "وارد": { label: "وارد", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800", icon: ArrowUp, iconBg: "bg-emerald-50 dark:bg-emerald-950/30" },
  "صادر": { label: "صادر", badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800", icon: ArrowDown, iconBg: "bg-red-50 dark:bg-red-950/30" },
  "تعديل يدوي": { label: "تسوية", badgeClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700", icon: Pencil, iconBg: "bg-slate-100 dark:bg-slate-800/30" },
  "مرتجع مبيعات": { label: "مرتجع مبيعات", badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800", icon: ArrowUp, iconBg: "bg-blue-50 dark:bg-blue-950/30" },
  "مرتجع مشتريات": { label: "مرتجع مشتريات", badgeClass: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800", icon: ArrowDown, iconBg: "bg-orange-50 dark:bg-orange-950/30" },
};

const getMeta = (type: string) => movementMeta[type] || movementMeta["تعديل يدوي"];

// Extract invoice number from reference_note (e.g. "فاتورة مبيعات INV-2026-0007")
const extractInvoiceNumber = (note: string | null): string | null => {
  if (!note) return null;
  const m = note.match(/(INV|PUR|PI|SI)-\d{4}-\d{4,}/i);
  return m ? m[0] : null;
};

const PAGE_SIZE = 20;

type SortKey = "created_at" | "product" | "type" | "quantity" | "balance";
type SortDir = "asc" | "desc";

const StockMovementsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const load = async () => {
      setLoading(true);
      const [movRes, prodRes, whRes] = await Promise.all([
        supabase.from("stock_movements").select("*").eq("user_id", dataOwnerId).order("created_at", { ascending: false }),
        supabase.from("products").select("id, name, category, unit, sku, barcode").eq("user_id", dataOwnerId),
        supabase.from("warehouses").select("id, name, code").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      ]);
      setMovements(movRes.data || []);
      setProducts(prodRes.data || []);
      setWarehouses(whRes.data || []);
      setLoading(false);
    };
    load();
  }, [user, dataOwnerId]);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return movements.filter(mv => {
      if (typeFilter !== "all" && mv.movement_type !== typeFilter) return false;
      if (productFilter !== "all" && mv.product_id !== productFilter) return false;
      if (warehouseFilter !== "all") {
        if (warehouseFilter === "__none__") {
          if (mv.warehouse_id) return false;
        } else if (mv.warehouse_id !== warehouseFilter) return false;
      }
      if (q) {
        const prod = productMap.get(mv.product_id);
        const searchable = [prod?.name || "", mv.movement_type, mv.reference_note || "", String(mv.quantity), new Date(mv.created_at).toLocaleDateString("ar-EG")].join(" ");
        if (!multiWordMatchAny(searchQuery, searchable)) return false;
      }
      return true;
    });
  }, [movements, searchQuery, typeFilter, productFilter, warehouseFilter, productMap]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "created_at": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case "product": cmp = (productMap.get(a.product_id)?.name || "").localeCompare(productMap.get(b.product_id)?.name || ""); break;
        case "type": cmp = a.movement_type.localeCompare(b.movement_type); break;
        case "quantity": cmp = a.quantity - b.quantity; break;
        case "balance": cmp = 0; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, productMap]);

  // Compute running balance per product (chronological order, then map back to displayed rows)
  const balancesById = useMemo(() => {
    const byProduct = new Map<string, StockMovement[]>();
    movements.forEach(mv => {
      const arr = byProduct.get(mv.product_id) || [];
      arr.push(mv);
      byProduct.set(mv.product_id, arr);
    });
    const map = new Map<string, number>();
    byProduct.forEach((arr) => {
      const chronological = [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let bal = 0;
      chronological.forEach(mv => {
        const dir = getMovementDirection(mv.movement_type);
        const qty = Math.abs(mv.quantity);
        if (dir === "in") bal += qty;
        else if (dir === "out") bal -= qty;
        else bal += mv.quantity; // manual adjustment keeps original sign
        map.set(mv.id, bal);
      });
    });
    return map;
  }, [movements]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchQuery, typeFilter, productFilter, warehouseFilter]);

  const warehouseMap = useMemo(() => {
    const m = new Map<string, Warehouse>();
    warehouses.forEach(w => m.set(w.id, w));
    return m;
  }, [warehouses]);

  // Filtered products for the searchable dropdown — name / sku / barcode / category
  const filteredProductOptions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const base = products;
    if (!q) return base.slice(0, 50);
    return base.filter(p => {
      const hay = [p.name, p.sku || "", p.barcode || "", p.category || ""].join(" ").toLowerCase();
      return hay.includes(q);
    }).slice(0, 50);
  }, [products, productSearch]);

  const totalIn = filtered.filter(m => getMovementDirection(m.movement_type) === "in").reduce((s, m) => s + Math.abs(m.quantity), 0);
  const totalOut = filtered.filter(m => getMovementDirection(m.movement_type) === "out").reduce((s, m) => s + Math.abs(m.quantity), 0);
  const netDelta = totalIn - totalOut;
  const netLabel = netDelta > 0 ? `زيادة ${netDelta.toLocaleString()} قطعة` : netDelta < 0 ? `نقص ${Math.abs(netDelta).toLocaleString()} قطعة` : "بدون تغيير";

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleExport = () => {
    const rows = sorted.map(mv => {
      const prod = productMap.get(mv.product_id);
      const wh = mv.warehouse_id ? warehouseMap.get(mv.warehouse_id) : null;
      return { "التاريخ": new Date(mv.created_at).toLocaleDateString("ar-EG"), "المنتج": prod?.name || "غير معروف", "النوع": mv.movement_type, "الكمية": mv.quantity, "الوحدة": prod?.unit || "", "المستودع": wh?.name || "—", "ملاحظات": mv.reference_note || "" };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "حركات المخزون");
    setNextExportBranding({ title: "حركات المخزون" });
    XLSX.writeFile(wb, `حركات_المخزون_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "تم تصدير التقرير ✅" });
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-all shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">حركات المخزون</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} حركة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/50 rounded-xl p-0.5">
            <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded-lg transition-all ${viewMode === "cards" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("table")} className={`p-1.5 rounded-lg transition-all ${viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <Table2 className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
          </Button>
        </div>
      </div>

      {/* Summary */}
      {movements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <ArrowUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 font-medium mb-0.5">إجمالي الوارد</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums leading-none">{totalIn.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 mt-1">قطعة دخلت المخزون</p>
            </div>
          </div>
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <ArrowDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-red-700/80 dark:text-red-300/80 font-medium mb-0.5">إجمالي الصادر</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums leading-none">{totalOut.toLocaleString()}</p>
              <p className="text-[10px] text-red-600/70 dark:text-red-400/60 mt-1">قطعة خرجت من المخزون</p>
            </div>
          </div>
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
            netDelta > 0 ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200/40 dark:border-emerald-800/30" :
            netDelta < 0 ? "bg-red-50/50 dark:bg-red-950/10 border-red-200/40 dark:border-red-800/30" :
            "bg-muted/40 border-border/30"
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              netDelta > 0 ? "bg-emerald-100 dark:bg-emerald-900/40" :
              netDelta < 0 ? "bg-red-100 dark:bg-red-900/40" :
              "bg-muted"
            }`}>
              {netDelta > 0 ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> :
               netDelta < 0 ? <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" /> :
               <Minus className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground font-medium mb-0.5">صافي التغيير</p>
              <p className={`text-2xl font-bold tabular-nums leading-none ${
                netDelta > 0 ? "text-emerald-700 dark:text-emerald-400" :
                netDelta < 0 ? "text-red-700 dark:text-red-400" :
                "text-foreground"
              }`}>{Math.abs(netDelta).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{netLabel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {movements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ابحث بالمنتج أو الملاحظة..." className="pr-9 rounded-xl text-sm" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] rounded-xl">
              <Filter className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="وارد">وارد</SelectItem>
              <SelectItem value="صادر">صادر</SelectItem>
              <SelectItem value="تعديل يدوي">تعديل يدوي</SelectItem>
            </SelectContent>
          </Select>
          {warehouses.length > 0 && (
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[170px] rounded-xl">
                <WarehouseIcon className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
                <SelectValue placeholder="المستودع" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-64">
                <SelectItem value="all">جميع المستودعات</SelectItem>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ""}</SelectItem>
                ))}
                <SelectItem value="__none__">بدون مستودع</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="w-[220px]">
            <SmartSearchableDropdown
              value={
                productFilter === "all"
                  ? productSearch
                  : (productMap.get(productFilter)?.name || productSearch)
              }
              onChange={(v) => {
                setProductSearch(v);
                if (productFilter !== "all") setProductFilter("all");
              }}
              items={filteredProductOptions}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              onSelect={(p) => {
                setProductFilter(p.id);
                setProductSearch(p.name);
              }}
              renderOption={(p, active) => (
                <div className={`flex flex-col items-end gap-0.5 ${active ? "bg-muted" : ""}`}>
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  {(p.sku || p.barcode || p.category) && (
                    <span className="text-[10px] text-muted-foreground">
                      {[p.sku, p.barcode, p.category].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              )}
              headerAction={
                productFilter !== "all" || productSearch
                  ? {
                      label: "إظهار جميع المنتجات",
                      onClick: () => {
                        setProductFilter("all");
                        setProductSearch("");
                      },
                    }
                  : undefined
              }
              placeholder="ابحث عن منتج (اسم/SKU/باركود)..."
              emptyText="لا توجد منتجات مطابقة"
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && movements.length === 0 && (
        <div className="text-center py-16">
          <TrendingUp className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد حركات مخزون مسجلة</p>
        </div>
      )}

      {/* No results */}
      {!loading && movements.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setProductFilter("all"); setWarehouseFilter("all"); setProductSearch(""); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE VIEW */}
      {!loading && viewMode === "table" && paginated.length > 0 && (
        <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-muted/60 hover:bg-muted/60 border-b-2 border-border">
                      <TableHead className="text-right text-xs font-bold text-foreground"><SortHeader label="التاريخ" field="created_at" /></TableHead>
                      <TableHead className="text-right text-xs font-bold text-foreground"><SortHeader label="المنتج" field="product" /></TableHead>
                      <TableHead className="text-center text-xs font-bold text-foreground"><SortHeader label="النوع" field="type" /></TableHead>
                      <TableHead className="text-center text-xs font-bold text-foreground"><SortHeader label="الكمية" field="quantity" /></TableHead>
                      <TableHead className="text-center text-xs font-bold text-foreground">الوحدة</TableHead>
                      <TableHead className="text-center text-xs font-bold text-foreground">الرصيد بعد الحركة</TableHead>
                      <TableHead className="text-right text-xs font-bold text-foreground">المرجع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((mv, idx) => {
                      const prod = productMap.get(mv.product_id);
                      const meta = getMeta(mv.movement_type);
                      const dir = getMovementDirection(mv.movement_type);
                      const Icon = meta.icon;
                      const balance = balancesById.get(mv.id) ?? 0;
                      const invNo = extractInvoiceNumber(mv.reference_note);
                      const isZebra = idx % 2 === 1;
                      return (
                        <TableRow key={mv.id} className={`${isZebra ? "bg-muted/20" : "bg-background"} hover:bg-accent/40 transition-colors border-b border-border/30`}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3">
                            {new Date(mv.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell className="font-medium text-sm text-foreground py-3">{prod?.name || "منتج محذوف"}</TableCell>
                          <TableCell className="text-center py-3">
                            <Badge variant="outline" className={`text-[11px] font-semibold gap-1 px-2 py-0.5 ${meta.badgeClass}`}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <span className={`text-base font-bold tabular-nums ${
                              dir === "in" ? "text-emerald-600 dark:text-emerald-400" :
                              dir === "out" ? "text-red-600 dark:text-red-400" :
                              "text-foreground"
                            }`}>
                              {Math.abs(mv.quantity).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground py-3">{prod?.unit || "—"}</TableCell>
                          <TableCell className="text-center py-3">
                            <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-md text-sm font-bold tabular-nums ${
                              balance < 0 ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
                              balance === 0 ? "bg-muted text-muted-foreground" :
                              "bg-muted/60 text-foreground"
                            }`}>
                              {balance.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-3 max-w-[220px]">
                            {invNo ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => navigate(`/sales`)}
                                    className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-[11px]"
                                  >
                                    {invNo}
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs">{mv.reference_note}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : mv.reference_note ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-muted-foreground truncate block cursor-help">{mv.reference_note}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs max-w-xs">{mv.reference_note}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      {/* CARD VIEW */}
      {!loading && viewMode === "cards" && paginated.length > 0 && (
        <div className="space-y-2">
          {paginated.map(mv => {
            const prod = productMap.get(mv.product_id);
            const meta = getMeta(mv.movement_type);
            const dir = getMovementDirection(mv.movement_type);
            const Icon = meta.icon;
            const balance = balancesById.get(mv.id) ?? 0;
            return (
              <Card key={mv.id} className="border border-border/40 shadow-sm rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.iconBg}`}>
                      <Icon className={`h-5 w-5 ${
                        dir === "in" ? "text-emerald-600 dark:text-emerald-400" :
                        dir === "out" ? "text-red-600 dark:text-red-400" :
                        "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground truncate">{prod?.name || "منتج محذوف"}</p>
                        <Badge variant="outline" className={`text-[10px] font-semibold gap-1 ${meta.badgeClass}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(mv.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className={`text-base font-bold tabular-nums ${
                          dir === "in" ? "text-emerald-600 dark:text-emerald-400" :
                          dir === "out" ? "text-red-600 dark:text-red-400" :
                          "text-foreground"
                        }`}>
                          {Math.abs(mv.quantity).toLocaleString()} {prod?.unit || ""}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/30">
                        <span className="text-[10px] text-muted-foreground">الرصيد بعد الحركة</span>
                        <span className={`text-xs font-bold tabular-nums ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                          {balance.toLocaleString()} {prod?.unit || ""}
                        </span>
                      </div>
                      {mv.reference_note && (
                        <p className="text-[10px] text-muted-foreground/80 mt-1 truncate">{mv.reference_note}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" className="rounded-xl gap-1" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronRight className="h-4 w-4" /> السابق
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" className="rounded-xl gap-1" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            التالي <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StockMovementsPage;
