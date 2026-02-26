import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, Search, Package, FileSpreadsheet, AlertTriangle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

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
}

const InventoryValuationPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, category, sku, buy_price, sell_price, quantity, min_quantity, unit")
        .eq("user_id", user.id)
        .order("name");
      setProducts(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].filter(Boolean), [products]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, searchQuery, categoryFilter]);

  const totalCostValue = filtered.reduce((s, p) => s + p.quantity * p.buy_price, 0);
  const totalSellValue = filtered.reduce((s, p) => s + p.quantity * p.sell_price, 0);
  const totalItems = filtered.reduce((s, p) => s + p.quantity, 0);
  const lowStockCount = filtered.filter(p => p.quantity <= p.min_quantity && p.min_quantity > 0).length;

  const handleExport = () => {
    const rows = filtered.map(p => ({
      "اسم المنتج": p.name,
      "الكود": p.sku || "-",
      "التصنيف": p.category,
      "الوحدة": p.unit,
      "الكمية": p.quantity,
      "سعر التكلفة": p.buy_price,
      "سعر البيع": p.sell_price,
      "قيمة التكلفة": p.quantity * p.buy_price,
      "قيمة البيع": p.quantity * p.sell_price,
      "هامش الربح": p.sell_price - p.buy_price,
      "الحد الأدنى": p.min_quantity,
      "الحالة": p.quantity <= p.min_quantity && p.min_quantity > 0 ? "منخفض" : "طبيعي",
    }));

    // Add totals row
    rows.push({
      "اسم المنتج": "الإجمالي",
      "الكود": "",
      "التصنيف": "",
      "الوحدة": "",
      "الكمية": totalItems,
      "سعر التكلفة": 0,
      "سعر البيع": 0,
      "قيمة التكلفة": totalCostValue,
      "قيمة البيع": totalSellValue,
      "هامش الربح": totalSellValue - totalCostValue,
      "الحد الأدنى": 0,
      "الحالة": "",
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "جرد المخزون");
    XLSX.writeFile(wb, `جرد_المخزون_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "تم تصدير تقرير الجرد ✅" });
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-all shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">تقييم وجرد المخزون</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} منتج • {new Date().toLocaleDateString("ar-EG")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleExport} disabled={filtered.length === 0}>
          <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
        </Button>
      </div>

      {/* Summary Cards */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
            <p className="text-[10px] text-primary/70 font-medium mb-1">قيمة المخزون (تكلفة)</p>
            <p className="text-lg font-bold text-primary tabular-nums">₪{totalCostValue.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-accent border border-border/30 p-4">
            <p className="text-[10px] text-accent-foreground/70 font-medium mb-1">قيمة المخزون (بيع)</p>
            <p className="text-lg font-bold text-accent-foreground tabular-nums">₪{totalSellValue.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 border border-border/30 p-4">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">إجمالي الوحدات</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{totalItems.toLocaleString()}</p>
          </div>
          <div className={`rounded-2xl p-4 border ${lowStockCount > 0 ? "bg-destructive/5 border-destructive/10" : "bg-muted/50 border-border/30"}`}>
            <p className={`text-[10px] font-medium mb-1 ${lowStockCount > 0 ? "text-destructive/70" : "text-muted-foreground"}`}>منخفض المخزون</p>
            <p className={`text-lg font-bold tabular-nums ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{lowStockCount}</p>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      {products.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الكود..."
              className="pr-9 rounded-xl text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] rounded-xl">
              <SelectValue placeholder="التصنيف" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">جميع التصنيفات</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
      {!loading && products.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد منتجات لجرد المخزون</p>
        </div>
      )}

      {/* Table-style inventory list */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_80px_90px_90px_80px] gap-1 bg-muted/60 px-4 py-2.5 text-[10px] font-bold text-muted-foreground">
            <span>المنتج</span>
            <span className="text-center">الكمية</span>
            <span className="text-center">سعر التكلفة</span>
            <span className="text-center">القيمة</span>
            <span className="text-center">الحالة</span>
          </div>

          {/* Table Rows */}
          {filtered.map((p, i) => {
            const isLow = p.quantity <= p.min_quantity && p.min_quantity > 0;
            const value = p.quantity * p.buy_price;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_80px_90px_90px_80px] gap-1 px-4 py-3 items-center text-xs border-t border-border/30 ${i % 2 === 0 ? "" : "bg-muted/20"} ${isLow ? "bg-destructive/5" : ""}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-[9px] text-muted-foreground">{p.category} {p.sku ? `• ${p.sku}` : ""}</p>
                </div>
                <p className={`text-center font-bold tabular-nums ${isLow ? "text-destructive" : "text-foreground"}`}>
                  {p.quantity} <span className="text-[9px] font-normal text-muted-foreground">{p.unit}</span>
                </p>
                <p className="text-center tabular-nums text-muted-foreground">₪{p.buy_price.toLocaleString()}</p>
                <p className="text-center font-bold tabular-nums text-foreground">₪{value.toLocaleString()}</p>
                <div className="flex justify-center">
                  {isLow ? (
                    <Badge className="text-[8px] px-1.5 py-0 border-0 bg-destructive/10 text-destructive gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" /> منخفض
                    </Badge>
                  ) : (
                    <Badge className="text-[8px] px-1.5 py-0 border-0 bg-primary/10 text-primary">طبيعي</Badge>
                  )}
                </div>
              </div>
            );
          })}

          {/* Totals Row */}
          <div className="grid grid-cols-[1fr_80px_90px_90px_80px] gap-1 px-4 py-3 items-center text-xs border-t-2 border-border bg-muted/40 font-bold">
            <p className="text-foreground">الإجمالي ({filtered.length} منتج)</p>
            <p className="text-center tabular-nums text-foreground">{totalItems.toLocaleString()}</p>
            <p className="text-center text-muted-foreground">—</p>
            <p className="text-center tabular-nums text-primary">₪{totalCostValue.toLocaleString()}</p>
            <div />
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryValuationPage;
