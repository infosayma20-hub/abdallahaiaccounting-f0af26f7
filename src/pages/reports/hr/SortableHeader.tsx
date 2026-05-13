import { ArrowUp, ArrowDown, ChevronsUpDown, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SortDir = "asc" | "desc";
export type SortState = { key: string | null; dir: SortDir };
export const noSort: SortState = { key: null, dir: "asc" };

export function cycleSort(cur: SortState, key: string): SortState {
  if (cur.key !== key) return { key, dir: "asc" };
  if (cur.dir === "asc") return { key, dir: "desc" };
  return noSort;
}

export function applySort<T>(
  rows: T[],
  sort: SortState,
  getters: Record<string, (r: T) => string | number | null | undefined>
): T[] {
  if (!sort.key || !getters[sort.key]) return rows;
  const g = getters[sort.key];
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = g(a); const vb = g(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls last
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "ar") * dir;
  });
}

export function SortableHeader({
  label, columnKey, sort, onSort, align = "right", className = "",
  filterValue, filterOptions, onFilterChange, filterAllValue = "all",
}: {
  label: string;
  columnKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "right" | "center" | "left";
  className?: string;
  filterValue?: string;
  filterOptions?: { value: string; label: string }[];
  onFilterChange?: (v: string) => void;
  filterAllValue?: string;
}) {
  const active = sort.key === columnKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  const justify = align === "center" ? "justify-center" : align === "left" ? "justify-start" : "justify-end";
  const filterActive = filterOptions != null && filterValue !== undefined && filterValue !== filterAllValue;
  return (
    <th className={`px-3 py-2 font-semibold text-${align} ${className}`}>
      <div className={`inline-flex items-center gap-1 ${justify} w-full`}>
        <button
          type="button"
          onClick={() => onSort(columnKey)}
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
          title="انقر للترتيب"
        >
          <span>{label}</span>
          <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
        {filterOptions && onFilterChange && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`p-0.5 rounded hover:bg-muted ${filterActive ? "text-primary" : "text-muted-foreground/50 hover:text-foreground"}`}
                title="فلترة"
              >
                <Filter className={`h-3 w-3 ${filterActive ? "fill-current" : ""}`} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              dir="rtl"
              className="w-56 p-1 max-h-[60vh] overflow-y-auto"
              collisionPadding={8}
            >
              <div className="text-[10px] text-muted-foreground px-2 py-1 font-semibold">{label}</div>
              <div className="space-y-0.5">
                {filterOptions.map((o) => {
                  const sel = filterValue === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => onFilterChange(o.value)}
                      className={`w-full text-right text-xs px-2 py-1.5 rounded hover:bg-muted ${sel ? "bg-muted font-semibold" : ""}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {filterActive && (
                <button
                  type="button"
                  onClick={() => onFilterChange(filterAllValue)}
                  className="w-full mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border-t pt-1.5"
                >
                  <X className="h-3 w-3" /> مسح فلتر هذا العمود
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </th>
  );
}