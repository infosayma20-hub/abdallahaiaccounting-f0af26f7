/**
 * Print Service v6 — Server-side rendering via Print Bridge v6
 * 
 * No more html2canvas! The bridge builds receipts/tickets as SVG server-side.
 * 
 * Endpoints:
 *   POST /print-receipt  → JSON order → bridge renders & prints
 *   POST /print-kitchen  → JSON order + printerKey → bridge renders & prints
 *   POST /print-shift    → JSON session → bridge renders & prints
 *   GET  /health
 */

import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";

const BRIDGE_URL = "http://192.168.1.65:3001";

interface PrintImageResult {
  success: boolean;
  error?: string;
  results?: { printerKey: string; name?: string; success: boolean; error?: string }[];
}

/** Kitchen job — a filtered set of items for one station printer */
export interface KitchenJob {
  printerKey: string;
  stationLabel: string;
  items: PrintItem[];
}

// ──────────────────────────────────────────
// Bridge fetch helper
// ──────────────────────────────────────────

async function bridgeFetch(path: string, body: any, timeout = 15000): Promise<any> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors',
    signal: AbortSignal.timeout(timeout),
  });
  return res.json();
}

// ──────────────────────────────────────────
// Map PrintOrder → Bridge v6 receipt JSON
// ──────────────────────────────────────────

function toBridgeReceiptOrder(order: PrintOrder, companyInfo?: {
  name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string;
}) {
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    branchName: order.branchName,
    companyName: companyInfo?.name || order.branchName,
    companyPhone: companyInfo?.phone,
    taxNumber: companyInfo?.taxNumber,
    cashierName: order.cashier,
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      notes: [
        item.note,
        ...(item.modifiers?.map(m => m.option_name) || []),
      ].filter(Boolean).join('، ') || undefined,
    })),
    total: order.total,
    discount: order.discount,
    tax: 0,
    paymentMethod: order.paymentMethod,
    cashReceived: order.tenderedAmount,
    change: order.change,
    createdAt: order.date ? `${order.date}T${order.time || '00:00'}` : new Date().toISOString(),
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    foreignAmount: order.foreignAmount,
    subtotal: order.subtotal,
    orderNote: order.orderNote,
    terminalName: companyInfo?.terminalName,
  };
}

// ──────────────────────────────────────────
// Station mapping
// ──────────────────────────────────────────

export const STATION_TO_PRINTER: Record<string, { key: string; label: string }> = {
  'a09ebd1b-392c-42b2-a8a7-d180fdde1f97': { key: 'kitchen', label: 'المطبخ' },
  '4f64e6b4-89ab-4e22-b935-52f3ec665e54': { key: 'grill', label: 'السخان' },
  '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516': { key: 'pizza', label: 'البيتزا' },
};

const ALL_STATIONS = [
  { key: 'kitchen', label: 'المطبخ' },
  { key: 'grill', label: 'السخان' },
  { key: 'pizza', label: 'البيتزا' },
];

function toBridgeKitchenOrder(order: PrintOrder, items: PrintItem[]) {
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    branchName: order.branchName,
    cashierName: order.cashier,
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    items: items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      notes: [
        item.note,
        ...(item.modifiers?.map(m => m.option_name) || []),
      ].filter(Boolean).join('، ') || undefined,
    })),
    total: order.total,
    createdAt: order.date ? `${order.date}T${order.time || '00:00'}` : new Date().toISOString(),
    orderNote: order.orderNote,
  };
}

// ──────────────────────────────────────────
// PRINT FUNCTIONS
// ──────────────────────────────────────────

/**
 * Print a customer receipt via bridge v6 server-side rendering.
 */
export async function printReceiptImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string }
): Promise<PrintImageResult> {
  try {
    const bridgeOrder = toBridgeReceiptOrder(order, companyInfo);
    const result = await bridgeFetch('/print-receipt', { order: bridgeOrder });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printReceiptImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print kitchen tickets — sends to all station printers (unfiltered).
 * Prefer printAllImage() with kitchenJobs for filtered station printing.
 */
export async function printKitchenTicketsImage(order: PrintOrder): Promise<PrintImageResult> {
  try {
    const promises = ALL_STATIONS.map(async (station) => {
      try {
        const kitchenOrder = toBridgeKitchenOrder(order, order.items);
        const result = await bridgeFetch('/print-kitchen', {
          order: kitchenOrder,
          printerKey: station.key,
          stationLabel: station.label,
        });
        return { printerKey: station.key, name: station.label, success: result.success, error: result.error };
      } catch (err: any) {
        return { printerKey: station.key, name: station.label, success: false, error: err.message };
      }
    });

    const results = await Promise.all(promises);
    return { success: results.every(r => r.success), results };
  } catch (err: any) {
    console.error('[printKitchenTicketsImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print everything: receipt + filtered kitchen tickets — all in parallel.
 * 
 * @param order       — The full order for receipt printing
 * @param companyInfo — Company details for receipt header
 * @param kitchenJobs — Optional filtered jobs per station. If omitted, sends all items to all stations (legacy).
 */
export async function printAllImage(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; terminalName?: string },
  kitchenJobs?: KitchenJob[],
): Promise<PrintImageResult> {
  try {
    // Build all print promises in parallel
    const promises: Promise<{ printerKey: string; name: string; success: boolean; error?: string }>[] = [];

    // Receipt
    promises.push(
      bridgeFetch('/print-receipt', { order: toBridgeReceiptOrder(order, companyInfo) })
        .then((r: any) => ({ printerKey: 'receipt', name: 'الوصل', success: r.success, error: r.error }))
        .catch((err: any) => ({ printerKey: 'receipt', name: 'الوصل', success: false, error: err.message }))
    );

    // Kitchen tickets — use filtered jobs if provided, otherwise send all items to all stations
    const jobs = kitchenJobs && kitchenJobs.length > 0
      ? kitchenJobs
      : ALL_STATIONS.map(s => ({ printerKey: s.key, stationLabel: s.label, items: order.items }));

    for (const job of jobs) {
      if (job.items.length === 0) continue; // Skip empty stations
      promises.push(
        bridgeFetch('/print-kitchen', {
          order: toBridgeKitchenOrder(order, job.items),
          printerKey: job.printerKey,
          stationLabel: job.stationLabel,
        })
          .then((r: any) => ({ printerKey: job.printerKey, name: job.stationLabel, success: r.success, error: r.error }))
          .catch((err: any) => ({ printerKey: job.printerKey, name: job.stationLabel, success: false, error: err.message }))
      );
    }

    const allResults = await Promise.all(promises);
    return {
      success: allResults.filter(r => r.printerKey === 'receipt').every(r => r.success),
      results: allResults,
    };
  } catch (err: any) {
    console.error('[printAllImage]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Print a single kitchen ticket to a specific station.
 */
export async function printStationTicketImage(
  order: PrintOrder,
  stationId: string,
  items: PrintItem[]
): Promise<PrintImageResult> {
  const station = STATION_TO_PRINTER[stationId] || { key: 'kitchen', label: 'المطبخ' };

  try {
    const kitchenOrder = toBridgeKitchenOrder(order, items);
    const result = await bridgeFetch('/print-kitchen', {
      order: kitchenOrder,
      printerKey: station.key,
      stationLabel: station.label,
    });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Print a shift summary report via bridge v6.
 */
export async function printShiftSummaryImage(data: ShiftSummaryPrintData): Promise<PrintImageResult> {
  try {
    const session = {
      branchName: data.companyName,
      cashierName: data.cashierName,
      terminalName: data.terminalName,
      cashBoxName: data.cashBoxName,
      sessionStart: data.openedAt,
      sessionEnd: data.closedAt,
      totalOrders: data.totalOrders,
      totalSales: data.totalSales,
      totalExpenses: data.totalExpenses || 0,
      cashSales: data.paymentMethodBreakdown?.cash?.ILS || 0,
      cardSales: data.paymentMethodBreakdown?.card?.ILS || 0,
      openingBalance: data.openingCash,
      closingBalance: data.closingCash,
      closingCashUSD: data.closingCashUSD,
      closingCashJOD: data.closingCashJOD,
      expectedCash: data.expectedCash,
      expectedCashUSD: data.expectedCashUSD,
      expectedCashJOD: data.expectedCashJOD,
      difference: data.variance,
      varianceILS: data.varianceILS,
      varianceUSD: data.varianceUSD,
      varianceJOD: data.varianceJOD,
      currencyBreakdown: data.currencyBreakdown,
      paymentMethodBreakdown: data.paymentMethodBreakdown,
    };

    const result = await bridgeFetch('/print-shift', { session });
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
// LEGACY: captureElementAsPng (kept for PrintPreviewPage download)
// ──────────────────────────────────────────

/** Capture an on-screen element as base64 PNG using canvas */
export async function captureElementAsPng(target: HTMLElement): Promise<string> {
  const canvas = document.createElement('canvas');
  const rect = target.getBoundingClientRect();
  const scale = 3;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const data = new XMLSerializer().serializeToString(target);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">${data}</div>
    </foreignObject>
  </svg>`;
  const img = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ──────────────────────────────────────────
// PREVIEW (for download button only)
// ──────────────────────────────────────────

export async function getReceiptPreviewPng(
  order: PrintOrder,
  companyInfo?: { name?: string; phone?: string; address?: string; taxNumber?: string; terminalName?: string }
): Promise<string> {
  const { createRoot } = await import("react-dom/client");
  const { createElement } = await import("react");
  const { default: ReceiptTemplate } = await import("@/components/pos/print-templates/ReceiptTemplate");

  const container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:320px;background:#fff;direction:rtl;';
  document.body.appendChild(container);

  const root = createRoot(container);

  return new Promise<string>((resolve, reject) => {
    root.render(createElement(ReceiptTemplate, {
      order,
      companyName: companyInfo?.name,
      companyPhone: companyInfo?.phone,
      companyAddress: companyInfo?.address,
      taxNumber: companyInfo?.taxNumber,
      terminalName: companyInfo?.terminalName,
    }));

    setTimeout(async () => {
      try {
        const target = container.firstElementChild as HTMLElement;
        if (!target) throw new Error('Template not rendered');
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

export async function getKitchenPreviewPng(
  order: PrintOrder,
  items: PrintItem[],
  stationName: string
): Promise<string> {
  const { createRoot } = await import("react-dom/client");
  const { createElement } = await import("react");
  const { default: KitchenTicketTemplate } = await import("@/components/pos/print-templates/KitchenTicketTemplate");

  const container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:576px;background:#fff;direction:rtl;';
  document.body.appendChild(container);

  const root = createRoot(container);

  return new Promise<string>((resolve, reject) => {
    root.render(createElement(KitchenTicketTemplate, { order, items, stationName }));

    setTimeout(async () => {
      try {
        const target = container.firstElementChild as HTMLElement;
        if (!target) throw new Error('Template not rendered');
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
