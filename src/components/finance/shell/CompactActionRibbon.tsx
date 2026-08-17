import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionTab } from "./types";

/**
 * Compact ribbon used inside the FinanceShell compact header row.
 * - Flattens all groups from all tabs into a single inline strip
 * - Labels visible on wide screens (>= xl), auto-collapse to icons below xl
 * - Overflow menu keeps rarely-used items reachable
 */
export function CompactActionRibbon({ tabs }: { tabs: ActionTab[] }) {
  const navigate = useNavigate();
  if (!tabs.length) return null;

  const handleClick = (item: ActionItem) => {
    if (item.disabled) return;
    if (item.onClick) item.onClick();
    else if (item.href) navigate(item.href);
  };

  const variantClass = (v?: ActionItem["variant"]) => {
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

  // Flatten while preserving group separators
  const segments = tabs.flatMap((t) => t.groups);

  return (
    <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar py-0.5">
      {segments.map((g, gi) => (
        <div key={g.key + gi} className="flex items-center gap-0.5">
          {g.items.map((it) => (
            <Button
              key={it.key}
              variant="ghost"
              size="sm"
              disabled={it.disabled}
              onClick={() => handleClick(it)}
              title={it.tooltip || (it.shortcut ? `${it.label} (${it.shortcut})` : it.label)}
              className={cn(
                "h-8 md:h-7 px-2.5 md:px-2 gap-1 text-[12px] font-normal whitespace-nowrap shrink-0",
                variantClass(it.variant),
              )}
              data-testid={`action-${it.key}`}
            >
              {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
              <span className="inline md:hidden xl:inline">{it.label}</span>
            </Button>
          ))}
          {gi < segments.length - 1 && (
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

export function CompactOverflowMenu({ items }: { items: ActionItem[] }) {
  const navigate = useNavigate();
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            disabled={it.disabled}
            onClick={() => (it.onClick ? it.onClick() : it.href ? navigate(it.href) : undefined)}
          >
            {it.icon && <it.icon className="ml-2 h-4 w-4" />}
            <span>{it.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}