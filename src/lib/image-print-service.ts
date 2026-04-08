/**
 * Image-Mode Print Service v4
 * 
 * Sends order DATA (JSON) to the print bridge which renders
 * the receipt image server-side using node-canvas.
 * Arabic text is rendered correctly on the server.
 * 
 * html2canvas is kept ONLY for the preview page download button.
 */

import html2canvas from "html2canvas";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";

const BRIDGE_URL = "http://192.168.1.65:3001";

/** Station-to-printer mapping (must match bridge config) */
const STATION_TO_PRINTER: Record<string, string> = {
  'a09ebd1b-392c-42b2-a8a7-d180fdde1f97': 'kitchen',
  '4f64e6b4-89ab-4e22-b935-52f3ec665e54': 'grill',
  '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516': 'pizza',
};

interface PrintImageResult {
  success: boolean;
  error?: string;
  results?: { printerKey: string; name?: string; success: boolean; error?: string }[];
}

// ──────────────────────────────────────────
// Bridge fetch helper
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

async function bridgeFetchPng(path: string, body: any): Promise<string> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors',
    signal: AbortSignal.timeout(15000),
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ──────────────────────────────────────────
// html2canvas capture — ONLY for preview page
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
      const style = clonedDoc.createElement('style');
      style.textContent = `
        * { font-family: 'Noto Sans Arabic', 'Cairo', sans-serif !important; }
        html, body { background: #ffffff !important; }
      `;
      clonedDoc.head.appendChild(style);
      const clonedTarget = clonedDoc.querySelector('[data-receipt-capture-root="true"]') as HTMLElement | null;
      if (clonedTarget) clonedTarget.style.backgroundColor = '#ffffff';
    },
  };
}

/** Capture an on-screen element as PNG (for preview page download only) */
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
// SERVER-SIDE PRINT (JSON → bridge → node-canvas)
// ──────────────────────────────────────────

/**
 * Print a customer receipt via server-side rendering.
 */
export async function printReceiptImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string }
): Promise<PrintImageResult> {
  try {
    const result = await bridgeFetch('/print-receipt', {
      order,
      companyInfo: companyInfo || {},
      printer: 'receipt',
    });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printReceiptImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print kitchen tickets — sends to all station printers.
 */
export async function printKitchenTicketsImage(order: PrintOrder): Promise<PrintImageResult> {
  try {
    const stationPrinters = [
      { key: 'kitchen', name: 'المطبخ' },
      { key: 'grill', name: 'السخان' },
      { key: 'pizza', name: 'البيتزا' },
    ];

    const results: { printerKey: string; name?: string; success: boolean; error?: string }[] = [];

    for (const station of stationPrinters) {
      try {
        const result = await bridgeFetch('/print-kitchen', {
          order,
          items: order.items,
          printerKey: station.key,
          stationName: station.name,
        });
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
 * Print everything: receipt + all kitchen tickets.
 */
export async function printAllImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string }
): Promise<PrintImageResult> {
  try {
    const result = await bridgeFetch('/print-all', { order, companyInfo: companyInfo || {} });
    return {
      success: result.success,
      results: result.results,
      error: result.error,
    };
  } catch (err: any) {
    console.error('[printAllImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print a single kitchen ticket to a specific station.
 */
export async function printStationTicketImage(order: PrintOrder, stationId: string, items: PrintItem[]): Promise<PrintImageResult> {
  const printerKey = STATION_TO_PRINTER[stationId] || 'kitchen';
  const stationName = printerKey === 'kitchen' ? 'المطبخ'
    : printerKey === 'grill' ? 'السخان'
    : printerKey === 'pizza' ? 'البيتزا'
    : 'المطبخ';

  try {
    const result = await bridgeFetch('/print-kitchen', {
      order,
      items,
      printerKey,
      stationName,
    });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Print a shift summary report.
 */
export async function printShiftSummaryImage(data: ShiftSummaryPrintData): Promise<PrintImageResult> {
  // Shift summary still uses html2canvas since it's a complex report
  // TODO: Add /print-shift-summary route to bridge v4
  try {
    const { createRoot } = await import("react-dom/client");
    const { createElement } = await import("react");
    const { default: ShiftSummaryTemplate } = await import("@/components/pos/print-templates/ShiftSummaryTemplate");

    await ensureFont();
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    const root = createRoot(container);

    return new Promise<PrintImageResult>((resolve) => {
      root.render(createElement(ShiftSummaryTemplate, { data }));

      setTimeout(async () => {
        try {
          const target = container.firstElementChild as HTMLElement;
          if (!target) throw new Error('Template not rendered');

          const base64 = await captureElementAsPng(target);
          root.unmount();
          document.body.removeChild(container);

          // Send to bridge legacy endpoint
          const res = await fetch(`${BRIDGE_URL}/print-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, printerKey: 'receipt' }),
            mode: 'cors',
            signal: AbortSignal.timeout(15000),
          });
          const result = await res.json();
          resolve({ success: result.success, error: result.error });
        } catch (err: any) {
          resolve({ success: false, error: err.message });
        }
      }, 600);
    });
  } catch (err: any) {
    console.error('[printShiftSummaryImage]', err);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────
// PREVIEW (server-side PNG for download)
// ──────────────────────────────────────────

/**
 * Get a server-rendered PNG of the receipt for preview/download.
 * Returns an object URL that can be used as image src or download href.
 */
export async function getReceiptPreviewPng(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; terminalName?: string }
): Promise<string> {
  return bridgeFetchPng('/preview-receipt', { order, companyInfo: companyInfo || {} });
}

/**
 * Get a server-rendered PNG of a kitchen ticket for preview.
 */
export async function getKitchenPreviewPng(
  order: PrintOrder,
  items: PrintItem[],
  stationName: string
): Promise<string> {
  return bridgeFetchPng('/preview-kitchen', { order, items, stationName });
}
