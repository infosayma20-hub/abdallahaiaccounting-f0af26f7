/**
 * SmartSearchableDropdown — Drop-in searchable dropdown with full keyboard UX.
 * ─────────────────────────────────────────────────────────────────────────────
 * A reusable wrapper around <Input/> + custom popover list that automatically
 * provides:
 *   ↑ ↓     navigation
 *   Enter   selects highlighted option AND moves focus to next form field
 *   Tab     confirms current highlight (if any) then moves focus naturally
 *   Esc     closes the dropdown
 *   Typing  only updates the search; never selects
 *
 * Use it ANYWHERE you have a searchable list (customers, suppliers, products,
 * accounts, employees, projects, warehouses, branches, journal lines, …).
 *
 * Example:
 *   <SmartSearchableDropdown
 *     value={search}
 *     onChange={setSearch}
 *     items={filteredCustomers}
 *     getKey={c => c.id}
 *     getLabel={c => c.contact_name}
 *     onSelect={(c) => handlePickCustomer(c)}
 *     placeholder="ابحث عن زبون..."
 *     headerAction={{ label: "+ إضافة جديد", onClick: () => openCreateModal() }}
 *     renderOption={(c, active) => (
 *       <div className={active ? "bg-muted" : ""}>{c.contact_name}</div>
 *     )}
 *   />
 */
import * as React from "react";
import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSearchableDropdown } from "@/hooks/useSearchableDropdown";

export interface SmartSearchableDropdownHeaderAction {
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
}

export interface SmartSearchableDropdownProps<T> {
  /** Current search text (controlled). */
  value: string;
  /** Called as user types. */
  onChange: (v: string) => void;
  /** Filtered items to render. */
  items: T[];
  /** Stable unique key per item. */
  getKey: (item: T) => string | number;
  /** Visible label per item (used for default rendering when renderOption not provided). */
  getLabel: (item: T) => React.ReactNode;
  /** Called when an option is confirmed (Enter / click / Tab). */
  onSelect: (item: T) => void;
  /** Custom renderer for an option row. Receives `active` boolean. */
  renderOption?: (item: T, active: boolean) => React.ReactNode;
  /** Optional header row (e.g. "+ Add new"). Pressing Enter on it triggers onClick. */
  headerAction?: SmartSearchableDropdownHeaderAction;
  /** Placeholder text. */
  placeholder?: string;
  /** Empty state text (default: "لا توجد نتائج"). */
  emptyText?: React.ReactNode;
  /** Mark this as the auto-focus first field. */
  markFirst?: boolean;
  /** Show search icon on the right (RTL). Default true. */
  showSearchIcon?: boolean;
  /** Show chevron toggle button. Default true. */
  showChevron?: boolean;
  /** Disabled. */
  disabled?: boolean;
  /** Outer wrapper className. */
  className?: string;
  /** Input className. */
  inputClassName?: string;
  /** Popover container className. */
  popoverClassName?: string;
  /** Maximum dropdown height (default: max-h-56). */
  maxHeightClassName?: string;
  /** Disable auto-focus to next field after selection. */
  noAdvanceFocus?: boolean;
  /** Optional id for the input. */
  id?: string;
  /** Optional name. */
  name?: string;
}

export function SmartSearchableDropdown<T>({
  value,
  onChange,
  items,
  getKey,
  getLabel,
  onSelect,
  renderOption,
  headerAction,
  placeholder,
  emptyText = "لا توجد نتائج",
  markFirst,
  showSearchIcon = true,
  showChevron = true,
  disabled,
  className,
  inputClassName,
  popoverClassName,
  maxHeightClassName = "max-h-56",
  noAdvanceFocus,
  id,
  name,
}: SmartSearchableDropdownProps<T>) {
  const [open, setOpen] = React.useState(false);

  const dd = useSearchableDropdown<T>({
    items,
    isOpen: open,
    setOpen,
    onSelect,
    advanceFocus: !noAdvanceFocus,
    headerOptionCount: headerAction ? 1 : 0,
    onHeaderSelect: headerAction
      ? () => {
          headerAction.onClick();
        }
      : undefined,
  });

  return (
    <div className={cn("relative", className)}>
      <div className="relative flex">
        <div className="relative flex-1">
          {showSearchIcon && (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          )}
          <Input
            ref={dd.inputRef}
            id={id}
            name={name}
            disabled={disabled}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              dd.open();
              dd.reset();
            }}
            onFocus={() => dd.open()}
            onBlur={() => dd.closeDelayed()}
            onKeyDown={dd.onKeyDown}
            data-smart-first={markFirst ? "true" : undefined}
            data-no-enter-nav="true"
            data-searchable-dropdown="true"
            autoComplete="off"
            className={cn(
              showSearchIcon && "pr-9",
              showChevron && "rounded-l-none border-l-0",
              "rounded-xl text-sm",
              inputClassName
            )}
          />
        </div>
        {showChevron && (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (open) dd.close();
              else {
                dd.open();
                dd.inputRef.current?.focus();
              }
            }}
            className="flex items-center justify-center w-10 border border-border border-r-0 rounded-l-xl bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        )}
      </div>

      {open && (
        <div
          className={cn(
            "absolute z-50 top-full left-0 right-0 mt-1 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg",
            maxHeightClassName,
            popoverClassName
          )}
        >
          {headerAction && (
            <button
              type="button"
              ref={(el) => dd.registerOption(-1, el)}
              onMouseEnter={() => dd.setActive(-1)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                headerAction.onClick();
                dd.close();
              }}
              className={cn(
                "w-full text-right px-3 py-2.5 text-sm transition-colors flex items-center gap-2 text-primary font-semibold border-b border-border",
                dd.activeIndex === -1 ? "bg-muted" : "hover:bg-muted",
                headerAction.className
              )}
            >
              {headerAction.label}
            </button>
          )}

          {items.map((item, idx) => {
            const active = idx === dd.activeIndex;
            return (
              <button
                key={getKey(item)}
                type="button"
                ref={(el) => dd.registerOption(idx, el)}
                onMouseEnter={() => dd.setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => dd.selectAt(idx)}
                className={cn(
                  "w-full text-right px-3 py-2.5 text-sm transition-colors block",
                  !renderOption && (active ? "bg-muted" : "hover:bg-muted")
                )}
              >
                {renderOption ? renderOption(item, active) : getLabel(item)}
              </button>
            );
          })}

          {items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-3">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartSearchableDropdown;
