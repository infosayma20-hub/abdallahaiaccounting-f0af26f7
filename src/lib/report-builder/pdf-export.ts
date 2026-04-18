// PDF export for Report Builder — Arabic-friendly executive layout
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { ColumnDef } from "@/components/reports/SortableReportTable";
import { ar as reshapeArabicText } from "@/utils/arabic-pdf-utils";

interface ExportPdfParams {
  title: string;
  subtitle?: string;
  dateFrom?: string;
  dateTo?: string;
  kpis?: { label: string; value: string }[];
  columns: ColumnDef[];
  data: any[];
  chartElement?: HTMLElement | null;
}

const fmt = (v: any, type: string) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "currency") return `₪${Number(v).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "number") return Number(v).toLocaleString("en");
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

export async function exportReportToPdf({
  title, subtitle, dateFrom, dateTo, kpis, columns, data, chartElement,
}: ExportPdfParams) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Header band
  doc.setFillColor(13, 27, 46); // navy #0D1B2E
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(ar(title), pageW - margin, 30, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const periodTxt = dateFrom && dateTo ? `${ar("الفترة")}: ${dateFrom} ${ar("إلى")} ${dateTo}` : "";
  if (periodTxt) doc.text(periodTxt, pageW - margin, 46, { align: "right" });
  doc.text(`${ar("تاريخ التصدير")}: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, margin, 46, { align: "left" });

  let cursorY = 76;

  // Subtitle
  if (subtitle) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10);
    doc.text(ar(subtitle), pageW - margin, cursorY, { align: "right" });
    cursorY += 18;
  }

  // KPIs row
  if (kpis && kpis.length > 0) {
    const cardW = (pageW - margin * 2 - (kpis.length - 1) * 8) / kpis.length;
    const cardH = 48;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 8);
      doc.setFillColor(245, 247, 250);
      doc.setDrawColor(225, 230, 238);
      doc.roundedRect(x, cursorY, cardW, cardH, 6, 6, "FD");
      doc.setTextColor(110, 120, 135);
      doc.setFontSize(8);
      doc.text(ar(k.label), x + cardW - 8, cursorY + 14, { align: "right" });
      doc.setTextColor(13, 27, 46);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(ar(k.value), x + cardW - 8, cursorY + 34, { align: "right" });
      doc.setFont("helvetica", "normal");
    });
    cursorY += cardH + 14;
  }

  // Chart image
  if (chartElement) {
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
      doc.addImage(imgData, "PNG", (pageW - finalW) / 2, cursorY, finalW, finalH);
      cursorY += finalH + 16;
    } catch (e) {
      console.warn("Chart capture failed", e);
    }
  }

  // Table
  const head = [columns.map(c => ar(c.label))];
  const body = data.map(row => columns.map(c => ar(fmt(row[c.key], c.type))));

  // Totals row (sum numeric/currency cols)
  const totals: any[] = columns.map((c, i) => {
    if (i === 0) return ar("الإجمالي");
    if (c.type === "currency" || c.type === "number") {
      const sum = data.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      return ar(fmt(sum, c.type));
    }
    return "";
  });

  autoTable(doc, {
    head,
    body,
    foot: [totals],
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 40 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 6,
      halign: "right",
      lineColor: [225, 230, 238],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [13, 27, 46],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "right",
    },
    footStyles: {
      fillColor: [240, 244, 250],
      textColor: [13, 27, 46],
      fontStyle: "bold",
      halign: "right",
    },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    didDrawPage: (data) => {
      // Footer with page number
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(130, 140, 155);
      doc.text(
        `${ar("صفحة")} ${currentPage} / ${pageCount}`,
        pageW / 2,
        pageH - 16,
        { align: "center" }
      );
    },
  });

  const fileName = `${title}_${format(new Date(), "yyyy-MM-dd")}.pdf`.replace(/\s+/g, "_");
  doc.save(fileName);
}
