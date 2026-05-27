import { useState } from "react";
import { ArrowDown, ArrowUp, Filter, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ColumnHeaderMenuProps {
  label: string;
  active?: boolean;
  direction?: "asc" | "desc" | null;
  onSort?: (dir: "asc" | "desc") => void;
  onFilter?: (value: string, operator: "begins_with" | "contains" | "equals") => void;
  onClear?: () => void;
  currentFilterValue?: string;
}

/**
 * D365-style column header dropdown:
 * Sort A→Z, Sort Z→A, quick filter (begins with / contains / equals), Clear.
 */
export function ColumnHeaderMenu({
  label,
  active,
  direction,
  onSort,
  onFilter,
  onClear,
  currentFilterValue,
}: ColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentFilterValue || "");
  const [op, setOp] = useState<"begins_with" | "contains" | "equals">("begins_with");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 text-[12.5px] font-semibold text-foreground hover:text-primary group select-none w-full",
            active && "text-primary"
          )}
        >
          <span className="truncate">{label}</span>
          {direction === "asc" && <ArrowUp className="h-3 w-3" />}
          {direction === "desc" && <ArrowDown className="h-3 w-3" />}
          {currentFilterValue && <Filter className="h-3 w-3 text-primary" />}
          <MoreVertical className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity mr-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5" dir="rtl">
        <button
          className="w-full text-right text-[12.5px] px-2 py-1.5 hover:bg-muted rounded flex items-center gap-2"
          onClick={() => {
            onSort?.("asc");
            setOpen(false);
          }}
        >
          <ArrowUp className="h-3.5 w-3.5" /> ترتيب من أ إلى ي
        </button>
        <button
          className="w-full text-right text-[12.5px] px-2 py-1.5 hover:bg-muted rounded flex items-center gap-2"
          onClick={() => {
            onSort?.("desc");
            setOpen(false);
          }}
        >
          <ArrowDown className="h-3.5 w-3.5" /> ترتيب من ي إلى أ
        </button>
        {onFilter && (
          <>
            <div className="border-t border-border my-1.5" />
            <div className="px-2 pb-1 text-[11px] text-muted-foreground">{label}</div>
            <div className="px-2 pb-1.5">
              <select
                value={op}
                onChange={(e) => setOp(e.target.value as any)}
                className="w-full h-7 text-[12px] bg-background border border-border rounded px-1.5 mb-1.5"
              >
                <option value="begins_with">يبدأ بـ</option>
                <option value="contains">يحتوي</option>
                <option value="equals">يساوي</option>
              </select>
              <Input
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="أدخل القيمة..."
                className="h-7 text-[12px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onFilter(val, op);
                    setOpen(false);
                  }
                }}
              />
              <div className="flex gap-1 mt-2">
                <Button
                  size="sm"
                  className="h-7 flex-1 text-[12px]"
                  onClick={() => {
                    onFilter(val, op);
                    setOpen(false);
                  }}
                >
                  تطبيق
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[12px]"
                  onClick={() => {
                    setVal("");
                    onClear?.();
                    setOpen(false);
                  }}
                >
                  مسح
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}