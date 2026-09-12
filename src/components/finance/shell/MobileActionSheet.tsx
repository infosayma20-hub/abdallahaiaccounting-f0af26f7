import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionTab } from "./types";
import { useTT } from "@/i18n/dict";

/**
 * Mobile-only actions launcher for the FinanceShell header.
 *
 * It renders EXACTLY the same action items as <CompactActionRibbon /> —
 * same keys, same handlers, same disabled state — only the presentation
 * changes (bottom sheet with large touch rows instead of a cramped strip).
 * No action is added, removed or re-wired.
 */
export function MobileActionSheet({ tabs }: { tabs: ActionTab[] }) {
  const navigate = useNavigate();
  const tt = useTT();
  const [open, setOpen] = useState(false);

  const groups = tabs.flatMap((t) => t.groups);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return null;

  const handleClick = (item: ActionItem) => {
    if (item.disabled) return;
    setOpen(false);
    if (item.onClick) item.onClick();
    else if (item.href) navigate(item.href);
  };

  const variantClass = (v?: ActionItem["variant"]) => {
    switch (v) {
      case "primary":
        return "text-primary";
      case "danger":
        return "text-destructive";
      default:
        return "text-foreground";
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 text-[12.5px] px-3"
        onClick={() => setOpen(true)}
        data-testid="mobile-actions-trigger"
      >
        <Menu className="h-4 w-4" />
        {tt("إجراءات")}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[75dvh] overflow-y-auto p-0">
          <SheetHeader className="px-4 py-3 border-b border-border text-right">
            <SheetTitle className="text-[15px]">{tt("إجراءات")}</SheetTitle>
          </SheetHeader>
          <div className="p-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            {groups.map((g, gi) => (
              <div key={g.key + gi} className="py-1">
                {g.label && (
                  <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">{g.label}</div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.key}
                      disabled={it.disabled}
                      onClick={() => handleClick(it)}
                      data-testid={`action-${it.key}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-right text-[13px] min-h-[48px] disabled:opacity-40",
                        variantClass(it.variant),
                      )}
                    >
                      {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{it.label}</span>
                    </button>
                  ))}
                </div>
                {gi < groups.length - 1 && <div className="h-px bg-border/60 my-2 mx-3" />}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileActionSheet;
