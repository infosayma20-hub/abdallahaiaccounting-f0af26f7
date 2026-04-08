/**
 * Image-Mode Print Service
 * 
 * Renders receipt/ticket as HTML → captures with html2canvas → sends base64 image to bridge.
 * Uses scale:2 for sharp text on thermal printers. Font: Tahoma (system font, connected Arabic).
 */

import html2canvas from "html2canvas";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import KitchenTicketTemplate from "@/components/pos/print-templates/KitchenTicketTemplate";
import ShiftSummaryTemplate from "@/components/pos/print-templates/ShiftSummaryTemplate";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";

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

/**
 * Renders a React element off-screen, captures it with html2canvas,
 * and returns a base64 PNG string.
 * Scale: 2 for sharper output on thermal printers.
 */
let fontLoaded = false;
async function ensureFont() {
  if (fontLoaded) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&display=swap';
  document.head.appendChild(link);
  // Force-load the font so html2canvas picks it up
  const testEl = document.createElement('span');
  testEl.style.fontFamily = "'Noto Sans Arabic'";
  testEl.style.position = 'absolute';
  testEl.style.left = '-9999px';
  testEl.textContent = 'تحميل الخط';
  document.body.appendChild(testEl);
  await document.fonts.ready;
  document.body.removeChild(testEl);
  fontLoaded = true;
}

async function renderToImage(element: React.ReactElement): Promise<string> {
  await ensureFont();

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const root = createRoot(container);
  
  return new Promise<string>((resolve, reject) => {
    root.render(element);
    
    // Wait for fonts + render
    setTimeout(async () => {
      try {
        await document.fonts.ready;
        
        const target = container.firstElementChild as HTMLElement;
        if (!target) throw new Error('Template not rendered');

        const canvas = await html2canvas(target, {
          backgroundColor: '#ffffff',
          scale: 2, // 2x for sharp text on thermal printers
          logging: false,
          useCORS: true,
          allowTaint: true,
        });

        const base64 = canvas.toDataURL('image/png');
        
        root.unmount();
        document.body.removeChild(container);
        
        resolve(base64);
      } catch (err) {
        root.unmount();
        document.body.removeChild(container);
        reject(err);
      }
    }, 400); // Delay for Noto Sans Arabic font loading
  });
}

/**
 * Send a base64 image to a specific printer via the bridge.
 */
async function sendImageToBridge(image: string, printerKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/print-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, printerKey }),
      mode: 'cors',
      signal: AbortSignal.timeout(15000),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Bridge connection failed' };
  }
}

/**
 * Print a customer receipt (80mm printer).
 */
export async function printReceiptImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string }
): Promise<PrintImageResult> {
  try {
    const element = createElement(ReceiptTemplate, {
      order,
      companyName: companyInfo?.name,
      companyPhone: companyInfo?.phone,
      companyAddress: companyInfo?.address,
      taxNumber: companyInfo?.taxNumber,
      logoUrl: companyInfo?.logoUrl,
      terminalName: companyInfo?.terminalName,
    });

    const image = await renderToImage(element);
    const result = await sendImageToBridge(image, 'receipt');

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
    const allItems = order.items || [];
    const stationPrinters: { key: string; name: string }[] = [
      { key: 'kitchen', name: 'المطبخ' },
      { key: 'grill', name: 'السخان' },
      { key: 'pizza', name: 'البيتزا' },
    ];

    const results: { printerKey: string; name?: string; success: boolean; error?: string }[] = [];

    for (const station of stationPrinters) {
      const element = createElement(KitchenTicketTemplate, {
        order,
        items: allItems,
        stationName: station.name,
      });

      const image = await renderToImage(element);
      const result = await sendImageToBridge(image, station.key);
      results.push({ printerKey: station.key, name: station.name, ...result });
    }

    return {
      success: results.every(r => r.success),
      results,
    };
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
  const [receiptResult, kitchenResult] = await Promise.all([
    printReceiptImage(order, companyInfo),
    printKitchenTicketsImage(order),
  ]);

  const allResults = [
    { printerKey: 'receipt', name: 'الوصل', success: receiptResult.success, error: receiptResult.error },
    ...(kitchenResult.results || []),
  ];

  return {
    success: allResults.every(r => r.success),
    results: allResults,
  };
}

/**
 * Print a single kitchen ticket to a specific station (by stationId).
 */
export async function printStationTicketImage(order: PrintOrder, stationId: string, items: PrintItem[]): Promise<PrintImageResult> {
  const printerKey = STATION_TO_PRINTER[stationId] || 'kitchen';
  const stationName = printerKey === 'kitchen' ? 'المطبخ'
    : printerKey === 'grill' ? 'السخان'
    : printerKey === 'pizza' ? 'البيتزا'
    : 'المطبخ';

  try {
    const element = createElement(KitchenTicketTemplate, { order, items, stationName });
    const image = await renderToImage(element);
    const result = await sendImageToBridge(image, printerKey);
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Print a shift summary report (80mm printer).
 */
export async function printShiftSummaryImage(data: ShiftSummaryPrintData): Promise<PrintImageResult> {
  try {
    const element = createElement(ShiftSummaryTemplate, { data });
    const image = await renderToImage(element);
    const result = await sendImageToBridge(image, 'receipt');
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printShiftSummaryImage]', err);
    return { success: false, error: err.message };
  }
}
