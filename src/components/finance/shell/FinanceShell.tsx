import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Filter as FilterIcon, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActionPane } from "./ActionPane";
import { FiltersPanel } from "./FiltersPanel";
import { CompactActionRibbon } from "./CompactActionRibbon";
import { useMyViews } from "./useMyViews";
import type { FinanceShellProps } from "./types";

/**
 * Unified Finance page shell.
 *
 * Layout (RTL):
 *   ┌────────────────────────────────────────────────┬──────────────┐
 *   │ Breadcrumb + Title                             │              │
 *   │ Action Pane (tabs + ribbon)                    │   Filters    │
 *   │ ────────────────────────────────────────────── │   Panel      │
 *   │ {children}                                     │  (optional)  │
 *   └────────────────────────────────────────────────┴──────────────┘
 *
 * Use anywhere inside the AccountingLayout for D365-style consistency.
 */
export function FinanceShell({
  title,
  subtitle,
  breadcrumb,
  actionTabs = [],
  filterFields = [],
  storageKey,
  filters,
  onFiltersChange,
  rightSlot,
  children,
  compact = true,
}: FinanceShellProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const myViews = useMyViews(storageKey);

  // Sync external filter state with active view on activation
  useEffect(() => {
    if (myViews.activeView && onFiltersChange) {
      onFiltersChange(myViews.activeView.filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myViews.activeViewId]);

  const conditions = filters || [];

  return (
    <div className="flex h-full bg-background" dir="rtl">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className={cn(
            "border-b border-border bg-card",
            compact ? "px-4 pt-1 pb-1" : "px-5 pt-3 pb-2",
          )}
        >
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              className={cn(
                "flex items-center gap-1 text-muted-foreground",
                compact ? "text-[10.5px] mb-0.5" : "text-[12px] mb-1.5",
              )}
            >
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
          <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1", !compact && "items-end")}>
            <div className={cn("min-w-0 flex items-center gap-2", compact && "shrink-0")}>
              <h1
                className={cn(
                  "font-bold text-foreground truncate flex items-center gap-2",
                  compact ? "text-[15px]" : "text-[20px]",
                )}
              >
                {title}
                {myViews.activeView && (
                  <span className="text-[12px] font-normal text-muted-foreground flex items-center gap-1">
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {myViews.activeView.name}
                  </span>
                )}
              </h1>
              {subtitle && !compact && (
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            {/* In compact mode, the action ribbon lives inline with the title */}
            {compact && actionTabs.length > 0 && (
              <>
                <div className="hidden md:block h-6 w-px bg-border shrink-0 mx-1" />
                <div className="w-full order-last md:order-none md:w-auto md:flex-1 min-w-0 flex justify-start">
                  <CompactActionRibbon tabs={actionTabs} />
                </div>
              </>
            )}
            {compact && (rightSlot || filterFields.length > 0) && (
              <div className="hidden md:block h-6 w-px bg-border shrink-0 mx-1" />
            )}
            <div className="flex items-center gap-1.5 shrink-0 pr-1">
              {rightSlot}
              {filterFields.length > 0 && (
                <Button
                  size="sm"
                  variant={filtersOpen ? "default" : "outline"}
                  className="h-8 gap-1.5 text-[12.5px]"
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <FilterIcon className="h-3.5 w-3.5" />
                  {tt("الفلاتر")}
                  {conditions.length > 0 && (
                    <span
                      className={cn(
                        "rounded-full text-[10px] px-1.5",
                        filtersOpen ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
                      )}
                    >
                      {conditions.length}
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Action Pane — only in normal (non-compact) mode */}
        {!compact && actionTabs.length > 0 && <ActionPane tabs={actionTabs} />}

        {/* Body */}
        <div className={cn("flex-1 min-h-0 overflow-auto", compact ? "p-3" : "p-4")}>
          {children}
        </div>
      </div>

      {/* Filters drawer */}
      {filterFields.length > 0 && (
        <FiltersPanel
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          fields={filterFields}
          conditions={conditions}
          onChange={(c) => onFiltersChange?.(c)}
          views={myViews.views}
          activeViewId={myViews.activeViewId}
          onActivateView={(id) => {
            myViews.activateView(id);
            if (!id) onFiltersChange?.([]);
          }}
          onSaveView={(name, c) => myViews.saveView(name, c)}
          onDeleteView={(id) => {
            myViews.deleteView(id);
            onFiltersChange?.([]);
          }}
        />
      )}
    </div>
  );
}