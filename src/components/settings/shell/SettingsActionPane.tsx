import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SettingsActionItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  hidden?: boolean;
}

export interface SettingsActionGroup {
  key: string;
  label: string;
  items: SettingsActionItem[];
}

/**
 * Quiet, D365-style ribbon for the Settings page.
 * Mirrors finance/shell/ActionPane visual rules: grouped command buttons
 * with a small label underneath, dividers between groups.
 */
export function SettingsActionPane({ groups }: { groups: SettingsActionGroup[] }) {
  const navigate = useNavigate();

  const variantClass = (v?: SettingsActionItem["variant"]) => {
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

  const handle = (it: SettingsActionItem) => {
    if (it.disabled || it.loading) return;
    if (it.onClick) it.onClick();
    else if (it.href) navigate(it.href);
  };

  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) }))
    .filter((g) => g.items.length > 0);

  if (!visible.length) return null;

  return (
    <div className="border-b border-border bg-card" dir="rtl">
      <div className="flex items-start gap-1 px-3 py-2 overflow-x-auto scrollbar-thin">
        {visible.map((g, gi) => (
          <div key={g.key} className="flex items-stretch">
            <div className="flex flex-col items-stretch min-w-[88px] md:min-w-[100px]">
              <div className="flex items-center gap-0.5">
                {g.items.map((it) => (
                  <Button
                    key={it.key}
                    variant="ghost"
                    size="sm"
                    disabled={it.disabled || it.loading}
                    onClick={() => handle(it)}
                    title={it.tooltip || it.label}
                    className={cn(
                      "h-8 gap-1.5 text-[12.5px] font-normal whitespace-nowrap shrink-0",
                      variantClass(it.variant)
                    )}
                    data-testid={`settings-action-${it.key}`}
                  >
                    {it.icon && <it.icon className="h-3.5 w-3.5" />}
                    <span>{it.loading ? "..." : it.label}</span>
                  </Button>
                ))}
              </div>
              <div className="text-[10.5px] text-muted-foreground text-center mt-0.5 select-none whitespace-nowrap">
                {g.label}
              </div>
            </div>
            {gi < visible.length - 1 && <div className="w-px bg-border mx-1 my-1 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
