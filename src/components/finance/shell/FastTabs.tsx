import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FastTabItem {
  key: string;
  title: string;
  /** Right-side summary shown collapsed (e.g. "USD • Active • 3 contacts") */
  summary?: ReactNode;
  /** Whether this section has a validation error highlight */
  hasError?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

interface FastTabsProps {
  items: FastTabItem[];
  className?: string;
}

/**
 * D365-style FastTabs:
 * Vertical stack of collapsible sections with header + right-side summary.
 * Used inside long create/edit forms (Customer, Supplier, Invoice, Voucher).
 */
export function FastTabs({ items, className }: FastTabsProps) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.key, i.defaultOpen ?? true]))
  );

  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  const expandAll = () => setOpen(Object.fromEntries(items.map((i) => [i.key, true])));
  const collapseAll = () => setOpen(Object.fromEntries(items.map((i) => [i.key, false])));

  return (
    <div className={cn("flex flex-col gap-2", className)} dir="rtl">
      <div className="flex items-center justify-end gap-3 text-[12px] text-muted-foreground">
        <button onClick={expandAll} className="hover:text-foreground">فتح الكل</button>
        <span className="opacity-40">|</span>
        <button onClick={collapseAll} className="hover:text-foreground">طي الكل</button>
      </div>
      {items.map((it) => (
        <div
          key={it.key}
          className={cn(
            "rounded-lg border bg-card overflow-hidden transition-shadow",
            it.hasError ? "border-destructive/60" : "border-border"
          )}
        >
          <button
            type="button"
            onClick={() => toggle(it.key)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  open[it.key] ? "rotate-0" : "-rotate-90"
                )}
              />
              <span className="text-[13.5px] font-semibold text-foreground">{it.title}</span>
              {it.hasError && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                  يتطلب مراجعة
                </span>
              )}
            </div>
            {!open[it.key] && it.summary && (
              <div className="text-[12px] text-muted-foreground truncate max-w-[55%]">
                {it.summary}
              </div>
            )}
          </button>
          {open[it.key] && <div className="px-4 pb-4 pt-1 border-t border-border/60">{it.children}</div>}
        </div>
      ))}
    </div>
  );
}