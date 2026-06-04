import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { EmployeeActionPane, type EmployeeActionItem } from "./EmployeeActionPane";

/**
 * Mobile-first D365-inspired shell for the employee portal.
 *
 * Visual-only wrapper — does NOT replace any existing tab UI.
 * It just adds a compact Header (breadcrumb + title + subtitle) and
 * an optional horizontal Action Pane above the tab content.
 *
 * Safe to use anywhere inside EmployeeApp. The wrapped child keeps
 * 100% of its handlers, state, and behavior.
 */
export interface EmployeeShellProps {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; onClick?: () => void }[];
  actionPane?: EmployeeActionItem[];
  rightSlot?: ReactNode;
  children: ReactNode;
}

export function EmployeeShell({
  title,
  subtitle,
  breadcrumb,
  actionPane,
  rightSlot,
  children,
}: EmployeeShellProps) {
  return (
    <div
      className="min-h-[100dvh] bg-background"
      dir="rtl"
      style={{ fontFamily: "Tajawal, sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border bg-card">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-[11.5px] text-muted-foreground mb-1">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.onClick ? (
                  <button
                    type="button"
                    onClick={b.onClick}
                    className="hover:text-foreground"
                  >
                    {b.label}
                  </button>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumb.length - 1 && (
                  <ChevronLeft className="h-3 w-3 rotate-180" />
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {rightSlot && <div className="flex items-center gap-1.5">{rightSlot}</div>}
        </div>
      </div>

      {/* Action Pane */}
      {actionPane && actionPane.length > 0 && (
        <EmployeeActionPane items={actionPane} />
      )}

      {/* Body — children render exactly as before. */}
      <div>{children}</div>
    </div>
  );
}
