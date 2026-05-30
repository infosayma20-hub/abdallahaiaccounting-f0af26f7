import type { LucideIcon, ReactNode } from "react";
import { Inbox } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Formal empty state for sections that have no data yet.
 * Quiet icon, short copy, single action.
 */
export function SettingsEmptyState({ icon: Icon = Inbox, title, description, action }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-10 px-6 border border-dashed border-border rounded-lg bg-muted/20"
      dir="rtl"
    >
      <Icon className="h-8 w-8 text-muted-foreground/70 mb-3" />
      <p className="text-[13.5px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-[12px] text-muted-foreground mt-1 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
