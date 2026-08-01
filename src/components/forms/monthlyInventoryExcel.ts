import * as XLSX from "xlsx";

/**
 * Build & download an Excel file for a Monthly Inventory submission payload.
 * One sheet, columns: التصنيف | الصنف | الوحدة | الكمية.
 * A header block at the top shows branch + month + totals so the file is
 * self-contained when the accountant opens it.
 */
export function exportMonthlyInventoryToExcel(
  payload: any,
  prices?: Record<string, number>,
): void {
  const branchName = payload?.branch_name || payload?.branch_key || "—";
  const month = payload?.month || "—";
  const lines: any[] = Array.isArray(payload?.lines) ? payload.lines : [];
  const totalQty: number =
    payload?.summary?.qty ??
    lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const priceOf = (l: any) => Number(prices?.[l.item] ?? l.unit_price ?? 0) || 0;
  const totalValue = lines.reduce((s, l) => s + (Number(l.qty) || 0) * priceOf(l), 0);

  const aoa: (string | number)[][] = [
    ["جرد شهري"],
    ["الفرع", branchName, "الشهر", month],
    ["مجموع الكميات", totalQty, "عدد الأصناف المعبّأة", lines.length],
    ["إجمالي قيمة الجرد", Number(totalValue.toFixed(2))],
    [],
    ["التصنيف", "الصنف", "الوحدة", "الكمية", "سعر الوحدة", "القيمة"],
  ];

  // Group by category to add category totals between groups.
  const byCat = new Map<string, any[]>();
  lines.forEach((l) => {
    const arr = byCat.get(l.category) || [];
    arr.push(l);
    byCat.set(l.category, arr);
  });
  byCat.forEach((items, category) => {
    items.forEach((l) => {
      const p = priceOf(l);
      aoa.push([category, l.item, l.unit, Number(l.qty) || 0, p, Number(((Number(l.qty) || 0) * p).toFixed(2))]);
    });
    const sub = items.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const subVal = items.reduce((s, l) => s + (Number(l.qty) || 0) * priceOf(l), 0);
    aoa.push(["", "", `إجمالي ${category}`, sub, "", Number(subVal.toFixed(2))]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths
  (ws as any)["!cols"] = [
    { wch: 22 }, // التصنيف
    { wch: 32 }, // الصنف
    { wch: 12 }, // الوحدة
    { wch: 12 }, // الكمية
    { wch: 12 }, // سعر الوحدة
    { wch: 14 }, // القيمة
  ];
  // RTL sheet view
  (ws as any)["!views"] = [{ RTL: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الجرد");

  const fname = `جرد_${branchName}_${month}.xlsx`;
  XLSX.writeFile(wb, fname);
}