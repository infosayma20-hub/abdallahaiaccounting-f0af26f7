import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  products: any[];
  onSelect: (name: string, product?: any) => void;
}

export function ProductPicker({ value, products, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal h-9 text-xs", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || "اختر المنتج أو اكتب يدوياً"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            const s = search.trim().toLowerCase();
            if (!s) return 1;
            return val.toLowerCase().includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="ابحث بالاسم أو الكود..." />
          <CommandList>
            <CommandEmpty>
              <div className="text-xs space-y-2 py-2">
                <div>لا توجد نتائج</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
                    const v = input?.value?.trim();
                    if (v) {
                      onSelect(v);
                      setOpen(false);
                    }
                  }}
                >
                  استخدام النص كمنتج جديد
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {products.map((p) => {
                const label = `${p.name}${p.sku ? " • " + p.sku : ""}`;
                return (
                  <CommandItem
                    key={p.id}
                    value={label}
                    onSelect={() => {
                      onSelect(p.name, p);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("ml-2 h-3.5 w-3.5", value === p.name ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.sku && <span className="text-[10px] text-muted-foreground">{p.sku}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}