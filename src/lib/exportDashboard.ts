/**
 * exportDashboard — تصدير عنصر DOM إلى PNG أو PDF بدقة عالية.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

async function captureNode(node: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

export async function exportNodeAsPNG(node: HTMLElement, filename: string) {
  const canvas = await captureNode(node);
  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function exportNodeAsPDF(node: HTMLElement, filename: string, title?: string) {
  const canvas = await captureNode(node);
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  if (title) {
    pdf.setFontSize(14);
    pdf.text(title, pageWidth - 20, 25, { align: "right" });
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(new Date().toLocaleString("ar-EG"), pageWidth - 20, 40, { align: "right" });
    pdf.setTextColor(0);
  }

  const headerOffset = title ? 50 : 10;
  const availableHeight = pageHeight - headerOffset - 10;
  const ratio = canvas.height / canvas.width;
  let imgWidth = pageWidth - 20;
  let imgHeight = imgWidth * ratio;

  if (imgHeight > availableHeight) {
    imgHeight = availableHeight;
    imgWidth = imgHeight / ratio;
  }

  const x = (pageWidth - imgWidth) / 2;
  pdf.addImage(imgData, "PNG", x, headerOffset, imgWidth, imgHeight);
  pdf.save(`${filename}.pdf`);
}
