import { ArrowRight, Download, FileSpreadsheet, Search, ChevronDown, ChevronUp, Building2, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━
// Report Header
// ━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ReportHeaderProps {
  reportName: string;
  companyName?: string;
  period?: string;
  onBack: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  icon?: React.ReactNode;
}

export const ReportHeader = ({ reportName, companyName, period, onBack, onExportPDF, onExportExcel, icon }: ReportHeaderProps) => {
  const exportDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-muted/60 backdrop-blur-sm flex items-center justify-center hover:bg-muted transition-all duration-200 shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{reportName}</h1>
            {companyName && (
              <div className="flex items-center gap-1 mt-0.5">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">{companyName}</p>
              </div>
            )}
          </div>
        </div>
        {icon && <div className="p-2 rounded-lg bg-primary/10">{icon}</div>}
      </div>

      {/* Meta bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {period && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {period}
            </span>
          )}
          <span>تاريخ التصدير: {exportDate}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {onExportExcel && (
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 rounded-lg" onClick={onExportExcel}>
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </Button>
          )}
          {onExportPDF && (
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 rounded-lg" onClick={onExportPDF}>
              <Download className="h-3 w-3" />
              PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━
// Report Summary Box
// ━━━━━━━━━━━━━━━━━━━━━━━━━━
interface SummaryItem {
  label: string;
  value: number;
  color?: "primary" | "destructive" | "warning" | "muted";
  prefix?: string;
}

interface ReportSummaryProps {
  items: SummaryItem[];
}

export const ReportSummary = ({ items }: ReportSummaryProps) => {
  const colorMap = {
    primary: "text-primary",
    destructive: "text-destructive",
    warning: "text-warning",
    muted: "text-foreground",
  };

  const bgMap = {
    primary: "border-primary/20 bg-primary/5",
    destructive: "border-destructive/20 bg-destructive/5",
    warning: "border-warning/20 bg-warning/5",
    muted: "border-border bg-muted/30",
  };

  return (
    <div className={`grid gap-2 ${items.length <= 2 ? "grid-cols-2" : items.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
      {items.map((item) => {
        const c = item.color || "muted";
        return (
          <div key={item.label} className={`rounded-xl border p-3 text-center ${bgMap[c]}`}>
            <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-sm font-bold tabular-nums ${colorMap[c]}`}>
              {item.prefix || "₪"}{Math.abs(item.value).toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━
// Report Table
// ━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ReportTableProps {
  data: Record<string, any>[];
  columns?: string[];
  debitColumn?: string;
  creditColumn?: string;
  amountColumn?: string;
  typeColumn?: string;
  searchable?: boolean;
  expandable?: boolean;
  onExportExcel?: (filtered: Record<string, any>[]) => void;
}

export const ReportTable = ({
  data,
  columns: overrideColumns,
  debitColumn,
  creditColumn,
  amountColumn = "المبلغ",
  typeColumn = "النوع",
  searchable = true,
  expandable = true,
}: ReportTableProps) => {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const columns = useMemo(() => {
    if (overrideColumns) return overrideColumns;
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data, overrideColumns]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return data.filter((row) =>
      words.every(w => columns.some((col) => String(row[col] ?? "").toLowerCase().includes(w)))
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortCol] ?? "";
      const vb = b[sortCol] ?? "";
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [filtered, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const toggleExpand = (i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // Determine which columns to show in compact view (max 4)
  const visibleCols = columns.slice(0, 4);
  const hiddenCols = columns.slice(4);

  const getCellColor = (row: Record<string, any>, col: string) => {
    if (col === typeColumn || col === amountColumn) {
      const type = String(row[typeColumn] ?? "").toLowerCase();
      if (type.includes("مدين") || type.includes("debit")) return "text-primary font-semibold";
      if (type.includes("دائن") || type.includes("credit")) return "text-destructive font-semibold";
    }
    if (col === debitColumn) return "text-primary";
    if (col === creditColumn) return "text-destructive";
    return "";
  };

  if (data.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 space-y-3">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          {searchable && (
            <div className="relative flex-1 max-w-[220px]">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full h-8 pr-8 pl-3 text-xs bg-secondary/60 rounded-lg border-0 outline-none focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
                dir="rtl"
              />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {sorted.length} سجل
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {expandable && hiddenCols.length > 0 && <TableHead className="w-8" />}
                {visibleCols.map((col) => (
                  <TableHead
                    key={col}
                    className="text-[11px] font-bold whitespace-nowrap text-right cursor-pointer hover:text-primary transition-colors select-none"
                    onClick={() => handleSort(col)}
                  >
                    <span className="flex items-center gap-1">
                      {col}
                      {sortCol === col && (
                        sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, i) => (
                <>
                  <TableRow
                    key={i}
                    className={`hover:bg-muted/30 transition-colors ${expandedRows.has(i) ? "bg-muted/20" : ""}`}
                  >
                    {expandable && hiddenCols.length > 0 && (
                      <TableCell className="w-8 p-1">
                        <button onClick={() => toggleExpand(i)} className="p-1 rounded hover:bg-muted">
                          {expandedRows.has(i) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </TableCell>
                    )}
                    {visibleCols.map((col) => (
                      <TableCell key={col} className={`text-xs whitespace-nowrap ${getCellColor(row, col)}`}>
                        {typeof row[col] === "number" ? row[col].toLocaleString() : row[col] || "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expandable && expandedRows.has(i) && hiddenCols.length > 0 && (
                    <TableRow key={`exp-${i}`}>
                      <TableCell colSpan={visibleCols.length + 1} className="bg-muted/10 p-3">
                        <div className="grid grid-cols-2 gap-2">
                          {hiddenCols.map((col) => (
                            <div key={col}>
                              <p className="text-[10px] text-muted-foreground">{col}</p>
                              <p className={`text-xs font-medium ${getCellColor(row, col)}`}>
                                {typeof row[col] === "number" ? row[col].toLocaleString() : row[col] || "-"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━
// Export Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━
export const exportToExcel = (data: Record<string, any>[], summary: Record<string, any>, fileName: string) => {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryRows = Object.entries(summary).map(([key, val]) => ({ البيان: key, القيمة: val }));
  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws1, "ملخص");

  // Data sheet
  const ws2 = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws2, "بيانات");

  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const exportToPDF = (
  reportName: string,
  companyName: string,
  period: string,
  summary: Record<string, any>,
  data: Record<string, any>[]
) => {
  const exportDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', sans-serif; }
  body { padding: 30px; color: #1a1a2e; background: #fff; }
  .header { text-align: center; border-bottom: 3px solid #16a34a; padding-bottom: 16px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; color: #16a34a; }
  .header h2 { font-size: 16px; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-bottom: 16px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .summary-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
  .summary-item .label { font-size: 10px; color: #666; }
  .summary-item .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f3f4f6; font-weight: 700; padding: 8px 6px; border: 1px solid #e5e7eb; text-align: right; }
  td { padding: 6px; border: 1px solid #e5e7eb; text-align: right; }
  tr:nth-child(even) { background: #fafafa; }
  .debit { color: #16a34a; font-weight: 600; }
  .credit { color: #dc2626; font-weight: 600; }
  @media print { body { padding: 15px; } }
</style>
</head>
<body>
<div class="header">
  <h1>${companyName || "النظام المالي"}</h1>
  <h2>${reportName}</h2>
</div>
<div class="meta">
  <span>الفترة: ${period || "الكل"}</span>
  <span>تاريخ التصدير: ${exportDate}</span>
</div>
<div class="summary">
  ${Object.entries(summary).map(([k, v]) => `<div class="summary-item"><div class="label">${k}</div><div class="value">${typeof v === "number" ? v.toLocaleString() : v}</div></div>`).join("")}
</div>
<table>
  <thead><tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr></thead>
  <tbody>
    ${data.map(row => `<tr>${columns.map(c => {
      const val = typeof row[c] === "number" ? row[c].toLocaleString() : (row[c] || "-");
      const type = String(row["النوع"] ?? "").toLowerCase();
      const cls = type.includes("مدين") ? "debit" : type.includes("دائن") ? "credit" : "";
      return `<td class="${cls}">${val}</td>`;
    }).join("")}</tr>`).join("")}
  </tbody>
</table>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      /* view only — no browser print */
    };
  }
};
