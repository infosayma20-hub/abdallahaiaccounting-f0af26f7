import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { isValidElement, type ReactNode } from "react";
import type { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";

import { setNextExportBranding } from "@/lib/excel-export";

/**
 * Extracts plain text from a React node returned by a column `format` renderer,
 * so the Excel export shows exactly what the on-screen table shows
 * (e.g. "⚠ تكلفة ناقصة" instead of a misleading raw number).
 */
function reactNodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join("");
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode })?.children;
    return reactNodeToText(children);
  }
  return "";
}

/** Cell value for export: apply the column's format renderer when present, else raw value. */
function exportCellValue(row: any, col: ColumnDef): string | number {
  const raw = row[col.key];
  if (col.format) {
    const text = reactNodeToText(col.format(raw, row)).trim();
    // Keep genuine numbers numeric when the formatter didn't change the value,
    // so Excel users can still run their own sums on untouched numeric columns.
    if (typeof raw === "number" && text === String(raw)) return raw;
    return text;
  }
  return typeof raw === "number" ? raw : (raw ?? "");
}

/** Totals row value, mirroring SortableReportTable's totals logic (supports function configs). */
function exportTotalValue(key: string, config: TotalsConfig[string], data: any[]): string | number {
  if (typeof config === "function") return reactNodeToText(config(data)).trim();
  if (config === "sum") return data.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  if (config === "count") return data.length;
  if (config === "avg") {
    const sum = data.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    return data.length > 0 ? sum / data.length : 0;
  }
  return typeof config === "number" ? config : String(config ?? "");
}

export function exportToExcel(
  data: any[],
  columns: ColumnDef[] | null,
  totalsConfig: TotalsConfig | undefined,
  reportTitle: string,
  dateFrom: string,
  dateTo: string
) {
  if (!data.length) return;
  const colLabels = columns ? columns.map(c => c.label) : Object.keys(data[0]);
  const colKeys = columns ? columns.map(c => c.key) : Object.keys(data[0]);

  const headerRows = [
    [reportTitle],
    [`الفترة: ${dateFrom} إلى ${dateTo}`],
    [`تاريخ التصدير: ${format(new Date(), "dd/MM/yyyy HH:mm")}`],
    [],
    colLabels,
  ];

  const dataRows = columns
    ? data.map(row => columns.map(col => exportCellValue(row, col)))
    : data.map(row => colKeys.map(k => {
        const v = row[k];
        return typeof v === "number" ? v : (v ?? "");
      }));

  if (totalsConfig) {
    const totalsRow = colKeys.map(k => {
      const cfg = totalsConfig[k];
      return cfg === undefined ? "" : exportTotalValue(k, cfg, data);
    });
    totalsRow[0] = "الإجمالي";
    dataRows.push(totalsRow);
  }

  const allRows = [...headerRows, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = colKeys.map(() => ({ wch: 18 }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colKeys.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colKeys.length - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colKeys.length - 1 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.substring(0, 31));
  setNextExportBranding({ title: "تقرير" });
  XLSX.writeFile(wb, `${reportTitle}-${dateFrom}.xlsx`);
  toast.success("تم تصدير التقرير بنجاح");
}
