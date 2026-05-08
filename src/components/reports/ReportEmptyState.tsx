import { FileBarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * P4 — Standardized empty state for report tables.
 * RTL-aware. Use when a report query returns zero rows after filtering.
 */
interface Props {
  title?: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}

export default function ReportEmptyState({
  title = "لا توجد بيانات لعرضها",
  hint = "جرّب تعديل الفترة أو الفلاتر",
  icon,
  className,
}: Props) {
  return (
    <div
      dir="rtl"
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6",
        className,
      )}
    >
      <div className="mb-3 text-muted-foreground/40">
        {icon ?? <FileBarChart2 className="h-12 w-12" />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}