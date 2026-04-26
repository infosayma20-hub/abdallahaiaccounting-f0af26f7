import * as React from "react";
import { Search, X, Package, Filter } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SearchableProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  unit?: string | null;
  buy_price?: number | null;
  sell_price?: number | null;
  quantity?: number | null; // global stock fallback
  product_type?: string | null;
};

interface ProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SearchableProduct[];
  /** Map of productId -> available quantity in the currently-selected warehouse. */
  warehouseStock?: Record<string, number>;
  warehouseName?: string | null;
  invoiceType: "sales" | "purchase";
  currencySymbol: string;
  /** Map of productId -> last sale/purchase price (optional). */
  lastPrices?: Record<string, number>;
  onSelect: (productId: string) => void;
}

/**
 * Advanced product picker (مثل حساباتي):
 * - Search by name / SKU / barcode
 * - Category filter, "available only" filter
 * - Enter to pick highlighted, Double-click to pick row
 * - Shows code, barcode, name, category, unit, available qty in selected warehouse,
 *   sell price, buy price, last price.
 */
export default function ProductSearchDialog({
  open,
  onOpenChange,
  products,
  warehouseStock,
  warehouseName,
  invoiceType,
  currencySymbol,
  lastPrices,
  onSelect,
}: ProductSearchDialogProps) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("__all__");
  const [availableOnly, setAvailableOnly] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rowRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);

  // Reset state on open / focus search.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("__all__");
      setAvailableOnly(false);
      setActiveIdx(0);
      // Defer focus to next tick so dialog mounts.
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [products]);

  const stockFor = React.useCallback(
    (p: SearchableProduct) => {
      if (warehouseStock && warehouseStock[p.id] !== undefined) return Number(warehouseStock[p.id] || 0);
      return Number(p.quantity || 0);
    },
    [warehouseStock],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "__all__" && p.category !== category) return false;
      if (availableOnly && p.product_type !== "service" && stockFor(p) <= 0) return false;
      if (!q) return true;
      const hay = [p.name, p.sku, p.barcode, p.category].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, category, availableOnly, stockFor]);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query, category, availableOnly]);

  // Scroll active row into view.
  React.useEffect(() => {
    const el = rowRefs.current[activeIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (id: string) => {
    onSelect(id);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[activeIdx];
      if (p) pick(p.id);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl p-0 gap-0"
        dir="rtl"
        onKeyDown={onKeyDown}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              بحث متقدم عن صنف
              {warehouseName && (
                <Badge variant="outline" className="text-[10.5px] font-normal mr-1">
                  المستودع: {warehouseName}
                </Badge>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-border bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو SKU أو الباركود..."
                className="pr-9 h-9 text-[12.5px]"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px] h-9 text-[12px]">
                <Filter className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل التصنيفات</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-[12px] text-foreground/80 select-none cursor-pointer">
              <Checkbox
                checked={availableOnly}
                onCheckedChange={(v) => setAvailableOnly(Boolean(v))}
              />
              المتوفر فقط
            </label>
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            ↑↓ للتنقل · Enter لاختيار · Double-click للاختيار · Esc للإغلاق · {filtered.length} نتيجة
          </p>
        </div>

        {/* Table */}
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-background z-10 border-b border-border">
              <tr className="text-muted-foreground text-[10.5px] uppercase">
                <th className="text-right py-2 px-2 font-medium w-[80px]">الكود</th>
                <th className="text-right py-2 px-2 font-medium w-[110px]">الباركود</th>
                <th className="text-right py-2 px-2 font-medium">الاسم</th>
                <th className="text-right py-2 px-2 font-medium w-[100px]">التصنيف</th>
                <th className="text-center py-2 px-2 font-medium w-[60px]">الوحدة</th>
                <th className="text-center py-2 px-2 font-medium w-[80px]">المتاح</th>
                <th className="text-left py-2 px-2 font-medium w-[90px]">سعر البيع</th>
                <th className="text-left py-2 px-2 font-medium w-[90px]">سعر الشراء</th>
                <th className="text-left py-2 px-2 font-medium w-[90px]">آخر سعر</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const stock = stockFor(p);
                const isService = p.product_type === "service";
                const last = lastPrices?.[p.id];
                const active = idx === activeIdx;
                return (
                  <tr
                    key={p.id}
                    ref={(el) => (rowRefs.current[idx] = el)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => setActiveIdx(idx)}
                    onDoubleClick={() => pick(p.id)}
                    className={cn(
                      "border-b border-border/60 cursor-pointer transition-colors",
                      active ? "bg-primary/10" : "hover:bg-muted/40",
                    )}
                  >
                    <td className="py-1.5 px-2 font-mono text-[10.5px] text-muted-foreground">{p.sku || "—"}</td>
                    <td className="py-1.5 px-2 font-mono text-[10.5px] text-muted-foreground">{p.barcode || "—"}</td>
                    <td className="py-1.5 px-2 font-medium text-foreground">{p.name}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{p.category || "—"}</td>
                    <td className="py-1.5 px-2 text-center text-muted-foreground">{p.unit || "—"}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">
                      {isService ? (
                        <span className="text-[10px] text-muted-foreground">خدمة</span>
                      ) : (
                        <span
                          className={cn(
                            "font-semibold",
                            stock <= 0
                              ? "text-destructive"
                              : stock < 5
                                ? "text-amber-600"
                                : "text-emerald-600",
                          )}
                        >
                          {stock.toLocaleString("en-US")}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-left tabular-nums">
                      {currencySymbol}
                      {Number(p.sell_price || 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-1.5 px-2 text-left tabular-nums">
                      {currencySymbol}
                      {Number(p.buy_price || 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-1.5 px-2 text-left tabular-nums">
                      {last !== undefined ? (
                        <>
                          {currencySymbol}
                          {Number(last).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground text-xs">
                    لا توجد نتائج مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
          <p className="text-[10.5px] text-muted-foreground">
            {invoiceType === "sales" ? "السعر الافتراضي = سعر البيع" : "السعر الافتراضي = سعر الشراء"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={filtered.length === 0}
              onClick={() => {
                const p = filtered[activeIdx];
                if (p) pick(p.id);
              }}
            >
              اختيار
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}