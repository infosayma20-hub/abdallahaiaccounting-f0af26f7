import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import type { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";

import { setNextExportBranding } from "@/lib/excel-export";
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

  const dataRows = data.map(row => colKeys.map(k => {
    const v = row[k];
    return typeof v === "number" ? v : (v ?? "");
  }));

  if (totalsConfig) {
    const totalsRow = colKeys.map(k => {
      if (totalsConfig[k] === "sum") return data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      return "";
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
