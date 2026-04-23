import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, Search, TrendingUp, TrendingDown, Pencil, FileSpreadsheet, Filter, X, LayoutGrid, Table2, ArrowUpDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface StockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_note: string | null;
  created_at: string;
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
  const { toast } = useToast();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [movRes, prodRes] = await Promise.all([
        supabase.from("stock_movements").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("products").select("id, name, category, unit").eq("user_id", user.id),
      ]);
      setMovements(movRes.data || []);
      setProducts(prodRes.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

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
      if (q) {
        const prod = productMap.get(mv.product_id);
        const searchable = [prod?.name || "", mv.movement_type, mv.reference_note || "", String(mv.quantity), new Date(mv.created_at).toLocaleDateString("ar-EG")].join(" ");
        if (!multiWordMatchAny(searchQuery, searchable)) return false;
      }
      return true;
    });
  }, [movements, searchQuery, typeFilter, productFilter, productMap]);

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

  useEffect(() => { setPage(1); }, [searchQuery, typeFilter, productFilter]);

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
      return { "التاريخ": new Date(mv.created_at).toLocaleDateString("ar-EG"), "المنتج": prod?.name || "غير معروف", "النوع": mv.movement_type, "الكمية": mv.quantity, "الوحدة": prod?.unit || "", "ملاحظات": mv.reference_note || "" };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
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
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3 text-center">
            <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-primary">{totalIn.toLocaleString()}</p>
            <p className="text-[10px] text-primary/70">إجمالي الوارد</p>
          </div>
          <div className="rounded-2xl bg-destructive/5 border border-destructive/10 p-3 text-center">
            <TrendingDown className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-lg font-bold text-destructive">{totalOut.toLocaleString()}</p>
            <p className="text-[10px] text-destructive/70">إجمالي الصادر</p>
          </div>
          <div className="rounded-2xl bg-muted/50 border border-border/30 p-3 text-center">
            <p className="text-lg font-bold text-foreground">{(totalIn - totalOut).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1">صافي الحركة</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {movements.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[140px] rounded-xl">
              <SelectValue placeholder="المنتج" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50 max-h-48">
              <SelectItem value="all">جميع المنتجات</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setProductFilter("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE VIEW */}
      {!loading && viewMode === "table" && paginated.length > 0 && (
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right"><SortHeader label="التاريخ" field="created_at" /></TableHead>
                  <TableHead className="text-right"><SortHeader label="المنتج" field="product" /></TableHead>
                  <TableHead className="text-right"><SortHeader label="النوع" field="type" /></TableHead>
                  <TableHead className="text-right"><SortHeader label="الكمية" field="quantity" /></TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(mv => {
                  const prod = productMap.get(mv.product_id);
                  const meta = movementMeta[mv.movement_type] || movementMeta["تعديل يدوي"];
                  return (
                    <TableRow key={mv.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(mv.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{prod?.name || "منتج محذوف"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${
                          mv.movement_type === "وارد" ? "bg-primary/10 text-primary" : mv.movement_type === "صادر" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                        }`}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-bold tabular-nums ${meta.color}`}>
                        {mv.movement_type === "صادر" ? "-" : "+"}{mv.quantity}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{prod?.unit || ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{mv.reference_note || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CARD VIEW */}
      {!loading && viewMode === "cards" && paginated.length > 0 && (
        <div className="space-y-2">
          {paginated.map(mv => {
            const prod = productMap.get(mv.product_id);
            const meta = movementMeta[mv.movement_type] || movementMeta["تعديل يدوي"];
            const Icon = meta.icon;
            return (
              <Card key={mv.id} className="border-0 shadow-sm rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      mv.movement_type === "وارد" ? "bg-primary/10" : mv.movement_type === "صادر" ? "bg-destructive/10" : "bg-warning/10"
                    }`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground truncate">{prod?.name || "منتج محذوف"}</p>
                        <Badge variant="secondary" className={`text-[10px] ${
                          mv.movement_type === "وارد" ? "bg-primary/10 text-primary" : mv.movement_type === "صادر" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                        }`}>
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(mv.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className={`text-sm font-bold tabular-nums ${meta.color}`}>
                          {mv.movement_type === "صادر" ? "-" : "+"}{mv.quantity} {prod?.unit || ""}
                        </p>
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
