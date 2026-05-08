import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, Package, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import SortableReportTable, { ColumnDef } from "@/components/reports/SortableReportTable";

import { setNextExportBranding } from "@/lib/excel-export";
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

const fmtAmt = (n: number) => `₪${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const InventoryValuationPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, category, sku, buy_price, sell_price, quantity, min_quantity, unit")
        .eq("user_id", dataOwnerId)
        .order("name");
      setProducts(data || []);
      setLoading(false);
    };
    load();
  }, [user, dataOwnerId]);

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].filter(Boolean), [products]);

  // Phase A: cost basis = avg_cost if the column exists on the row, else buy_price.
  // (products table currently has no avg_cost column — fallback wins, but logic
  // is forward-compatible if avg_cost is added later.)
  const pickCostBasis = (p: any): { cost: number; basis: "avg_cost" | "buy_price" } => {
    const avg = p?.avg_cost;
    if (avg != null && Number(avg) > 0) return { cost: Number(avg), basis: "avg_cost" };
    return { cost: Number(p?.buy_price) || 0, basis: "buy_price" };
  };
  const basisLabel = (b: string) => b === "avg_cost" ? "متوسط مرجح" : "آخر سعر شراء";

  const tableData = useMemo(() => {
    const enriched = products.map(p => {
      const { cost, basis } = pickCostBasis(p);
      return { p, cost, basis };
    });
    const totalVal = enriched.reduce((s, e) => s + Math.max(0, e.p.quantity) * e.cost, 0);
    return enriched.map(({ p, cost, basis }) => {
      const value = Math.max(0, p.quantity) * cost; // Don't multiply negative qty
      const stockStatus = p.quantity <= 0 ? "نفد" : p.quantity <= p.min_quantity ? "منخفض" : "متوفر";
      return {
        ...p,
        code: p.sku || "-",
        cost_used: cost,
        cost_basis: basisLabel(basis),
        value,
        pct: totalVal > 0 ? (value / totalVal) * 100 : 0,
        stockStatus,
        margin: p.sell_price > 0 && p.buy_price > 0 ? ((p.sell_price - p.buy_price) / p.sell_price * 100) : 0,
      };
    });
  }, [products]);

  const totalCostValue = tableData.reduce((s, p) => s + p.value, 0);
  const totalSellValue = products.reduce((s, p) => s + Math.max(0, p.quantity) * p.sell_price, 0);
  const totalItems = products.reduce((s, p) => s + p.quantity, 0);
  const lowStockCount = products.filter(p => p.quantity <= p.min_quantity && p.min_quantity > 0).length;
  const negativeCount = products.filter(p => p.quantity < 0).length;

  const columns: ColumnDef[] = [
    { key: "name", label: "الصنف", type: "text", width: "200px" },
    { key: "code", label: "الكود", type: "text", defaultHidden: true },
    { key: "category", label: "الفئة", type: "badge", filterType: "select", filterOptions: categories },
    { key: "quantity", label: "الكمية", type: "number", align: "center",
      format: (v) => (
        <span className={`font-mono text-xs font-bold ${v < 0 ? "text-destructive" : v === 0 ? "text-muted-foreground" : "text-foreground"}`}>
          {v < 0 ? `⚠️ ${v}` : v}
        </span>
      )
    },
    { key: "min_quantity", label: "الحد الأدنى", type: "number", align: "center", defaultHidden: true },
    { key: "buy_price", label: "سعر التكلفة", type: "currency" },
    { key: "cost_basis", label: "أساس التكلفة", type: "badge", filterType: "select", filterOptions: ["متوسط مرجح", "آخر سعر شراء"] },
    { key: "sell_price", label: "سعر البيع", type: "currency", defaultHidden: true },
    { key: "value", label: "القيمة الإجمالية", type: "currency",
      format: (v) => <span className="font-mono text-xs font-bold text-foreground">{fmtAmt(v)}</span>
    },
    { key: "pct", label: "النسبة %", type: "percent" },
    { key: "stockStatus", label: "حالة المخزون", type: "badge", filterType: "select",
      filterOptions: ["متوفر", "منخفض", "نفد"],
      format: (v) => {
        const cfg: Record<string, string> = {
          "متوفر": "bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400",
          "منخفض": "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400",
          "نفد": "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400",
        };
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg[v] || ""}`}>{v}</span>;
      }
    },
  ];

  const handleExport = () => {
    const rows = tableData.map(p => ({
      "اسم المنتج": p.name, "الكود": p.code, "التصنيف": p.category, "الوحدة": p.unit,
      "الكمية": p.quantity, "سعر التكلفة": p.buy_price, "سعر البيع": p.sell_price,
      "قيمة التكلفة": p.value, "النسبة %": p.pct.toFixed(1), "الحالة": p.stockStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "جرد المخزون");
    setNextExportBranding({ title: "جرد المخزون" });
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
            <p className="text-xs text-muted-foreground">{products.length} منتج • {new Date().toLocaleDateString("ar-EG")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleExport} disabled={products.length === 0}>
          <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
        </Button>
      </div>

      {/* Summary Cards */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className={`rounded-2xl p-4 border ${lowStockCount > 0 || negativeCount > 0 ? "bg-destructive/5 border-destructive/10" : "bg-muted/50 border-border/30"}`}>
            <p className={`text-[10px] font-medium mb-1 ${lowStockCount > 0 ? "text-destructive/70" : "text-muted-foreground"}`}>
              {negativeCount > 0 ? "⚠️ أرصدة سالبة" : "منخفض المخزون"}
            </p>
            <p className={`text-lg font-bold tabular-nums ${lowStockCount > 0 || negativeCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {negativeCount > 0 ? negativeCount : lowStockCount}
            </p>
          </div>
        </div>
      )}

      {/* Negative stock warning */}
      {negativeCount > 0 && (
        <div className="px-4 py-2.5 rounded-xl bg-destructive/5 border border-destructive/20 text-xs text-destructive font-medium">
          ⚠️ تحذير: {negativeCount} أصناف بكمية سالبة — يحتاج مراجعة وتعديل يدوي للمخزون
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

      {/* Sortable Table */}
      {!loading && tableData.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <SortableReportTable
            columns={columns}
            data={tableData}
            totalsRow={{
              quantity: "sum",
              value: "sum",
              pct: 100,
            }}
            loading={false}
            reportTitle="تقييم وجرد المخزون"
            storageKey="inventory-valuation"
            defaultSort={[{ key: "value", dir: "desc" }]}
            rowClassName={(row) => row.quantity < 0 ? "!bg-red-50 dark:!bg-red-950/20" : ""}
          />
        </div>
      )}
    </div>
  );
};

export default InventoryValuationPage;
