import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { HRDateField } from "./HRDateField";
import { isInvalidRange } from "@/lib/hrDate";
import { cn } from "@/lib/utils";

interface Props {
  from: string;            // ISO yyyy-mm-dd
  to: string;              // ISO yyyy-mm-dd
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
  fieldClassName?: string;
}

/**
 * RTL-aware date range filter.
 * In RTL containers, "من تاريخ" naturally appears on the right
 * (as the first child) and "إلى تاريخ" on the left.
 */
export function HRDateRangeFilter({
  from, to, onFromChange, onToChange,
  fromLabel = "من تاريخ", toLabel = "إلى تاريخ",
  className, fieldClassName,
}: Props) {
  const invalid = isInvalidRange(from, to);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-end gap-2 flex-wrap">
        <HRDateField
          label={fromLabel}
          value={from}
          onChange={onFromChange}
          className={cn("w-[170px]", fieldClassName)}
        />
        <HRDateField
          label={toLabel}
          value={to}
          onChange={onToChange}
          className={cn("w-[170px]", fieldClassName)}
        />
      </div>
      {invalid && (
        <span className="text-[11px] text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          تاريخ البداية بعد تاريخ النهاية
        </span>
      )}
    </div>
  );
}

export default HRDateRangeFilter;