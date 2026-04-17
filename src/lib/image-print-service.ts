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
import { logPrintStart, logPrintFinish, type PrintMode } from "@/lib/print-diagnostics";

const BRIDGE_URL = "http://192.168.1.65:3001";

// ──────────────────────────────────────────
// Print Mode (raster | text) — persisted in localStorage
// ──────────────────────────────────────────

const PRINT_MODE_KEY = 'pos-print-mode';

export function getPrintMode(): PrintMode {
  try {
    const v = localStorage.getItem(PRINT_MODE_KEY);
    return v === 'text' ? 'text' : 'raster';
  } catch {
    return 'raster';
  }
}

export function setPrintMode(mode: PrintMode): void {
  try { localStorage.setItem(PRINT_MODE_KEY, mode); } catch {/* ignore */}
}

interface PrintImageResult {
  success: boolean;
  error?: string;
  results?: { printerKey: string; name?: string; success: boolean; error?: string }[];
}

/** Build diagnostic meta payload sent with every print request */
function buildMeta(receiptType: string, opts: { itemsCount?: number; estimatedHeight?: number; debug?: boolean } = {}) {
  return {
    type: receiptType,
    printMode: getPrintMode(),
    debug: opts.debug ?? false,
    itemsCount: opts.itemsCount,
    estimatedHeight: opts.estimatedHeight,
    timestamp: new Date().toISOString(),
    client: 'pos-web',
  };
}

/** Estimate receipt height in px from items count (rough heuristic) */
function estimateReceiptHeight(itemsCount: number): number {
  // header ~280 + footer ~220 + ~70 per item @ font 17px
  return 500 + itemsCount * 70;
}

/** Kitchen job — a filtered set of items for one station printer */
export interface KitchenJob {
  printerKey: string;
  stationLabel: string;
  items: PrintItem[];
}

// ──────────────────────────────────────────
// Bridge fetch helper (with diagnostics logging)
// ──────────────────────────────────────────

async function bridgeFetch(
  path: string,
  body: any,
  diag: { receiptType: string; itemsCount?: number; estimatedHeight?: number },
  timeout = 15000,
): Promise<any> {
  const payloadStr = JSON.stringify(body);
  const logId = logPrintStart({
    endpoint: path,
    receiptType: diag.receiptType,
    printMode: getPrintMode(),
    itemsCount: diag.itemsCount,
    estimatedHeight: diag.estimatedHeight,
    payloadBytes: payloadStr.length,
  });
  const t0 = performance.now();
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr,
      mode: 'cors',
      signal: AbortSignal.timeout(timeout),
    });
    const json = await res.json();
    const durationMs = Math.round(performance.now() - t0);
    logPrintFinish(logId, json.success ? 'sent' : 'failed', {
      durationMs,
      responsePayload: json,
      errorMessage: json.success ? undefined : json.error,
    });
    return json;
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);
    const isUnreachable = err.name === 'TimeoutError' || err.message?.includes('Failed to fetch');
    logPrintFinish(logId, isUnreachable ? 'bridge_unreachable' : 'failed', {
      durationMs,
      errorMessage: err.message,
    });
    throw err;
  }
}

// ──────────────────────────────────────────
// Map PrintOrder → Bridge v6 receipt JSON
// ──────────────────────────────────────────

/**
 * Normalize orderType to one of: dine_in | takeaway | delivery
 * Handles legacy Arabic values and tableNumber inference.
 */
function normalizeOrderType(rawType: string | undefined, tableNumber: string | undefined): 'dine_in' | 'takeaway' | 'delivery' {
  const t = (rawType || '').toString().trim().toLowerCase();
  // Direct matches
  if (t === 'delivery' || t === 'توصيل' || t === 'دليفري') return 'delivery';
  if (t === 'takeaway' || t === 'تيك اواي' || t === 'تيك أواي' || t === 'استلام' || t === 'سفري') return 'takeaway';
  if (t === 'dine_in' || t === 'dine-in' || t === 'محلي' || t === 'صالة' || t === 'في المحل') return 'dine_in';
  // Inference: if table number exists and type unclear → dine_in
  if (tableNumber && tableNumber.trim()) return 'dine_in';
  // Default fallback
  return 'takeaway';
}

/**
 * Map normalized type → Arabic label for printing.
 * Bridge will fallback to this label if it doesn't recognize the raw value.
 */
function orderTypeLabel(normalized: 'dine_in' | 'takeaway' | 'delivery'): string {
  if (normalized === 'delivery') return 'توصيل';
  if (normalized === 'takeaway') return 'استلام';
  return 'محلي';
}

function toBridgeReceiptOrder(order: PrintOrder, companyInfo?: {
  name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string;
}) {
  const normalizedType = normalizeOrderType(order.orderType, order.tableNumber);
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    branchName: order.branchName,
    companyName: companyInfo?.name || order.branchName,
    companyPhone: companyInfo?.phone,
    taxNumber: companyInfo?.taxNumber,
    cashierName: order.cashier,
    orderType: normalizedType,
    orderTypeLabel: orderTypeLabel(normalizedType),
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
  const normalizedType = normalizeOrderType(order.orderType, order.tableNumber);
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    branchName: order.branchName,
    cashierName: order.cashier,
    orderType: normalizedType,
    orderTypeLabel: orderTypeLabel(normalizedType),
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
    const itemsCount = order.items?.length || 0;
    const meta = buildMeta('cashier_receipt', { itemsCount, estimatedHeight: estimateReceiptHeight(itemsCount) });
    const result = await bridgeFetch(
      '/print-receipt',
      { order: bridgeOrder, meta },
      { receiptType: 'cashier_receipt', itemsCount, estimatedHeight: meta.estimatedHeight },
    );
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
        const itemsCount = order.items?.length || 0;
        const meta = buildMeta(`kitchen_${station.key}`, { itemsCount });
        const result = await bridgeFetch(
          '/print-kitchen',
          { order: kitchenOrder, printerKey: station.key, stationLabel: station.label, meta },
          { receiptType: `kitchen_${station.key}`, itemsCount },
        );
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
    const receiptOrder = toBridgeReceiptOrder(order, companyInfo);
    const kitchenOrder = toBridgeKitchenOrder(order, order.items);
    const itemsCount = order.items?.length || 0;
    const receiptMeta = buildMeta('cashier_receipt', { itemsCount, estimatedHeight: estimateReceiptHeight(itemsCount) });
    const kitchenMeta = (key: string) => buildMeta(`kitchen_${key}`, { itemsCount });

    const results = await Promise.all([
      bridgeFetch('/print-receipt', { order: receiptOrder, meta: receiptMeta }, { receiptType: 'cashier_receipt', itemsCount, estimatedHeight: receiptMeta.estimatedHeight })
        .then((r: any) => ({ printerKey: 'receipt', name: 'الوصل', success: r.success, error: r.error }))
        .catch((err: any) => ({ printerKey: 'receipt', name: 'الوصل', success: false, error: err.message })),
      bridgeFetch('/print-kitchen', { order: kitchenOrder, printerKey: 'kitchen', stationLabel: 'المطبخ', meta: kitchenMeta('kitchen') }, { receiptType: 'kitchen_kitchen', itemsCount })
        .then((r: any) => ({ printerKey: 'kitchen', name: 'المطبخ', success: r.success, error: r.error }))
        .catch((err: any) => ({ printerKey: 'kitchen', name: 'المطبخ', success: false, error: err.message })),
      bridgeFetch('/print-kitchen', { order: kitchenOrder, printerKey: 'grill', stationLabel: 'السخان', meta: kitchenMeta('grill') }, { receiptType: 'kitchen_grill', itemsCount })
        .then((r: any) => ({ printerKey: 'grill', name: 'السخان', success: r.success, error: r.error }))
        .catch((err: any) => ({ printerKey: 'grill', name: 'السخان', success: false, error: err.message })),
      bridgeFetch('/print-kitchen', { order: kitchenOrder, printerKey: 'pizza', stationLabel: 'البيتزا', meta: kitchenMeta('pizza') }, { receiptType: 'kitchen_pizza', itemsCount })
        .then((r: any) => ({ printerKey: 'pizza', name: 'البيتزا', success: r.success, error: r.error }))
        .catch((err: any) => ({ printerKey: 'pizza', name: 'البيتزا', success: false, error: err.message })),
    ]);

    return {
      success: results.every(r => r.success),
      results,
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
    const itemsCount = items?.length || 0;
    const meta = buildMeta(`kitchen_${station.key}`, { itemsCount });
    const result = await bridgeFetch(
      '/print-kitchen',
      { order: kitchenOrder, printerKey: station.key, stationLabel: station.label, meta },
      { receiptType: `kitchen_${station.key}`, itemsCount },
    );
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

    const meta = buildMeta('shift_summary');
    const result = await bridgeFetch('/print-shift', { session, meta }, { receiptType: 'shift_summary' });
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
// DIAGNOSTIC TEST ENDPOINTS
// ──────────────────────────────────────────

/** Test 1: minimal text-only receipt — uses real /print-receipt endpoint */
export async function testPrintText(): Promise<PrintImageResult> {
  try {
    const order = {
      orderNumber: 9001,
      queueNumber: 9001,
      companyName: "اختبار النص",
      cashierName: "اختبار",
      orderType: "takeaway" as const,
      orderTypeLabel: "استلام",
      items: [{ name: "Hello 123 - اختبار", quantity: 1, unitPrice: 1 }],
      total: 1,
      subtotal: 1,
      tax: 0,
      paymentMethod: "نقد",
      createdAt: new Date().toISOString(),
      currency: "ILS",
    };
    const meta = buildMeta('test_text', { itemsCount: 1, debug: true });
    const result = await bridgeFetch('/print-receipt', { order, meta }, { receiptType: 'test_text', itemsCount: 1 });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Test 2: kitchen ticket — isolates the kitchen printer pipeline */
export async function testPrintLogo(): Promise<PrintImageResult> {
  try {
    const order = {
      orderNumber: 9002,
      queueNumber: 9002,
      cashierName: "اختبار",
      orderType: "takeaway" as const,
      orderTypeLabel: "استلام",
      items: [{ name: "اختبار طابعة المطبخ", quantity: 1, unitPrice: 0 }],
      total: 0,
      createdAt: new Date().toISOString(),
    };
    const meta = buildMeta('test_kitchen', { itemsCount: 1, debug: true });
    const result = await bridgeFetch(
      '/print-kitchen',
      { order, printerKey: 'kitchen', stationLabel: 'المطبخ', meta },
      { receiptType: 'test_kitchen', itemsCount: 1 },
    );
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Test 3: full sample receipt with multiple items via real /print-receipt */
export async function testPrintReceipt(): Promise<PrintImageResult> {
  try {
    const order = {
      orderNumber: 9003,
      queueNumber: 9003,
      companyName: "مطعم الملكي - اختبار",
      cashierName: "اختبار",
      orderType: "delivery" as const,
      orderTypeLabel: "توصيل",
      items: [
        { name: "اجنحة 30 قطعة مشوي", quantity: 1, unitPrice: 75 },
        { name: "بيتزا شاورما", quantity: 2, unitPrice: 22 },
        { name: "بيبسي 1 لتر", quantity: 1, unitPrice: 8 },
      ],
      subtotal: 127,
      total: 127,
      tax: 0,
      paymentMethod: "نقد",
      cashReceived: 130,
      change: 3,
      createdAt: new Date().toISOString(),
      currency: "ILS",
    };
    const meta = buildMeta('test_receipt', { itemsCount: 3, estimatedHeight: estimateReceiptHeight(3), debug: true });
    const result = await bridgeFetch('/print-receipt', { order, meta }, { receiptType: 'test_receipt', itemsCount: 3, estimatedHeight: meta.estimatedHeight });
    return { success: result.success, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
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
