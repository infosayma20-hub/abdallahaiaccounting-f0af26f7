import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface MobileCardField {
  label: string;
  value: ReactNode;
}

export interface MobileCardData {
  key: string;
  /** Main identifier — usually the document number. */
  title: ReactNode;
  /** Optional status chip rendered next to the amount. */
  badge?: ReactNode;
  /** Right-aligned headline value (amount). */
  amount?: ReactNode;
  /** Secondary line under the title (contact, description…). */
  subtitle?: ReactNode;
  fields?: MobileCardField[];
  /** Same action buttons the table row renders — passed through untouched. */
  actions?: ReactNode;
  /** Dim + strike-through for cancelled documents. */
  cancelled?: boolean;
  onClick?: () => void;
}

/**
 * Phone-only card list used instead of the wide finance tables.
 *
 * It is a pure presentation component: pages keep their own data, permissions
 * and handlers, and simply pass the already-computed values here. Desktop
 * tables stay exactly as they are.
 */
export function MobileRecordCards({
  items,
  className,
}: {
  items: MobileCardData[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 p-2", className)} dir="rtl">
      {items.map((it) => (
        <div
          key={it.key}
          className={cn(
            "rounded-lg border border-border/60 bg-card p-3 shadow-sm",
            it.cancelled && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Button
                variant="link"
                type="button"
                onClick={it.onClick}
                disabled={!it.onClick}
                className={cn(
                  "h-auto justify-start whitespace-normal break-all text-right font-mono text-[13px] text-primary max-w-full bg-transparent border-0 p-0",
                  it.cancelled && "line-through",
                  !it.onClick && "text-foreground cursor-default",
                )}
              >
                {it.title}
              </Button>
              {it.subtitle && (
                <div className="text-[13px] font-medium text-foreground break-words mt-0.5">
                  {it.subtitle}
                </div>
              )}
            </div>
            <div className="text-left shrink-0">
              {it.amount != null && (
                <div className="text-[15px] font-bold tabular-nums">{it.amount}</div>
              )}
              {it.badge && <div className="mt-1 flex justify-end">{it.badge}</div>}
            </div>
          </div>

          {it.fields && it.fields.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/40 pt-2">
              {it.fields.map((f, i) => (
                <div key={i} className="min-w-0">
                  <div className="text-[10px] text-muted-foreground">{f.label}</div>
                  <div className="text-[12px] break-words">{f.value ?? "—"}</div>
                </div>
              ))}
            </div>
          )}

          {it.actions && (
            <div className="mt-2 flex flex-wrap items-center justify-start gap-1 border-t border-border/40 pt-2 [&_button]:min-h-11 [&_button]:min-w-11">
              {it.actions}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default MobileRecordCards;
