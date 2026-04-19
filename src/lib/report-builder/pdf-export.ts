// PDF Pro export for Report Builder — Arabic-first executive layout
// Features: Amiri font, repeating headers, page numbering, footer, multi-template
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { ColumnDef } from "@/components/reports/SortableReportTable";
import { ar as reshapeArabicText } from "@/utils/arabic-pdf-utils";
import { AmiriRegular, AmiriBold } from "@/utils/amiri-font";

export type PdfTemplate = "executive" | "financial" | "compact" | "detailed";

interface ExportPdfParams {
  title: string;
  subtitle?: string;
  dateFrom?: string;
  dateTo?: string;
  kpis?: { label: string; value: string }[];
  columns: ColumnDef[];
  data: any[];
  chartElement?: HTMLElement | null;
  template?: PdfTemplate;
  // Optional branding
  companyName?: string;
  companyLogo?: string;
  userName?: string;
}

const NAVY: [number, number, number] = [13, 27, 46];
const NAVY_LIGHT: [number, number, number] = [240, 244, 250];
const BORDER: [number, number, number] = [225, 230, 238];
const ALT: [number, number, number] = [250, 251, 253];
const MUTED: [number, number, number] = [110, 120, 135];
const MUTED_LIGHT: [number, number, number] = [245, 247, 250];

const fmt = (v: any, type: string) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "currency") {
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return `₪${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (type === "number") {
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString("en");
  }
  if (type === "date") {
    try { return format(new Date(v), "yyyy-MM-dd"); } catch { return String(v); }
  }
  return String(v);
};

// Reshape Arabic for jsPDF (handles mixed LTR/RTL)
function ar(text: string): string {
  try {
    const r = reshapeArabicText(String(text ?? ""));
    return r || String(text ?? "");
  } catch {
    return String(text ?? "");
  }
}

// Register Amiri font (full Arabic support)
function registerAmiri(doc: jsPDF) {
  try {
    doc.addFileToVFS("Amiri-Regular.ttf", AmiriRegular);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    doc.addFileToVFS("Amiri-Bold.ttf", AmiriBold);
    doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  } catch (e) {
    console.warn("Failed to register Amiri font, falling back to helvetica", e);
  }
}

// Template-specific config
function templateConfig(template: PdfTemplate) {
  switch (template) {
    case "executive":
      return { showKpis: true, showChart: true, showTotals: true, showNotes: false, accentLabel: "تقرير إداري" };
    case "financial":
      return { showKpis: true, showChart: false, showTotals: true, showNotes: false, accentLabel: "تقرير مالي" };
    case "compact":
      return { showKpis: false, showChart: false, showTotals: true, showNotes: false, accentLabel: "تقرير مختصر" };
    case "detailed":
      return { showKpis: true, showChart: true, showTotals: true, showNotes: true, accentLabel: "تقرير تفصيلي" };
    default:
      return { showKpis: true, showChart: true, showTotals: true, showNotes: false, accentLabel: "تقرير" };
  }
}

export async function exportReportToPdf({
  title,
  subtitle,
  dateFrom,
  dateTo,
  kpis,
  columns,
  data,
  chartElement,
  template = "executive",
  companyName,
  companyLogo,
  userName,
}: ExportPdfParams) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  registerAmiri(doc);
  doc.setFont("Amiri", "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const cfg = templateConfig(template);

  // ─── Page 1 Header Band ───
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 64, "F");

  // Logo (top-right Arabic; appears top-left visually for RTL? we put on top-left as logo)
  if (companyLogo) {
    try {
      doc.addImage(companyLogo, "PNG", margin, 12, 40, 40);
    } catch {}
  }

  // Title (right-aligned)
  doc.setTextColor(255, 255, 255);
  doc.setFont("Amiri", "bold");
  doc.setFontSize(18);
  doc.text(ar(title), pageW - margin, 28, { align: "right" });

  // Subtitle / company under title
  doc.setFont("Amiri", "normal");
  doc.setFontSize(10);
  if (companyName) {
    doc.text(ar(companyName), pageW - margin, 46, { align: "right" });
  }

  // Template label badge (top-left)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  doc.roundedRect(margin + (companyLogo ? 50 : 0), 20, 90, 20, 4, 4, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(ar(cfg.accentLabel), margin + (companyLogo ? 50 : 0) + 45, 33, { align: "center" });

  let cursorY = 84;

  // ─── Period & meta strip ───
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.setFont("Amiri", "normal");
  if (dateFrom && dateTo) {
    doc.text(`${ar("الفترة")}: ${dateFrom} ${ar("إلى")} ${dateTo}`, pageW - margin, cursorY, { align: "right" });
  }
  doc.text(`${ar("تاريخ التصدير")}: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, margin, cursorY, { align: "left" });
  cursorY += 16;

  // Subtitle (description)
  if (subtitle) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10);
    doc.text(ar(subtitle), pageW - margin, cursorY, { align: "right" });
    cursorY += 16;
  }

  // ─── KPIs row ───
  if (cfg.showKpis && kpis && kpis.length > 0) {
    const cardW = (pageW - margin * 2 - (kpis.length - 1) * 8) / kpis.length;
    const cardH = 52;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 8);
      // Card with subtle gradient feel
      doc.setFillColor(...MUTED_LIGHT);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(x, cursorY, cardW, cardH, 6, 6, "FD");
      // Accent bar (top)
      doc.setFillColor(...NAVY);
      doc.rect(x, cursorY, cardW, 3, "F");
      // Label
      doc.setTextColor(...MUTED);
      doc.setFontSize(8);
      doc.setFont("Amiri", "normal");
      doc.text(ar(k.label), x + cardW - 10, cursorY + 18, { align: "right" });
      // Value
      doc.setTextColor(...NAVY);
      doc.setFont("Amiri", "bold");
      doc.setFontSize(14);
      doc.text(ar(k.value), x + cardW - 10, cursorY + 38, { align: "right" });
      doc.setFont("Amiri", "normal");
    });
    cursorY += cardH + 16;
  }

  // ─── Chart image ───
  if (cfg.showChart && chartElement) {
    try {
      const canvas = await html2canvas(chartElement, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const maxH = 220;
      const finalH = Math.min(imgH, maxH);
      const finalW = (canvas.width * finalH) / canvas.height;
      // Light card background
      doc.setFillColor(252, 253, 254);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, finalH + 12, 6, 6, "FD");
      doc.addImage(imgData, "PNG", (pageW - finalW) / 2, cursorY + 6, finalW, finalH);
      cursorY += finalH + 24;
    } catch (e) {
      console.warn("Chart capture failed", e);
    }
  }

  // ─── Table ───
  const head = [columns.map(c => ar(c.label))];
  const body = data.map(row => columns.map(c => ar(fmt(row[c.key], c.type))));

  // Totals row (sum numeric/currency cols)
  let foot: any[][] | undefined = undefined;
  if (cfg.showTotals) {
    const totals: any[] = columns.map((c, i) => {
      if (i === 0) return ar("الإجمالي");
      if (c.type === "currency" || c.type === "number") {
        const sum = data.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        return ar(fmt(sum, c.type));
      }
      return "";
    });
    foot = [totals];
  }

  autoTable(doc, {
    head,
    body,
    foot,
    startY: cursorY,
    margin: { left: margin, right: margin, top: 20, bottom: 50 },
    theme: "grid",
    showHead: "everyPage",   // ✅ repeating headers
    showFoot: "lastPage",
    pageBreak: "auto",       // ✅ smart page breaks
    rowPageBreak: "avoid",   // ✅ don't split a row across pages
    styles: {
      font: "Amiri",
      fontStyle: "normal",
      fontSize: 9,
      cellPadding: 6,
      halign: "right",
      lineColor: BORDER,
      lineWidth: 0.5,
      textColor: [40, 50, 65],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "right",
      fontSize: 9.5,
      cellPadding: 7,
    },
    footStyles: {
      fillColor: NAVY_LIGHT,
      textColor: NAVY,
      fontStyle: "bold",
      halign: "right",
      fontSize: 9.5,
    },
    alternateRowStyles: { fillColor: ALT },
    didDrawPage: () => {
      drawFooter(doc, pageW, pageH, margin, { userName, companyName });
    },
  });

  // ─── Notes section (detailed only) ───
  if (cfg.showNotes) {
    const lastY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    const notesY = lastY + 24;
    if (notesY < pageH - 80) {
      doc.setFont("Amiri", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(ar("ملاحظات"), pageW - margin, notesY, { align: "right" });
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.5);
      // 4 ruled lines
      for (let i = 1; i <= 4; i++) {
        const y = notesY + 14 + i * 16;
        doc.line(margin, y, pageW - margin, y);
      }
    }
  }

  const fileName = `${title}_${cfg.accentLabel}_${format(new Date(), "yyyy-MM-dd")}.pdf`.replace(/\s+/g, "_");
  doc.save(fileName);
}

// ─── Footer drawer (called on every page by didDrawPage) ───
function drawFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  meta: { userName?: string; companyName?: string }
) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

  // Top border line
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 36, pageW - margin, pageH - 36);

  // Right: company / brand
  doc.setFont("Amiri", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (meta.companyName) {
    doc.text(ar(meta.companyName), pageW - margin, pageH - 22, { align: "right" });
  } else {
    doc.text(ar("نظام أموالي للمحاسبة"), pageW - margin, pageH - 22, { align: "right" });
  }

  // Center: page x / y
  doc.setTextColor(...NAVY);
  doc.setFont("Amiri", "bold");
  doc.text(
    `${ar("صفحة")} ${currentPage} / ${pageCount}`,
    pageW / 2,
    pageH - 22,
    { align: "center" }
  );

  // Left: user + timestamp
  doc.setFont("Amiri", "normal");
  doc.setTextColor(...MUTED);
  const left = meta.userName
    ? `${ar("المستخدم")}: ${meta.userName}`
    : "";
  if (left) {
    doc.text(left, margin, pageH - 22, { align: "left" });
  } else {
    doc.text(format(new Date(), "yyyy-MM-dd HH:mm"), margin, pageH - 22, { align: "left" });
  }
}
