import * as XLSX from "xlsx";

/**
 * Branded Excel export — موحّد لكل تصديرات Excel في النظام
 * يضيف رأس معلوماتي قياسي (العنوان، العملة، الفترة، تاريخ التصدير)
 * لتسهيل قراءة الكشف على المستلم.
 */

export interface BrandedExportOptions {
  title: string;
  sheetName?: string;
  fileName: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
  totalsRow?: (string | number | null | undefined)[];
  colWidths?: number[];
  currency?: string;
  period?: string;
  extraInfo?: string[];
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

export function exportToExcelBranded(opts: BrandedExportOptions): void {
  const {
    title, sheetName = "تقرير", fileName, columns, rows, totalsRow,
    colWidths, currency, period, extraInfo = [], companyName,
  } = opts;
  const colCount = columns.length;
  const padRow = (arr: any[]): any[] => {
    const r = [...arr];
    while (r.length < colCount) r.push("");
    return r;
  };
  const infoLines: string[] = [];
  if (companyName) infoLines.push(companyName);
  infoLines.push(title);
  if (currency) infoLines.push(`العملة: ${currency}`);
  if (period) infoLines.push(`الفترة: ${period}`);
  extraInfo.forEach((line) => { if (line) infoLines.push(line); });
  infoLines.push(`تاريخ التصدير: ${fmtToday()}`);

  const headerRows = infoLines.map((line) => padRow([line]));
  const blankRow = padRow([]);
  const aoa: any[][] = [...headerRows, blankRow, columns, ...rows.map((r) => padRow(r))];
  if (totalsRow) { aoa.push(blankRow); aoa.push(padRow(totalsRow)); }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths && colWidths.length === colCount) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  } else {
    const widths = columns.map((c, i) => {
      let max = String(c).length;
      for (const r of rows) {
        const v = r[i];
        if (v != null) { const len = String(v).length; if (len > max) max = len; }
      }
      return Math.min(Math.max(max + 2, 10), 50);
    });
    ws["!cols"] = widths.map((w) => ({ wch: w }));
  }
  ws["!merges"] = headerRows.map((_, idx) => ({ s: { r: idx, c: 0 }, e: { r: idx, c: colCount - 1 } }));
  (ws as any)["!sheetView"] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  const finalName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

export function formatPeriodLabel(from?: string, to?: string): string {
  const fmt = (d?: string) => {
    if (!d) return "—";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };
  return `${fmt(from)}  →  ${fmt(to)}`;
}

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

// ════════════════════════════════════════════════════════════════════
// AUTO-BRANDING INTERCEPTOR
// ════════════════════════════════════════════════════════════════════
// يلتقط أي workbook يُنشأ عبر XLSX.utils.book_new() ويضيف رأس
// معلوماتي قياسي قبل كتابته إلى الملف، بحيث يستفيد كل تصدير في
// النظام تلقائياً دون تعديل كل ملف على حدة.

interface BrandingMeta {
  title?: string;
  currency?: string;
  period?: string;
  extraInfo?: string[];
  companyName?: string;
}

let activeBranding: BrandingMeta | null = null;

/**
 * استدعِها قبل XLSX.writeFile لتضع رأس معلوماتي قياسي على كل
 * أوراق الـ workbook التي ستُكتب لاحقاً.
 *
 * Example:
 *   setNextExportBranding({ title: "كشف حساب", currency: "شيكل ₪", period: "01/01/2026 → 30/04/2026" });
 *   XLSX.writeFile(wb, "report.xlsx");
 */
export function setNextExportBranding(meta: BrandingMeta): void {
  activeBranding = meta;
}

/** يمسح بيانات العلامة التجارية المعلّقة (اختياري — يحدث تلقائياً بعد writeFile). */
export function clearExportBranding(): void {
  activeBranding = null;
}

function buildBrandingAoA(meta: BrandingMeta): string[][] {
  const lines: string[] = [];
  if (meta.companyName) lines.push(meta.companyName);
  if (meta.title) lines.push(meta.title);
  if (meta.currency) lines.push(`العملة: ${meta.currency}`);
  if (meta.period) lines.push(`الفترة: ${meta.period}`);
  (meta.extraInfo || []).forEach((l) => { if (l) lines.push(l); });
  lines.push(`تاريخ التصدير: ${fmtToday()}`);
  return lines.map((l) => [l]);
}

function getSheetColumnCount(ws: XLSX.WorkSheet): number {
  const ref = ws["!ref"];
  if (!ref) return 1;
  const range = XLSX.utils.decode_range(ref);
  return Math.max(1, range.e.c - range.s.c + 1);
}

function injectBrandingIntoSheet(ws: XLSX.WorkSheet, meta: BrandingMeta): void {
  const brandRows = buildBrandingAoA(meta);
  const colCount = getSheetColumnCount(ws);
  const totalRowsToInsert = brandRows.length + 1; // +1 for blank separator

  // Shift existing cells DOWN by totalRowsToInsert rows
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    const cells: { addr: string; cell: XLSX.CellObject }[] = [];
    for (const key of Object.keys(ws)) {
      if (key.startsWith("!")) continue;
      cells.push({ addr: key, cell: ws[key] as XLSX.CellObject });
      delete ws[key];
    }
    // Rewrite shifted
    for (const { addr, cell } of cells) {
      const decoded = XLSX.utils.decode_cell(addr);
      const newAddr = XLSX.utils.encode_cell({
        c: decoded.c,
        r: decoded.r + totalRowsToInsert,
      });
      ws[newAddr] = cell;
    }
    // Update range
    range.e.r += totalRowsToInsert;
    ws["!ref"] = XLSX.utils.encode_range(range);

    // Shift existing merges
    if (ws["!merges"]) {
      ws["!merges"] = ws["!merges"].map((m) => ({
        s: { r: m.s.r + totalRowsToInsert, c: m.s.c },
        e: { r: m.e.r + totalRowsToInsert, c: m.e.c },
      }));
    }
  }

  // Write branding rows at the top
  brandRows.forEach((row, rIdx) => {
    const addr = XLSX.utils.encode_cell({ r: rIdx, c: 0 });
    ws[addr] = { v: row[0], t: "s" } as XLSX.CellObject;
  });

  // Add merges for branding rows (span full width)
  const brandMerges = brandRows.map((_, idx) => ({
    s: { r: idx, c: 0 },
    e: { r: idx, c: colCount - 1 },
  }));
  ws["!merges"] = [...brandMerges, ...(ws["!merges"] || [])];

  // Ensure RTL
  (ws as any)["!sheetView"] = [{ rightToLeft: true }];

  // Update !ref if it didn't exist
  if (!ws["!ref"]) {
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: brandRows.length, c: colCount - 1 },
    });
  }
}

/**
 * Monkey-patch XLSX.writeFile to inject branding header before writing.
 * This runs once on module load, so every XLSX.writeFile() call across
 * the app benefits — provided setNextExportBranding() was called first.
 */
const _originalWriteFile = XLSX.writeFile;

/**
 * Branded writeFile wrapper — يحقن رأس العلامة التجارية قبل الكتابة
 * إذا تم استدعاء setNextExportBranding() مسبقاً، ثم يكتب الملف.
 * استخدمها بدلاً من XLSX.writeFile مباشرة عبر النظام.
 */
export function writeFileBranded(
  wb: XLSX.WorkBook,
  filename: string,
  opts?: XLSX.WritingOptions
): void {
  try {
    if (activeBranding && wb && wb.SheetNames) {
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (ws) injectBrandingIntoSheet(ws, activeBranding);
      }
    }
  } catch (e) {
    console.warn("[excel-export] branding injection failed:", e);
  } finally {
    activeBranding = null;
  }
  return _originalWriteFile.call(XLSX, wb, filename, opts);
}

// Best-effort monkey-patch: في بعض bundlers يكون XLSX module مجمّداً
// (frozen ESM namespace) فنتجاهل الفشل بدل كسر التطبيق بالكامل.
try {
  Object.defineProperty(XLSX, "writeFile", {
    configurable: true,
    writable: true,
    value: writeFileBranded,
  });
} catch {
  // ESM frozen namespace — استخدم writeFileBranded صراحة بدلاً من ذلك.
}
