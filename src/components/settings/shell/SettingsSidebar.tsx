import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface SettingsSidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
  badgeVariant?: "default" | "warning";
  disabled?: boolean;
}

interface Props {
  items: SettingsSidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

/**
 * Quiet right-aligned sidebar (RTL). One section per row, search on top,
 * subtle active highlight matching the Finance sidebar pattern.
 */
export function SettingsSidebar({ items, activeId, onSelect, search, onSearchChange }: Props) {
  return (
    <aside className="w-56 shrink-0 border-l border-border bg-card flex flex-col h-full" dir="rtl">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث في الإعدادات..."
            className="h-8 pr-8 text-[12.5px] bg-background"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav className="p-1.5 space-y-0.5">
          {items.map((s) => {
            const Icon = s.icon;
            const active = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => !s.disabled && onSelect(s.id)}
                disabled={s.disabled}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12.5px] font-medium transition-colors text-right",
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-foreground hover:bg-muted/60 border border-transparent",
                  s.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-right">{s.label}</span>
                {s.badge != null && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full leading-none",
                      s.badgeVariant === "warning"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.badge}
                  </span>
                )}
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              لا توجد نتائج
            </div>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
