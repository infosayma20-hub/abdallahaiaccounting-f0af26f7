import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

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
}: {
  label: string;
  columnKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "right" | "center" | "left";
  className?: string;
}) {
  const active = sort.key === columnKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  const justify = align === "center" ? "justify-center" : align === "left" ? "justify-start" : "justify-end";
  return (
    <th className={`px-3 py-2 font-semibold text-${align} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex items-center gap-1 ${justify} w-full hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
        title="انقر للترتيب"
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}