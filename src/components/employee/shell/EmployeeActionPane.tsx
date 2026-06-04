import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmployeeActionItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  tooltip?: string;
}

/**
 * Horizontal, mobile-friendly Action Pane for the employee portal.
 * Mirrors the visual language of finance/shell/ActionPane but in a
 * single scrollable row suitable for narrow viewports.
 */
export function EmployeeActionPane({ items }: { items: EmployeeActionItem[] }) {
  const variantClass = (v?: EmployeeActionItem["variant"]) => {
    switch (v) {
      case "primary":
        return "text-primary hover:bg-primary/10";
      case "danger":
        return "text-destructive hover:bg-destructive/10";
      case "ghost":
        return "text-muted-foreground hover:bg-muted";
      default:
        return "text-foreground hover:bg-muted";
    }
  };

  if (!items.length) return null;

  return (
    <div className="border-b border-border bg-card" dir="rtl">
      <div className="flex items-start gap-1 px-3 py-2 overflow-x-auto">
        {items.map((it) => (
          <div key={it.key} className="flex flex-col items-stretch min-w-[72px]">
            <Button
              variant="ghost"
              size="sm"
              disabled={it.disabled}
              onClick={it.onClick}
              title={it.tooltip || it.label}
              className={cn(
                "h-9 gap-1.5 text-[12.5px] font-normal whitespace-nowrap shrink-0 justify-center",
                variantClass(it.variant)
              )}
              data-testid={`employee-action-${it.key}`}
            >
              {it.icon && <it.icon className="h-4 w-4" />}
              <span>{it.label}</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
