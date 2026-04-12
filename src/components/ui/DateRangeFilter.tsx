import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  onClear?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Reusable date range filter (من - إلى) for list pages.
 * Uses native date inputs for simplicity and mobile compatibility.
 */
export default function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  className,
  compact = false,
}: DateRangeFilterProps) {
  const hasFilter = dateFrom || dateTo;

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <div className="flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground flex-shrink-0">من</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={cn(
            "border border-border/50 rounded-lg bg-card text-foreground text-xs outline-none focus:border-primary/50 transition-colors",
            compact ? "h-7 px-1.5" : "h-8 px-2"
          )}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground flex-shrink-0">إلى</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className={cn(
            "border border-border/50 rounded-lg bg-card text-foreground text-xs outline-none focus:border-primary/50 transition-colors",
            compact ? "h-7 px-1.5" : "h-8 px-2"
          )}
        />
      </div>
      {hasFilter && onClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-1 rounded hover:bg-destructive/10"
          title="مسح فلتر التاريخ"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
