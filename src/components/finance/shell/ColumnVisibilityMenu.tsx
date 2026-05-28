import { Columns3, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { UseColumnVisibilityReturn } from "./useColumnVisibility";

interface Props {
  state: UseColumnVisibilityReturn;
}

/**
 * Dropdown to toggle column visibility for a Finance table.
 * Required columns are listed but disabled (always visible).
 */
export function ColumnVisibilityMenu({ state }: Props) {
  const { columns, isVisible, toggle, showAll, hideAllOptional, hiddenCount } = state;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-[12.5px]"
          title="إظهار/إخفاء الأعمدة"
        >
          <Columns3 className="h-3.5 w-3.5" />
          الأعمدة
          {hiddenCount > 0 && (
            <span
              className={cn(
                "rounded-full text-[10px] px-1.5 bg-primary text-primary-foreground",
              )}
            >
              {hiddenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" dir="rtl">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h4 className="text-[12.5px] font-semibold">إظهار/إخفاء الأعمدة</h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={showAll}
              className="text-[10.5px] text-primary hover:underline px-1 flex items-center gap-0.5"
              title="إظهار الكل"
            >
              <Eye className="h-3 w-3" />
              الكل
            </button>
            <button
              type="button"
              onClick={hideAllOptional}
              className="text-[10.5px] text-muted-foreground hover:text-foreground px-1 flex items-center gap-0.5"
              title="إخفاء الاختياري"
            >
              <EyeOff className="h-3 w-3" />
              إخفاء
            </button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {columns.map((c) => {
            const visible = isVisible(c.key);
            return (
              <label
                key={c.key}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer hover:bg-muted",
                  c.required && "opacity-60 cursor-not-allowed",
                )}
              >
                <Checkbox
                  checked={visible}
                  disabled={c.required}
                  onCheckedChange={() => !c.required && toggle(c.key)}
                />
                <span className="flex-1">{c.label}</span>
                {c.required && (
                  <span className="text-[9px] text-muted-foreground">إلزامي</span>
                )}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}