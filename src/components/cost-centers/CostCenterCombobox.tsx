import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCostCenters, costCenterTypeLabel } from "@/hooks/useCostCenters";

interface Props {
  value?: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  /** عرض الأيقونة فقط (زر مضغوط بدون نص) */
  iconOnly?: boolean;
}

/** Combobox لاختيار مركز تكلفة: بحث بالكود/الاسم، يخفي غير النشطة. */
export default function CostCenterCombobox({
  value,
  onChange,
  placeholder = "بدون مركز تكلفة",
  disabled,
  className,
  allowClear = true,
  iconOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: list = [], isLoading } = useCostCenters();

  const selected = useMemo(() => list.find((c) => c.id === value) || null, [list, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant={selected ? "default" : "outline"}
            size="icon"
            disabled={disabled}
            dir="rtl"
            title={selected ? `مركز التكلفة: ${selected.code} - ${selected.name_ar || selected.name}` : (placeholder || "إضافة مركز تكلفة")}
            aria-label={selected ? `مركز التكلفة: ${selected.name_ar || selected.name}` : "اختر مركز تكلفة"}
            className={cn("h-8 w-8 shrink-0 relative", className)}
          >
            <Tag className="h-4 w-4" />
            {selected && (
              <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
        ) : (
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          dir="rtl"
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex items-center gap-1.5 truncate text-xs">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {selected ? (
              <>
                <span className="font-mono text-[10px] bg-muted px-1 rounded">{selected.code}</span>
                <span className="truncate">{selected.name_ar || selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 z-[100]" align="start" dir="rtl">
        <Command dir="rtl">
          <CommandInput placeholder="بحث بالكود أو الاسم..." className="text-xs" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">
                {isLoading ? "جاري التحميل..." : "لا توجد مراكز تكلفة"}
              </span>
            </CommandEmpty>
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground gap-2"
                >
                  بدون مركز تكلفة
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {list.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.code} ${c.name} ${c.name_ar || ""}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="text-xs gap-2"
                >
                  <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {c.code}
                  </span>
                  <span className="flex-1 truncate">{c.name_ar || c.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {costCenterTypeLabel(c.center_type)}
                  </span>
                  {c.id === value && <Check className="h-3.5 w-3.5 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}