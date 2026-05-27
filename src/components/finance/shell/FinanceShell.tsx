import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Filter as FilterIcon, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActionPane } from "./ActionPane";
import { FiltersPanel } from "./FiltersPanel";
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
              <h1 className="text-[20px] font-bold text-foreground truncate flex items-center gap-2">
                {title}
                {myViews.activeView && (
                  <span className="text-[12px] font-normal text-muted-foreground flex items-center gap-1">
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {myViews.activeView.name}
                  </span>
                )}
              </h1>
              {subtitle && (
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {rightSlot}
              {filterFields.length > 0 && (
                <Button
                  size="sm"
                  variant={filtersOpen ? "default" : "outline"}
                  className="h-8 gap-1.5 text-[12.5px]"
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <FilterIcon className="h-3.5 w-3.5" />
                  الفلاتر
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

        {/* Action Pane */}
        {actionTabs.length > 0 && <ActionPane tabs={actionTabs} />}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">{children}</div>
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