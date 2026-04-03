/**
 * Image-Mode Print Service
 * 
 * Renders receipt/ticket as HTML → captures with html2canvas → sends base64 image to bridge.
 * This bypasses all ESC/POS text encoding issues and guarantees perfect Arabic rendering.
 */

import html2canvas from "html2canvas";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import KitchenTicketTemplate from "@/components/pos/print-templates/KitchenTicketTemplate";
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
 */
async function renderToImage(element: React.ReactElement): Promise<string> {
  // Create container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  // Render React element
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
          scale: 1, // 1:1 pixel mapping for thermal printers
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
    }, 200); // Small delay for React render + font loading
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
 * Print kitchen tickets — groups items by station and sends each to the correct printer.
 */
export async function printKitchenTicketsImage(order: PrintOrder): Promise<PrintImageResult> {
  try {
    // Group items by station
    const stationGroups: Record<string, PrintItem[]> = {};

    (order.items || []).forEach(item => {
      const stations = item.print_station_ids || (item.stationId ? [item.stationId] : []);
      const targets = stations.length > 0 ? stations : ['__default__'];

      targets.forEach(sid => {
        if (!stationGroups[sid]) stationGroups[sid] = [];
        stationGroups[sid].push(item);
      });
    });

    const results: { printerKey: string; name?: string; success: boolean; error?: string }[] = [];

    for (const [stationId, items] of Object.entries(stationGroups)) {
      const printerKey = stationId === '__default__' ? 'kitchen' : (STATION_TO_PRINTER[stationId] || 'kitchen');
      
      const stationName = printerKey === 'kitchen' ? 'المطبخ'
        : printerKey === 'grill' ? 'السخان'
        : printerKey === 'pizza' ? 'البيتزا'
        : 'المطبخ';

      const element = createElement(KitchenTicketTemplate, {
        order,
        items,
        stationName,
      });

      const image = await renderToImage(element);
      const result = await sendImageToBridge(image, printerKey);
      results.push({ printerKey, name: stationName, ...result });
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
 * Print everything: receipt + all kitchen tickets (routed by station).
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
