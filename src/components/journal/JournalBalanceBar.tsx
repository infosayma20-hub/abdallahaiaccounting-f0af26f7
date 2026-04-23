import { CheckCircle2, AlertTriangle, Scale } from "lucide-react";

interface JournalBalanceBarProps {
  totalDebit: number;
  totalCredit: number;
  /** Sticky variant pins to bottom of viewport. Inline renders normally. */
  variant?: "sticky" | "inline";
  /** Optional CTA rendered on the right side of the bar (e.g. Save button) */
  cta?: React.ReactNode;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * High-visibility balance indicator for journal entries.
 *  - Green when balanced (debit === credit > 0)
 *  - Red when imbalanced (shows exact diff)
 *  - Muted when both totals are zero (waiting for input)
 *
 * Mirrors the "Sense of Control" bar used on the invoice screen so the
 * accountant always knows the state of the entry without scrolling.
 */
export default function JournalBalanceBar({
  totalDebit,
  totalCredit,
  variant = "inline",
  cta,
}: JournalBalanceBarProps) {
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.01 && totalDebit > 0;
  const hasInput = totalDebit > 0 || totalCredit > 0;

  const tone = isBalanced
    ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400"
    : hasInput
    ? "bg-destructive/10 border-destructive/30 text-destructive"
    : "bg-muted/40 border-border text-muted-foreground";

  const wrapperClass =
    variant === "sticky"
      ? "sticky bottom-0 z-30 -mx-1 px-1 pb-1 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      : "";

  return (
    <div className={wrapperClass} dir="rtl">
      <div
        className={`rounded-2xl border-2 ${tone} px-3 py-2.5 sm:px-4 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-4 shadow-sm`}
      >
        {/* Status badge */}
        <div className="flex items-center gap-2 shrink-0">
          {isBalanced ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : hasInput ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Scale className="h-5 w-5" />
          )}
          <span className="text-sm sm:text-base font-bold">
            {isBalanced
              ? "القيد متوازن"
              : hasInput
              ? `غير متوازن — فرق ₪${fmt(diff)}`
              : "أدخل المبالغ للتحقق من التوازن"}
          </span>
        </div>

        {/* Totals chips */}
        <div className="flex items-center gap-2 ms-auto flex-wrap text-[11px] sm:text-xs">
          <span className="px-2 py-1 rounded-lg bg-background/70 border border-border/60 font-mono tabular-nums">
            <span className="text-muted-foreground me-1">مدين:</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
              ₪{fmt(totalDebit)}
            </span>
          </span>
          <span className="px-2 py-1 rounded-lg bg-background/70 border border-border/60 font-mono tabular-nums">
            <span className="text-muted-foreground me-1">دائن:</span>
            <span className="text-rose-700 dark:text-rose-400 font-bold">
              ₪{fmt(totalCredit)}
            </span>
          </span>
        </div>

        {cta && <div className="shrink-0">{cta}</div>}
      </div>
    </div>
  );
}