import * as React from "react";
import { Plus, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSearchableDropdown } from "@/hooks/useSearchableDropdown";
import { cn } from "@/lib/utils";

type ProductOption = {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  buy_price?: number | null;
  sell_price?: number | null;
  quantity?: number | null;
  unit?: string | null;
};

interface InlineProductAutocompleteProps {
  value: string;
  products: ProductOption[];
  invoiceType: "sales" | "purchase";
  currencySymbol: string;
  onChange: (value: string) => void;
  onSelect: (productId: string) => void;
  onQuickAdd?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onFocus" | "onBlur" | "onKeyDown"> & Record<string, any>;
}

export default function InlineProductAutocomplete({
  value,
  products,
  invoiceType,
  currencySymbol,
  onChange,
  onSelect,
  onQuickAdd,
  placeholder = "ابحث عن صنف...",
  className,
  inputClassName,
  dropdownClassName,
  disabled,
  inputProps,
}: InlineProductAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const debouncedQuery = useDebouncedValue(value.trim(), 150);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [popover, setPopover] = React.useState<{
    top: number;
    left: number;
    width: number;
    flipUp: boolean;
    maxH: number;
  } | null>(null);

  // Position the dropdown using fixed coordinates so it escapes table/overflow parents.
  // Flips upward when near the viewport bottom so users never need to scroll the page.
  const recomputePosition = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const desired = 280;
    const flipUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxH = Math.min(desired, Math.max(160, (flipUp ? spaceAbove : spaceBelow) - 16));
    setPopover({
      top: flipUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      flipUp,
      maxH,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    recomputePosition();
    const onScroll = () => recomputePosition();
    const onResize = () => recomputePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, recomputePosition]);

  const filteredProducts = React.useMemo(() => {
    const query = debouncedQuery.toLowerCase();
    const base = query
      ? products.filter((product) => {
          const haystack = [product.name, product.barcode, product.sku, product.unit]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        })
      : products;

    return base.slice(0, 40);
  }, [debouncedQuery, products]);

  const dd = useSearchableDropdown<ProductOption>({
    items: filteredProducts,
    isOpen: open,
    setOpen,
    advanceFocus: true,
    // "Add new product" is rendered as a footer button below the results.
    // It is intentionally NOT navigable via the keyboard list, so Enter always
    // selects an existing matching product (the first result by default).
    headerOptionCount: 0,
    autoHighlightFirstItem: true,
    onSelect: (product) => {
      onSelect(product.id);
    },
  });

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Search className="absolute right-3 top-[18px] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        ref={dd.inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        data-no-enter-nav="true"
        {...inputProps}
        onChange={(e) => {
          onChange(e.target.value);
          dd.open();
          dd.reset();
          // Reposition after content (and therefore container size) changes.
          requestAnimationFrame(recomputePosition);
        }}
        onFocus={() => {
          dd.open();
          requestAnimationFrame(recomputePosition);
        }}
        onBlur={() => dd.closeDelayed()}
        onKeyDown={dd.onKeyDown}
        className={cn(
          "h-9 rounded-md border border-input bg-background pr-9 pl-3 text-[12px] shadow-sm",
          "hover:border-foreground/30 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15",
          inputClassName,
          inputProps?.className,
        )}
      />

      {open && popover && (
        <div
          style={{
            position: "fixed",
            top: popover.flipUp ? undefined : popover.top,
            bottom: popover.flipUp ? window.innerHeight - popover.top : undefined,
            left: popover.left,
            width: popover.width,
            maxHeight: popover.maxH,
            zIndex: 60,
          }}
          className={cn(
            "overflow-y-auto rounded-md border border-border bg-popover shadow-xl",
            dropdownClassName,
          )}
        >
          {filteredProducts.map((product, index) => {
            const active = dd.activeIndex === index;
            const price = invoiceType === "sales" ? Number(product.sell_price || 0) : Number(product.buy_price || 0);

            return (
              <button
                key={product.id}
                type="button"
                ref={(el) => dd.registerOption(index, el)}
                onMouseEnter={() => dd.setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => dd.selectAt(index)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-right transition-colors",
                  active ? "bg-muted" : "hover:bg-muted",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-foreground">{product.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {(() => {
                      const code = product.sku || product.barcode;
                      const parts: string[] = [];
                      if (code) parts.push(`كود: ${code}`);
                      if (product.unit) parts.push(String(product.unit));
                      return parts.length ? parts.join(" • ") : "—";
                    })()}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-[10.5px] font-semibold tabular-nums text-foreground">
                    {currencySymbol}
                    {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[9.5px] text-muted-foreground tabular-nums">
                    {Number(product.quantity || 0).toLocaleString("en-US")} {product.unit || "قطعة"}
                  </p>
                </div>
              </button>
            );
          })}

          {filteredProducts.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة</p>
          )}

          {onQuickAdd && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onQuickAdd();
                dd.close();
              }}
              className={cn(
                "flex w-full items-center gap-2 border-t border-border px-3 py-2 text-right text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10",
                filteredProducts.length === 0 && "bg-primary/5",
              )}
              title="إضافة صنف غير موجود — يحتاج نقرة صريحة، Enter يختار صنفاً موجوداً"
            >
              <Plus className="h-3.5 w-3.5" />
              تعريف صنف جديد
              <span className="ms-auto text-[9px] font-normal text-muted-foreground">
                (نقرة فقط)
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}