import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Filter, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

// ── Types ──
export interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "percent" | "badge" | "link";
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  align?: "right" | "left" | "center";
  format?: (val: any, row: any) => React.ReactNode;
  filterType?: "text" | "number-range" | "date-range" | "select" | "none";
  filterOptions?: string[];
  sticky?: boolean;
  defaultHidden?: boolean;
  isRunningBalance?: boolean;
}

export interface TotalsConfig {
  [key: string]: "sum" | "count" | "avg" | number | string | ((data: any[]) => React.ReactNode);
}

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface FilterState {
  [key: string]: any;
}

interface SortableReportTableProps {
  columns: ColumnDef[];
  data: any[];
  totalsRow?: TotalsConfig;
  loading?: boolean;
  reportTitle: string;
  reportSubtitle?: string;
  storageKey?: string;
  defaultSort?: SortState[];
  rowClassName?: (row: any, index: number) => string;
  /** P5: optional row click handler — when provided, rows become clickable for drilldown. */
  onRowClick?: (row: any, index: number) => void;
}

const GOLD = "#4A9EE8";
const NAVY_HEADER = "#0A2342";
const NAVY_FILTER = "#071829";

const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmt = (n: number) => `₪${fmtNum(Math.abs(n))}`;

function compareValues(a: any, b: any, type: string, dir: "asc" | "desc"): number {
  let va = a, vb = b;
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  if (type === "number" || type === "currency" || type === "percent") {
    va = Number(va) || 0;
    vb = Number(vb) || 0;
  } else if (type === "date") {
    va = new Date(va).getTime() || 0;
    vb = new Date(vb).getTime() || 0;
  } else {
    va = String(va).toLowerCase();
    vb = String(vb).toLowerCase();
    // Numeric-aware text sort (e.g., "1000" < "1100")
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) { va = na; vb = nb; }
  }

  const cmp = va < vb ? -1 : va > vb ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

function matchesFilter(value: any, filter: any, filterType: string): boolean {
  if (filter === undefined || filter === null || filter === "") return true;

  if (filterType === "text") {
    return String(value || "").toLowerCase().includes(String(filter).toLowerCase());
  }

  if (filterType === "select") {
    if (filter === "__all__") return true;
    return String(value || "") === String(filter);
  }

  if (filterType === "number-range") {
    const n = Number(value) || 0;
    if (filter.min !== "" && filter.min !== undefined && n < Number(filter.min)) return false;
    if (filter.max !== "" && filter.max !== undefined && n > Number(filter.max)) return false;
    return true;
  }

  if (filterType === "date-range") {
    const d = value ? new Date(value).getTime() : 0;
    if (filter.from && d < new Date(filter.from).getTime()) return false;
    if (filter.to && d > new Date(filter.to).getTime()) return false;
    return true;
  }

  return true;
}

export default function SortableReportTable({
  columns,
  data,
  totalsRow,
  loading,
  reportTitle,
  reportSubtitle,
  storageKey,
  defaultSort,
  rowClassName,
}: SortableReportTableProps) {
  // Sort state (multi-column, up to 3)
  const [sorts, setSorts] = useState<SortState[]>(defaultSort || []);
  // Filter state
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(false);
  // Column visibility
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    const saved = storageKey ? localStorage.getItem(`report-cols-${storageKey}`) : null;
    if (saved) return new Set(JSON.parse(saved));
    return new Set(columns.filter(c => c.defaultHidden).map(c => c.key));
  });
  const [colPopoverOpen, setColPopoverOpen] = useState(false);

  // Save column visibility
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`report-cols-${storageKey}`, JSON.stringify([...hiddenCols]));
    }
  }, [hiddenCols, storageKey]);

  const visibleColumns = useMemo(() => columns.filter(c => !hiddenCols.has(c.key)), [columns, hiddenCols]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([, v]) => {
      if (v === undefined || v === null || v === "" || v === "__all__") return false;
      if (typeof v === "object" && !v.min && !v.max && !v.from && !v.to) return false;
      return true;
    }).length;
  }, [filters]);

  // Handle sort click
  const handleSort = useCallback((key: string, shiftKey: boolean) => {
    setSorts(prev => {
      const existing = prev.findIndex(s => s.key === key);
      if (existing >= 0) {
        const current = prev[existing];
        if (current.dir === "asc") {
          const next = [...prev];
          next[existing] = { key, dir: "desc" };
          return next;
        } else {
          // Remove this sort
          return prev.filter((_, i) => i !== existing);
        }
      } else {
        // Add new sort
        if (shiftKey && prev.length < 3) {
          return [...prev, { key, dir: "asc" }];
        }
        return [{ key, dir: "asc" }];
      }
    });
  }, []);

  // Check if non-chronological sort is active (for running balance warning)
  const hasRunningBalanceCol = visibleColumns.some(c => c.isRunningBalance);
  const isChronological = useMemo(() => {
    if (sorts.length === 0) return true;
    const firstSort = sorts[0];
    const col = columns.find(c => c.key === firstSort.key);
    return col?.type === "date" && firstSort.dir === "asc";
  }, [sorts, columns]);

  // Filter + Sort data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply filters
    visibleColumns.forEach(col => {
      const filterType = col.filterType || (col.type === "number" || col.type === "currency" || col.type === "percent" ? "number-range" : col.type === "date" ? "date-range" : "text");
      const filterVal = filters[col.key];
      if (filterVal !== undefined) {
        result = result.filter(row => matchesFilter(row[col.key], filterVal, filterType));
      }
    });

    // Apply sorts
    if (sorts.length > 0) {
      result.sort((a, b) => {
        for (const sort of sorts) {
          const col = columns.find(c => c.key === sort.key);
          const cmp = compareValues(a[sort.key], b[sort.key], col?.type || "text", sort.dir);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    return result;
  }, [data, filters, sorts, visibleColumns, columns]);

  // Totals calculation
  const totals = useMemo(() => {
    if (!totalsRow) return null;
    const result: Record<string, React.ReactNode> = {};
    Object.entries(totalsRow).forEach(([key, config]) => {
      if (typeof config === "function") {
        result[key] = config(processedData);
      } else if (config === "sum") {
        result[key] = processedData.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      } else if (config === "count") {
        result[key] = processedData.length;
      } else if (config === "avg") {
        const sum = processedData.reduce((s, r) => s + (Number(r[key]) || 0), 0);
        result[key] = processedData.length > 0 ? sum / processedData.length : 0;
      } else {
        result[key] = config;
      }
    });
    return result;
  }, [totalsRow, processedData]);

  const clearAllFilters = () => setFilters({});
  const toggleColumn = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Sort description for summary bar
  const sortDescription = useMemo(() => {
    if (sorts.length === 0) return "";
    return sorts.map(s => {
      const col = columns.find(c => c.key === s.key);
      return `${col?.label || s.key} (${s.dir === "asc" ? "↑" : "↓"})`;
    }).join(" ← ");
  }, [sorts, columns]);

  // Filter description for export
  const filterDescription = useMemo(() => {
    const parts: string[] = [];
    Object.entries(filters).forEach(([key, val]) => {
      if (!val || val === "__all__") return;
      const col = columns.find(c => c.key === key);
      if (!col) return;
      if (typeof val === "string") parts.push(`${col.label}: ${val}`);
      else if (val.min || val.max) parts.push(`${col.label}: ${val.min || ""}–${val.max || ""}`);
    });
    return parts.join(" | ");
  }, [filters, columns]);

  const getSortIndex = (key: string) => sorts.findIndex(s => s.key === key);
  const getSortDir = (key: string) => sorts.find(s => s.key === key)?.dir;
  const hasActiveFilter = (key: string) => {
    const v = filters[key];
    if (v === undefined || v === null || v === "" || v === "__all__") return false;
    if (typeof v === "object" && !v.min && !v.max && !v.from && !v.to) return false;
    return true;
  };

  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});
  const setFilterDebounced = (key: string, value: any) => {
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(() => {
      setFilters(prev => ({ ...prev, [key]: value }));
    }, 300);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 py-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs rounded-lg h-8"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
            {showFilters ? "إخفاء الفلاتر" : "فلاتر"}
            {activeFilterCount > 0 && (
              <span className="bg-blue-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-8 text-destructive hover:text-destructive" onClick={clearAllFilters}>
              <X className="h-3 w-3" /> مسح كل الفلاتر
            </Button>
          )}
        </div>

        <Popover open={colPopoverOpen} onOpenChange={setColPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-lg h-8">
              <Eye className="h-3.5 w-3.5" /> الأعمدة
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 bg-background z-50" align="end">
            <p className="text-xs font-bold mb-2 text-foreground">عرض الأعمدة</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {columns.map(col => (
                <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                  <Checkbox
                    checked={!hiddenCols.has(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">{col.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2 pt-2 border-t">
              <Button variant="ghost" size="sm" className="flex-1 text-[10px] h-6" onClick={() => setHiddenCols(new Set())}>إظهار الكل</Button>
              <Button variant="ghost" size="sm" className="flex-1 text-[10px] h-6" onClick={() => setHiddenCols(new Set(columns.map(c => c.key)))}>إخفاء الكل</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/30 border-y border-border/30">
        <span>
          عرض {processedData.length} نتيجة من أصل {data.length}
          {sortDescription && <> • مرتب حسب: <span className="font-medium text-foreground">{sortDescription}</span></>}
        </span>
        {filterDescription && (
          <span className="text-muted-foreground/70 truncate max-w-xs">
            فلاتر: {filterDescription}
          </span>
        )}
      </div>

      {/* Running balance warning */}
      {hasRunningBalanceCol && !isChronological && sorts.length > 0 && (
        <div className="px-3 py-1.5 text-[11px] bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-800">
          ⚠️ الرصيد المتحرك يعتمد على الترتيب الزمني — القيم قد تكون غير دقيقة عند تغيير الترتيب
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "auto" }}>
          {/* Header */}
          <thead>
            <tr>
              {visibleColumns.map(col => {
                const sortIdx = getSortIndex(col.key);
                const sortDir = getSortDir(col.key);
                const isSorted = sortIdx >= 0;
                const sortable = col.sortable !== false;
                const hasFilter = hasActiveFilter(col.key);

                return (
                  <th
                    key={col.key}
                    onClick={e => sortable && handleSort(col.key, e.shiftKey)}
                    className="relative whitespace-nowrap"
                    style={{
                      padding: "10px 12px",
                      textAlign: col.align || "right",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "white",
                      background: isSorted ? `rgba(74,158,232,0.2)` : NAVY_HEADER,
                      cursor: sortable ? "pointer" : "default",
                      userSelect: "none",
                      borderBottom: isSorted ? `2px solid ${GOLD}` : hasFilter ? "2px solid #00B4D8" : "1px solid rgba(255,255,255,0.08)",
                      width: col.width,
                      transition: "background 0.15s",
                    }}
                  >
                    <div className="flex items-center gap-1" style={{ justifyContent: col.align === "center" ? "center" : col.align === "left" ? "flex-start" : "flex-end" }}>
                      <span>{col.label}</span>
                      {sortable && (
                        <span className="inline-flex flex-col text-[8px] leading-none" style={{ opacity: isSorted ? 1 : 0.4 }}>
                          {!isSorted && <span style={{ color: "#8B9BB4" }}>↕</span>}
                          {sortDir === "asc" && <span style={{ color: GOLD, fontWeight: 700 }}>▲{sorts.length > 1 ? `${sortIdx + 1}` : ""}</span>}
                          {sortDir === "desc" && <span style={{ color: GOLD, fontWeight: 700 }}>▼{sorts.length > 1 ? `${sortIdx + 1}` : ""}</span>}
                        </span>
                      )}
                      {hasFilter && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute top-1.5 left-1.5" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Filter Row */}
            {showFilters && (
              <tr>
                {visibleColumns.map(col => {
                  const filterType = col.filterType || (
                    col.type === "number" || col.type === "currency" || col.type === "percent" ? "number-range" :
                    col.type === "date" ? "date-range" :
                    col.filterOptions ? "select" : "text"
                  );

                  if (col.filterable === false || filterType === "none") {
                    return <td key={col.key} style={{ background: NAVY_FILTER, padding: "6px 8px", borderBottom: `2px solid ${GOLD}` }} />;
                  }

                  return (
                    <td key={col.key} style={{ background: NAVY_FILTER, padding: "6px 8px", borderBottom: `2px solid ${GOLD}` }}>
                      {filterType === "text" && (
                        <input
                          type="text"
                          placeholder="🔍 ابحث..."
                          defaultValue={filters[col.key] || ""}
                          onChange={e => setFilterDebounced(col.key, e.target.value)}
                          className="w-full text-[11px] px-2 py-1 rounded outline-none"
                          style={{
                            background: "rgba(255,255,255,0.08)",
                            border: `1px solid rgba(74,158,232,0.3)`,
                            color: "white",
                            minWidth: 60,
                          }}
                          onFocus={e => { e.target.style.borderColor = GOLD; e.target.style.background = "rgba(255,255,255,0.12)"; }}
                          onBlur={e => { e.target.style.borderColor = "rgba(74,158,232,0.3)"; e.target.style.background = "rgba(255,255,255,0.08)"; }}
                        />
                      )}

                      {filterType === "number-range" && (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="من"
                            defaultValue={filters[col.key]?.min || ""}
                            onChange={e => setFilterDebounced(col.key, { ...(filters[col.key] || {}), min: e.target.value })}
                            className="w-1/2 text-[10px] px-1.5 py-1 rounded outline-none"
                            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(74,158,232,0.3)`, color: "white" }}
                            onFocus={e => { e.target.style.borderColor = GOLD; }}
                            onBlur={e => { e.target.style.borderColor = "rgba(74,158,232,0.3)"; }}
                          />
                          <input
                            type="number"
                            placeholder="إلى"
                            defaultValue={filters[col.key]?.max || ""}
                            onChange={e => setFilterDebounced(col.key, { ...(filters[col.key] || {}), max: e.target.value })}
                            className="w-1/2 text-[10px] px-1.5 py-1 rounded outline-none"
                            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(74,158,232,0.3)`, color: "white" }}
                            onFocus={e => { e.target.style.borderColor = GOLD; }}
                            onBlur={e => { e.target.style.borderColor = "rgba(74,158,232,0.3)"; }}
                          />
                        </div>
                      )}

                      {filterType === "date-range" && (
                        <div className="flex gap-1">
                          <input
                            type="date"
                            defaultValue={filters[col.key]?.from || ""}
                            onChange={e => setFilters(prev => ({ ...prev, [col.key]: { ...(prev[col.key] || {}), from: e.target.value } }))}
                            className="w-1/2 text-[10px] px-1 py-1 rounded outline-none"
                            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(74,158,232,0.3)`, color: "white" }}
                          />
                          <input
                            type="date"
                            defaultValue={filters[col.key]?.to || ""}
                            onChange={e => setFilters(prev => ({ ...prev, [col.key]: { ...(prev[col.key] || {}), to: e.target.value } }))}
                            className="w-1/2 text-[10px] px-1 py-1 rounded outline-none"
                            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(74,158,232,0.3)`, color: "white" }}
                          />
                        </div>
                      )}

                      {filterType === "select" && (
                        <select
                          value={filters[col.key] || "__all__"}
                          onChange={e => setFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                          className="w-full text-[11px] px-1.5 py-1 rounded outline-none cursor-pointer"
                          style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(74,158,232,0.3)`, color: "white" }}
                        >
                          <option value="__all__" style={{ background: NAVY_FILTER }}>الكل</option>
                          {(col.filterOptions || []).map(opt => (
                            <option key={opt} value={opt} style={{ background: NAVY_FILTER }}>{opt}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </thead>

          {/* Body */}
          <tbody>
            {processedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="text-center py-12 text-muted-foreground text-sm">
                  📭 لا توجد بيانات تطابق البحث
                </td>
              </tr>
            ) : (
              processedData.map((row, i) => (
                <tr
                  key={row.id || row.key || i}
                  className={`border-b border-border/30 transition-colors hover:bg-muted/40 ${i % 2 === 0 ? "" : "bg-muted/15"} ${rowClassName?.(row, i) || ""}`}
                >
                  {visibleColumns.map(col => {
                    const val = row[col.key];
                    const align = col.align || (col.type === "number" || col.type === "currency" || col.type === "percent" ? "left" : "right");

                    let content: React.ReactNode;
                    if (col.format) {
                      content = col.format(val, row);
                    } else if (col.type === "currency") {
                      content = val != null ? fmtAmt(Number(val)) : "—";
                    } else if (col.type === "number") {
                      content = val != null ? Number(val).toLocaleString() : "—";
                    } else if (col.type === "percent") {
                      content = val != null ? `${Number(val).toFixed(1)}%` : "—";
                    } else if (col.type === "date") {
                      content = val || "—";
                    } else {
                      content = val ?? "—";
                    }

                    // Running balance warning
                    if (col.isRunningBalance && !isChronological && sorts.length > 0) {
                      content = <span className="text-muted-foreground/50 text-[10px]">—</span>;
                    }

                    return (
                      <td
                        key={col.key}
                        className="tabular-nums"
                        style={{
                          padding: "8px 12px",
                          textAlign: align,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {/* Totals Footer */}
          {totals && processedData.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", background: "hsl(var(--muted) / 0.4)" }}>
                {visibleColumns.map((col, i) => {
                  const val = totals[col.key];
                  let content: React.ReactNode = "";

                  if (val !== undefined) {
                    if (typeof val === "number") {
                      if (col.type === "currency") content = fmtAmt(val);
                      else if (col.type === "percent") content = `${val.toFixed(1)}%`;
                      else content = val.toLocaleString();
                    } else {
                      content = val;
                    }
                  } else if (i === 0) {
                    content = `الإجمالي (${processedData.length})`;
                  }

                  return (
                    <td
                      key={col.key}
                      className="tabular-nums font-bold text-foreground"
                      style={{
                        padding: "10px 12px",
                        textAlign: col.align || (col.type === "number" || col.type === "currency" || col.type === "percent" ? "left" : "right"),
                        fontSize: 12,
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
