/**
 * Image-Mode Print Service v5
 * 
 * Bridge v5 is a "dumb" image printer — it only accepts base64 images
 * and sends them to thermal printers via ESC/POS.
 * 
 * Flow: Render component → html2canvas → base64 PNG → POST /print-image
 * 
 * Bridge v5 endpoints:
 *   POST /print-image   { image: "base64...", printerKey: "receipt" }
 *   POST /print-images  { jobs: [{ image, printerKey }] }
 *   POST /test          { printer: "receipt" }
 *   GET  /health
 */

import html2canvas from "html2canvas";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";

const BRIDGE_URL = "http://192.168.1.65:3001";

interface PrintImageResult {
  success: boolean;
  error?: string;
  results?: { printerKey: string; name?: string; success: boolean; error?: string }[];
}

// ──────────────────────────────────────────
// Bridge fetch helpers
// ──────────────────────────────────────────

async function bridgeFetch(path: string, body: any): Promise<any> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors',
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

/** Send a single base64 image to a printer */
async function sendImageToPrinter(base64: string, printerKey: string): Promise<any> {
  return bridgeFetch('/print-image', { image: base64, printerKey });
}

/** Send multiple images to different printers in one call */
async function sendImagesToPrinters(jobs: { image: string; printerKey: string }[]): Promise<any> {
  return bridgeFetch('/print-images', { jobs });
}

// ──────────────────────────────────────────
// Font loading & html2canvas capture
// ──────────────────────────────────────────

let fontLoaded = false;
async function ensureFont() {
  if (fontLoaded) return;

  if (!document.getElementById('receipt-arabic-font')) {
    const link = document.createElement('link');
    link.id = 'receipt-arabic-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  }

  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('400 16px "Noto Sans Arabic"'),
    document.fonts.load('700 16px "Noto Sans Arabic"'),
  ]);
  fontLoaded = true;
}

async function waitForReceiptFonts() {
  await ensureFont();
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function isCanvasBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  try {
    const stepX = Math.max(1, Math.floor(canvas.width / 40));
    const stepY = Math.max(1, Math.floor(canvas.height / 40));
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
        if (a === 0) continue;
        if (r < 250 || g < 250 || b < 250) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function buildCaptureOptions(target: HTMLElement, foreignObjectRendering: boolean) {
  const width = Math.ceil(target.scrollWidth || target.offsetWidth || target.clientWidth);
  const height = Math.ceil(target.scrollHeight || target.offsetHeight || target.clientHeight);
  return {
    backgroundColor: '#ffffff',
    scale: 3,
    logging: false,
    useCORS: true,
    allowTaint: true,
    foreignObjectRendering,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    onclone: (clonedDoc: Document) => {
      clonedDoc.documentElement.setAttribute('dir', 'rtl');
      clonedDoc.documentElement.setAttribute('lang', 'ar');
      const style = clonedDoc.createElement('style');
      style.textContent = `
        * { font-family: 'Noto Sans Arabic', 'Cairo', sans-serif !important; }
        html, body { background: #ffffff !important; direction: rtl !important; unicode-bidi: embed !important; }
      `;
      clonedDoc.head.appendChild(style);
      const clonedTarget = clonedDoc.querySelector('[data-receipt-capture-root="true"]') as HTMLElement | null;
      if (clonedTarget) {
        clonedTarget.style.backgroundColor = '#ffffff';
        clonedTarget.style.direction = 'rtl';
      }
    },
  };
}

/** Capture an on-screen element as base64 PNG */
export async function captureElementAsPng(target: HTMLElement): Promise<string> {
  await waitForReceiptFonts();
  const previousMarker = target.dataset.receiptCaptureRoot;
  target.dataset.receiptCaptureRoot = 'true';
  try {
    const foreignObjectCanvas = await html2canvas(target, buildCaptureOptions(target, true));
    if (!isCanvasBlank(foreignObjectCanvas)) {
      return foreignObjectCanvas.toDataURL('image/png');
    }
    const fallbackCanvas = await html2canvas(target, buildCaptureOptions(target, false));
    return fallbackCanvas.toDataURL('image/png');
  } finally {
    if (previousMarker === undefined) {
      delete target.dataset.receiptCaptureRoot;
    } else {
      target.dataset.receiptCaptureRoot = previousMarker;
    }
  }
}

// ──────────────────────────────────────────
// Off-screen render helper
// ──────────────────────────────────────────

/**
 * Render a React component off-screen and capture it as base64 PNG.
 */
async function renderComponentToImage(
  Component: React.ComponentType<any>,
  props: any,
  width: number = 576,
): Promise<string> {
  const { createRoot } = await import("react-dom/client");
  const { createElement } = await import("react");

  await ensureFont();

  const container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  container.setAttribute('lang', 'ar');
  container.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;background:#fff;direction:rtl;unicode-bidi:embed;`;
  document.body.appendChild(container);

  const root = createRoot(container);

  return new Promise<string>((resolve, reject) => {
    root.render(createElement(Component, props));

    setTimeout(async () => {
      try {
        const target = container.firstElementChild as HTMLElement;
        if (!target) throw new Error('Template not rendered');

        // Make sure element is visible for capture
        target.style.position = 'relative';
        target.style.left = 'auto';

        const base64 = await captureElementAsPng(target);
        root.unmount();
        document.body.removeChild(container);
        resolve(base64);
      } catch (err: any) {
        root.unmount();
        if (container.parentNode) document.body.removeChild(container);
        reject(err);
      }
    }, 600);
  });
}

// ──────────────────────────────────────────
// PRINT FUNCTIONS (render → capture → bridge)
// ──────────────────────────────────────────

/**
 * Print a customer receipt.
 * Renders ReceiptTemplate → captures as PNG → sends to bridge /print-image
 */
export async function printReceiptImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string }
): Promise<PrintImageResult> {
  try {
    const { default: ReceiptTemplate } = await import("@/components/pos/print-templates/ReceiptTemplate");
    
    const base64 = await renderComponentToImage(ReceiptTemplate, {
      order,
      companyName: companyInfo?.name,
      companyPhone: companyInfo?.phone,
      companyAddress: companyInfo?.address,
      taxNumber: companyInfo?.taxNumber,
      terminalName: companyInfo?.terminalName,
      logoUrl: companyInfo?.logoUrl,
    }, 320);

    const result = await sendImageToPrinter(base64, 'receipt');
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printReceiptImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print kitchen tickets — renders each station ticket and sends to its printer.
 */
export async function printKitchenTicketsImage(order: PrintOrder): Promise<PrintImageResult> {
  try {
    const { default: KitchenTicketTemplate } = await import("@/components/pos/print-templates/KitchenTicketTemplate");
    
    const stationPrinters = [
      { key: 'kitchen', name: 'المطبخ' },
      { key: 'grill', name: 'السخان' },
      { key: 'pizza', name: 'البيتزا' },
    ];

    const results: { printerKey: string; name?: string; success: boolean; error?: string }[] = [];

    for (const station of stationPrinters) {
      try {
        const base64 = await renderComponentToImage(KitchenTicketTemplate, {
          order,
          items: order.items,
          stationName: station.name,
        }, 576);

        const result = await sendImageToPrinter(base64, station.key);
        results.push({ printerKey: station.key, name: station.name, ...result });
      } catch (err: any) {
        results.push({ printerKey: station.key, name: station.name, success: false, error: err.message });
      }
    }

    return { success: results.every(r => r.success), results };
  } catch (err: any) {
    console.error('[printKitchenTicketsImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print everything: receipt + all kitchen tickets (batch).
 */
export async function printAllImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string }
): Promise<PrintImageResult> {
  try {
    const { default: ReceiptTemplate } = await import("@/components/pos/print-templates/ReceiptTemplate");
    const { default: KitchenTicketTemplate } = await import("@/components/pos/print-templates/KitchenTicketTemplate");

    const jobs: { image: string; printerKey: string }[] = [];

    // Receipt
    const receiptBase64 = await renderComponentToImage(ReceiptTemplate, {
      order,
      companyName: companyInfo?.name,
      companyPhone: companyInfo?.phone,
      companyAddress: companyInfo?.address,
      taxNumber: companyInfo?.taxNumber,
    }, 320);
    jobs.push({ image: receiptBase64, printerKey: 'receipt' });

    // Kitchen tickets
    const stations = [
      { key: 'kitchen', name: 'المطبخ' },
      { key: 'grill', name: 'السخان' },
      { key: 'pizza', name: 'البيتزا' },
    ];

    for (const station of stations) {
      try {
        const base64 = await renderComponentToImage(KitchenTicketTemplate, {
          order,
          items: order.items,
          stationName: station.name,
        }, 576);
        jobs.push({ image: base64, printerKey: station.key });
      } catch {
        // Skip failed renders
      }
    }

    const result = await sendImagesToPrinters(jobs);
    return { success: result.success, results: result.results, error: result.error };
  } catch (err: any) {
    console.error('[printAllImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print a single kitchen ticket to a specific station.
 */
export async function printStationTicketImage(order: PrintOrder, stationId: string, items: PrintItem[]): Promise<PrintImageResult> {
  const STATION_TO_PRINTER: Record<string, string> = {
    'a09ebd1b-392c-42b2-a8a7-d180fdde1f97': 'kitchen',
    '4f64e6b4-89ab-4e22-b935-52f3ec665e54': 'grill',
    '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516': 'pizza',
  };

  const printerKey = STATION_TO_PRINTER[stationId] || 'kitchen';
  const stationName = printerKey === 'kitchen' ? 'المطبخ'
    : printerKey === 'grill' ? 'السخان'
    : printerKey === 'pizza' ? 'البيتزا'
    : 'المطبخ';

  try {
    const { default: KitchenTicketTemplate } = await import("@/components/pos/print-templates/KitchenTicketTemplate");

    const base64 = await renderComponentToImage(KitchenTicketTemplate, {
      order,
      items,
      stationName,
    }, 576);

    const result = await sendImageToPrinter(base64, printerKey);
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Print a shift summary report.
 * Renders ShiftSummaryTemplate → captures as PNG → sends to receipt printer.
 */
export async function printShiftSummaryImage(data: ShiftSummaryPrintData): Promise<PrintImageResult> {
  try {
    const { default: ShiftSummaryTemplate } = await import("@/components/pos/print-templates/ShiftSummaryTemplate");

    const base64 = await renderComponentToImage(ShiftSummaryTemplate, { data }, 576);
    const result = await sendImageToPrinter(base64, 'receipt');
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printShiftSummaryImage]', err);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────
// BRIDGE CONNECTIVITY
// ──────────────────────────────────────────

/** Check if the print bridge is reachable */
export async function checkBridgeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
      mode: 'cors',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────
// PREVIEW (for download button only)
// ──────────────────────────────────────────

export async function getReceiptPreviewPng(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; terminalName?: string }
): Promise<string> {
  const { default: ReceiptTemplate } = await import("@/components/pos/print-templates/ReceiptTemplate");
  return renderComponentToImage(ReceiptTemplate, {
    order,
    companyName: companyInfo?.name,
    companyPhone: companyInfo?.phone,
    companyAddress: companyInfo?.address,
    taxNumber: companyInfo?.taxNumber,
    terminalName: companyInfo?.terminalName,
  }, 320);
}

export async function getKitchenPreviewPng(
  order: PrintOrder,
  items: PrintItem[],
  stationName: string
): Promise<string> {
  const { default: KitchenTicketTemplate } = await import("@/components/pos/print-templates/KitchenTicketTemplate");
  return renderComponentToImage(KitchenTicketTemplate, {
    order,
    items,
    stationName,
  }, 576);
}
