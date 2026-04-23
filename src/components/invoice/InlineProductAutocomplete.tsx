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

  const filteredProducts = React.useMemo(() => {
    const query = debouncedQuery.toLowerCase();
    const base = query
      ? products.filter((product) => {
          const haystack = [product.name, product.barcode, product.unit]
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
    headerOptionCount: onQuickAdd ? 1 : 0,
    onHeaderSelect: onQuickAdd ? () => onQuickAdd() : undefined,
    onSelect: (product) => {
      onSelect(product.id);
    },
  });

  return (
    <div className={cn("relative", className)}>
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
        }}
        onFocus={() => dd.open()}
        onBlur={() => dd.closeDelayed()}
        onKeyDown={dd.onKeyDown}
        className={cn(
          "h-9 rounded-md border border-input bg-background pr-9 pl-3 text-[12px] shadow-sm",
          "hover:border-foreground/30 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15",
          inputClassName,
          inputProps?.className,
        )}
      />

      {open && (
        <div
          className={cn(
            "absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg",
            dropdownClassName,
          )}
        >
          {onQuickAdd && (
            <button
              type="button"
              ref={(el) => dd.registerOption(-1, el)}
              onMouseEnter={() => dd.setActive(-1)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onQuickAdd();
                dd.close();
              }}
              className={cn(
                "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-right text-[11px] font-semibold text-primary transition-colors",
                dd.activeIndex === -1 ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              تعريف صنف جديد
            </button>
          )}

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
                    {[product.barcode, product.unit].filter(Boolean).join(" • ") || "—"}
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
            <p className="py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
          )}
        </div>
      )}
    </div>
  );
}