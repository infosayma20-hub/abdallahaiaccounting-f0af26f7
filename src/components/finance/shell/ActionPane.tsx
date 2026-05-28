import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionTab, ActionItem, ActionGroup } from "./types";

interface ActionPaneProps {
  tabs: ActionTab[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * D365-style Action Pane:
 *  - One row of contextual tabs (عام / فاتورة / تحصيل / إعداد ...)
 *  - Each tab reveals a ribbon of grouped command buttons
 *  - Collapsible to gain vertical space
 */
export function ActionPane({ tabs, collapsible = true, defaultCollapsed = false }: ActionPaneProps) {
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const active = tabs.find((t) => t.key === activeKey) || tabs[0];

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

  return (
    <div className="border-b border-border bg-card" dir="rtl">
      {/* Tab row */}
      <div className="flex items-center justify-between px-3 pt-1.5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveKey(t.key);
                if (collapsed) setCollapsed(false);
              }}
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                active?.key === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {collapsible && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label={collapsed ? "إظهار الأوامر" : "إخفاء الأوامر"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Command groups */}
      {!collapsed && active && (
        <div className="flex items-start gap-1 px-3 py-2 overflow-x-auto">
          {active.groups.map((g, gi) => (
            <CommandGroup key={g.key} group={g} onClick={handleClick} variantClass={variantClass} showDivider={gi < active.groups.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommandGroup({
  group,
  onClick,
  variantClass,
  showDivider,
}: {
  group: ActionGroup;
  onClick: (i: ActionItem) => void;
  variantClass: (v?: ActionItem["variant"]) => string;
  showDivider: boolean;
}) {
  return (
    <div className="flex items-stretch">
      <div className="flex flex-col items-stretch min-w-[100px]">
        <div className="flex items-center gap-0.5">
          {group.items.map((it) => (
            <Button
              key={it.key}
              variant="ghost"
              size="sm"
              disabled={it.disabled}
              onClick={() => onClick(it)}
              title={it.tooltip || (it.shortcut ? `${it.label} (${it.shortcut})` : it.label)}
              className={cn("h-8 gap-1.5 text-[12.5px] font-normal", variantClass(it.variant))}
              data-testid={`action-${it.key}`}
            >
              {it.icon && <it.icon className="h-3.5 w-3.5" />}
              <span>{it.label}</span>
            </Button>
          ))}
        </div>
        <div className="text-[10.5px] text-muted-foreground text-center mt-0.5 select-none">
          {group.label}
        </div>
      </div>
      {showDivider && <div className="w-px bg-border mx-1 my-1" />}
    </div>
  );
}

/** Optional overflow menu for very long action lists. */
export function ActionOverflowMenu({ items }: { items: ActionItem[] }) {
  const navigate = useNavigate();
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
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