export interface ThermalPrintOptions {
  title?: string;
  paperWidthMm?: 58 | 80;
  contentWidthMm?: number;
  extraStyles?: string;
  cleanupDelayMs?: number;
}

function buildThermalHtml(bodyHtml: string, options: Required<Pick<ThermalPrintOptions, "title" | "paperWidthMm" | "contentWidthMm" | "cleanupDelayMs">> & Pick<ThermalPrintOptions, "extraStyles">) {
  const baseStyles = `
    @page { margin: 0; size: ${options.paperWidthMm}mm auto; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      direction: rtl;
      color: #000;
      font-family: 'Arial', 'Tahoma', 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.5;
      overflow: hidden;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
    }
    .thermal-print-root {
      width: ${options.contentWidthMm}mm;
      max-width: ${options.contentWidthMm}mm;
      margin: 0 auto;
      padding: 2mm 0;
      background: #fff;
    }
    img, svg, canvas {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  `;

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8" /><title>${options.title}</title><style>${baseStyles}${options.extraStyles || ""}</style></head><body><div class="thermal-print-root">${bodyHtml}</div></body></html>`;
}

export function printThermalContent(bodyHtml: string, options: ThermalPrintOptions = {}) {
  const paperWidthMm = options.paperWidthMm ?? 80;
  const contentWidthMm = options.contentWidthMm ?? (paperWidthMm === 58 ? 50 : 72);
  const cleanupDelayMs = options.cleanupDelayMs ?? 2000;
  const title = options.title ?? "طباعة";

  const existingFrame = document.getElementById("thermal-print-frame");
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.id = "thermal-print-frame";
  iframe.style.cssText = `position: fixed; top: -10000px; left: -10000px; width: ${paperWidthMm}mm; height: 1px; opacity: 0; pointer-events: none; border: 0;`;
  document.body.appendChild(iframe);

  const html = buildThermalHtml(bodyHtml, {
    title,
    paperWidthMm,
    contentWidthMm,
    cleanupDelayMs,
    extraStyles: options.extraStyles,
  });

  let printed = false;
  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;

    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      cleanup();
      return;
    }

    printWindow.onafterprint = cleanup;
    printWindow.focus();

    window.setTimeout(() => {
      printWindow.print();
      window.setTimeout(cleanup, cleanupDelayMs);
    }, 80);
  };

  iframe.onload = triggerPrint;

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    cleanup();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  window.setTimeout(triggerPrint, 300);
}
