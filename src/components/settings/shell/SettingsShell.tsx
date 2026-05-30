import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsActionPane, type SettingsActionGroup } from "./SettingsActionPane";

/**
 * D365-style Settings page shell — mirrors FinanceShell visual language.
 * RTL-first. Header + breadcrumb + ActionPane + body. The sidebar lives
 * inside the body so each consumer (SettingsPage) controls its layout.
 */
export interface SettingsShellProps {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actionGroups?: SettingsActionGroup[];
  rightSlot?: ReactNode;
  children: ReactNode;
}

export function SettingsShell({
  title,
  subtitle,
  breadcrumb,
  actionGroups = [],
  rightSlot,
  children,
}: SettingsShellProps) {
  return (
    <div className="flex h-full bg-background flex-col min-h-0" dir="rtl">
      {/* Header */}
      <div className="px-5 pt-3 pb-2 border-b border-border bg-card">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1.5">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link to={b.href} className="hover:text-foreground">{b.label}</Link>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumb.length - 1 && <ChevronLeft className="h-3 w-3 rotate-180" />}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {rightSlot && <div className="flex items-center gap-1.5">{rightSlot}</div>}
        </div>
      </div>

      {/* Action Pane (single-row ribbon, no tabs — settings is a single context) */}
      {actionGroups.length > 0 && <SettingsActionPane groups={actionGroups} />}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
