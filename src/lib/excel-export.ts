import * as XLSX from "xlsx";

/**
 * Branded Excel export — موحّد لكل تصديرات Excel في النظام
 * يضيف رأس معلوماتي قياسي (العنوان، العملة، الفترة، تاريخ التصدير)
 * لتسهيل قراءة الكشف على المستلم.
 */

export interface BrandedExportOptions {
  /** عنوان التقرير، يظهر في الصف الأول. مثال: "كشف حساب — أبو محمود" */
  title: string;
  /** اسم ورقة العمل داخل الملف (≤ 31 محرف). افتراضي: "تقرير" */
  sheetName?: string;
  /** اسم الملف بدون امتداد. سيُضاف .xlsx تلقائياً. */
  fileName: string;
  /** رؤوس الأعمدة (الصف الأول من الجدول). */
  columns: string[];
  /** بيانات الصفوف (مصفوفة من المصفوفات). */
  rows: (string | number | null | undefined)[][];
  /** صف الإجمالي الاختياري — يُضاف في النهاية بعد سطر فاصل. */
  totalsRow?: (string | number | null | undefined)[];
  /** عرض الأعمدة (wch). إن لم يُمرَّر يحسبها تلقائياً. */
  colWidths?: number[];
  /** عملة التقرير الرئيسية. مثال: "شيكل ₪" — تظهر في الرأس المعلوماتي. */
  currency?: string;
  /** الفترة الزمنية. مثال: "01/01/2026 → 30/04/2026" */
  period?: string;
  /** سطور إضافية في الرأس (مثل اسم الفرع، اسم الموظف، رقم الحساب). */
  extraInfo?: string[];
  /** اسم الشركة (يظهر في أعلى الرأس إن مُرر). */
  companyName?: string;
}

const fmtToday = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
};

/**
 * صدّر بيانات إلى ملف Excel مع رأس معلوماتي موحّد.
 * Usage:
 *   exportToExcelBranded({
 *     title: "تقرير الفواتير",
 *     fileName: "الفواتير-2026-04",
 *     currency: "شيكل ₪",
 *     period: "01/01/2026 → 30/04/2026",
 *     columns: ["#", "التاريخ", "البيان", "المبلغ"],
 *     rows: [...],
 *     totalsRow: ["", "", "الإجمالي", 12500],
 *   });
 */
export function exportToExcelBranded(opts: BrandedExportOptions): void {
  const {
    title,
    sheetName = "تقرير",
    fileName,
    columns,
    rows,
    totalsRow,
    colWidths,
    currency,
    period,
    extraInfo = [],
    companyName,
  } = opts;

  const colCount = columns.length;
  const padRow = (arr: any[]): any[] => {
    const r = [...arr];
    while (r.length < colCount) r.push("");
    return r;
  };

  // ─── Build header info rows ───
  const infoLines: string[] = [];
  if (companyName) infoLines.push(companyName);
  infoLines.push(title);
  if (currency) infoLines.push(`العملة: ${currency}`);
  if (period) infoLines.push(`الفترة: ${period}`);
  extraInfo.forEach((line) => { if (line) infoLines.push(line); });
  infoLines.push(`تاريخ التصدير: ${fmtToday()}`);

  const headerRows = infoLines.map((line) => padRow([line]));
  const blankRow = padRow([]);

  // ─── Assemble sheet ───
  const aoa: any[][] = [
    ...headerRows,
    blankRow,
    columns,
    ...rows.map((r) => padRow(r)),
  ];
  if (totalsRow) {
    aoa.push(blankRow);
    aoa.push(padRow(totalsRow));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ─── Column widths ───
  if (colWidths && colWidths.length === colCount) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  } else {
    // Auto-width: based on max content length per column (capped at 50)
    const widths = columns.map((c, i) => {
      let max = String(c).length;
      for (const r of rows) {
        const v = r[i];
        if (v != null) {
          const len = String(v).length;
          if (len > max) max = len;
        }
      }
      return Math.min(Math.max(max + 2, 10), 50);
    });
    ws["!cols"] = widths.map((w) => ({ wch: w }));
  }

  // ─── Merge header info rows across full width ───
  ws["!merges"] = headerRows.map((_, idx) => ({
    s: { r: idx, c: 0 },
    e: { r: idx, c: colCount - 1 },
  }));

  // ─── RTL direction ───
  if (!ws["!sheetView"]) ws["!sheetView"] = {};
  (ws as any)["!sheetView"] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  const finalName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

/** Helper: تنسيق فترة من تاريخين بصيغة yyyy-MM-dd إلى نص مقروء. */
export function formatPeriodLabel(from?: string, to?: string): string {
  const fmt = (d?: string) => {
    if (!d) return "—";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };
  return `${fmt(from)}  →  ${fmt(to)}`;
}

/** Helper: استخراج اسم العملة + الرمز من كود ISO أو اسم. */
export function currencyDisplay(code?: string): string {
  if (!code) return "شيكل ₪";
  const map: Record<string, string> = {
    ILS: "شيكل ₪", شيكل: "شيكل ₪",
    USD: "دولار $", دولار: "دولار $",
    JOD: "دينار د.أ", دينار: "دينار د.أ",
    EUR: "يورو €", يورو: "يورو €",
    EGP: "جنيه £", جنيه: "جنيه £",
  };
  return map[code] || code;
}
