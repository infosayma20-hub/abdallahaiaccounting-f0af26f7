import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Standard settings section card. Title + optional description, optional
 * top-right action slot (e.g. an "Add" button), optional collapsible body.
 */
export function SettingsSection({
  title,
  description,
  action,
  collapsible = false,
  defaultOpen = true,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden",
        className
      )}
      dir="rtl"
    >
      <header
        className={cn(
          "flex items-start justify-between gap-3 px-5 py-3 border-b border-border bg-muted/30",
          collapsible && "cursor-pointer select-none"
        )}
        onClick={() => collapsible && setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                !open && "-rotate-90"
              )}
            />
          )}
        </div>
      </header>
      {(!collapsible || open) && <div className="p-5">{children}</div>}
    </section>
  );
}

/**
 * Advanced settings accordion — collapsed by default, neutral styling.
 */
export function SettingsAdvanced({ children, title = "إعدادات متقدمة" }: { children: ReactNode; title?: string }) {
  return <SettingsSection title={title} collapsible defaultOpen={false}>{children}</SettingsSection>;
}
