import { CheckCircle2, AlertTriangle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * P4 — Standardized report integrity badge.
 *
 * Used across Trial Balance, Balance Sheet, Inventory Reconciliation,
 * Tax Periodic, etc. so users see a consistent at-a-glance health signal.
 */
export type ReportStatus = "balanced" | "warning" | "needs_review" | "loading";

const VARIANTS: Record<
  ReportStatus,
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  balanced: {
    label: "متوازن",
    classes: "bg-primary/10 text-primary border-primary/20",
    Icon: CheckCircle2,
  },
  warning: {
    label: "تحذير",
    classes:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900",
    Icon: AlertTriangle,
  },
  needs_review: {
    label: "بحاجة مراجعة",
    classes: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: AlertCircle,
  },
  loading: {
    label: "جارِ التحقق…",
    classes: "bg-muted text-muted-foreground border-border",
    Icon: Loader2,
  },
};

interface Props {
  status: ReportStatus;
  /** Optional override label (e.g. "متوازن ✅" or "فرق: ₪1,250"). */
  label?: string;
  /** Optional small subtext shown after the label. */
  detail?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function ReportStatusBadge({
  status,
  label,
  detail,
  size = "md",
  className,
}: Props) {
  const v = VARIANTS[status];
  const Icon = v.Icon;
  return (
    <span
      dir="rtl"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        v.classes,
        className,
      )}
    >
      <Icon
        className={cn(
          size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
          status === "loading" && "animate-spin",
        )}
      />
      <span>{label ?? v.label}</span>
      {detail && (
        <span className="opacity-70 font-normal">— {detail}</span>
      )}
    </span>
  );
}