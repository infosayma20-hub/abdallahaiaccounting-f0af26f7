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
import { getBridgeUrl, getDeviceBranchId } from "@/lib/device-config";
import { supabase } from "@/integrations/supabase/client";
import { getLocalNetworkBlockedMessage, withLocalNetworkAccess } from "@/lib/local-network-fetch";

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

// ──────────────────────────────────────────
// Footer Mode (full | compact | off) — temporary mitigation for raster corruption
// "compact" hides QR + extra footer text, keeping only essential receipt body.
// "off" removes ALL post-payment content. Default: 'compact' until bridge patch is applied.
// ──────────────────────────────────────────

export type FooterMode = 'full' | 'compact' | 'off';
const FOOTER_MODE_KEY = 'pos-receipt-footer-mode';

export function getFooterMode(): FooterMode {
  try {
    const v = localStorage.getItem(FOOTER_MODE_KEY);
    if (v === 'full' || v === 'off') return v;
    return 'compact'; // default — safe until bridge patch lands
  } catch {
    return 'compact';
  }
}

export function setFooterMode(mode: FooterMode): void {
  try { localStorage.setItem(FOOTER_MODE_KEY, mode); } catch {/* ignore */}
}

interface PrintImageResult {
  success: boolean;
  error?: string;
  results?: { printerKey: string; name?: string; success: boolean; error?: string }[];
}

// ──────────────────────────────────────────
// Anti-duplicate guard (frontend layer)
// Prevents rapid re-fires from F9/button double-clicks or retry loops.
// key = `${endpoint}|${orderNumber}|${printerKey}`  — kept for 60 seconds.
// ──────────────────────────────────────────
const _recentPrintJobs = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 60_000;

function _shouldBlockDuplicate(key: string): boolean {
  const now = Date.now();
  // Garbage-collect stale entries
  for (const [k, t] of _recentPrintJobs) {
    if (now - t > DUPLICATE_WINDOW_MS) _recentPrintJobs.delete(k);
  }
  const last = _recentPrintJobs.get(key);
  if (last && now - last < DUPLICATE_WINDOW_MS) {
    console.warn(`[frontend-print-blocked-duplicate] key=${key} — fired ${now - last}ms ago`);
    return true;
  }
  _recentPrintJobs.set(key, now);
  return false;
}

// ──────────────────────────────────────────
// In-flight guard: prevents concurrent print calls for the SAME job key
// (e.g. user double-clicks payment button before first request returns).
// Independent from the 60s time-based dedupe above.
// ──────────────────────────────────────────
const _inFlightJobs = new Set<string>();

function _markInFlight(key: string): boolean {
  if (_inFlightJobs.has(key)) {
    console.warn(`[frontend-print-blocked-in-progress] key=${key} — already in-flight`);
    return false;
  }
  _inFlightJobs.add(key);
  return true;
}

function _clearInFlight(key: string): void {
  _inFlightJobs.delete(key);
}

// ──────────────────────────────────────────
// Shared receipt dedupe key.
// Both printReceiptImage() and the receipt sub-job inside printAllImage()
// hit the SAME physical /print-receipt endpoint, so they must share a
// single dedupe key — otherwise a payment-success path that calls
// printAllImage() followed by any receipt-only path (dialog auto-print,
// retry, etc.) prints the customer receipt twice.
//
// The key normalizes the order number (strips a trailing all-zero pad
// like "000005" → "5") so display-formatting changes don't accidentally
// create a new key and bypass the guard.
// ──────────────────────────────────────────
function _normalizeOrderNumberForKey(raw: any): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'noorder';
  // If the WHOLE value is digits, drop leading zeros ("000005" → "5", "0" → "0")
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, '');
  // If the last "-" segment is digits, normalize that segment only
  // ("POS-20260602-0005" → "POS-20260602-5")
  const parts = s.split('-');
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d+$/.test(last)) {
    parts[parts.length - 1] = last.replace(/^0+(?=\d)/, '');
    return parts.join('-');
  }
  return s;
}

function _receiptSharedKey(order: { orderNumber?: any; id?: string }): string {
  return `receipt-shared|${_normalizeOrderNumberForKey(order.orderNumber)}|${order.id || 'noid'}`;
}

/** Build diagnostic meta payload sent with every print request */
function buildMeta(receiptType: string, opts: { itemsCount?: number; estimatedHeight?: number; debug?: boolean } = {}) {
  return {
    type: receiptType,
    printMode: getPrintMode(),
    footerMode: getFooterMode(),
    debug: opts.debug ?? false,
    itemsCount: opts.itemsCount,
    estimatedHeight: opts.estimatedHeight,
    timestamp: new Date().toISOString(),
    client: 'pos-web',
  };
}

/** Estimate receipt height in px from items count (rough heuristic) */
function estimateReceiptHeight(itemsCount: number): number {
  // header ~280 + footer varies by mode + ~70 per item @ font 17px
  const mode = getFooterMode();
  const footerPx = mode === 'full' ? 220 : mode === 'compact' ? 60 : 0;
  return 280 + footerPx + itemsCount * 70;
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
    const baseUrl = getBridgeUrl();
    if (!baseUrl) {
      logPrintFinish(logId, 'bridge_unreachable', {
        durationMs: 0,
        errorMessage: 'bridge_url_not_configured',
      });
      return { success: false, error: 'لم يتم إعداد عنوان Print Bridge لهذا الجهاز.' } as any;
    }
    const res = await fetch(`${baseUrl}${path}`, withLocalNetworkAccess({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr,
      signal: AbortSignal.timeout(timeout),
    }));
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
    throw new Error(isUnreachable ? getLocalNetworkBlockedMessage() : (err.message || 'تعذر الاتصال بـ Print Bridge'));
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
import { formatOrderTypeLabel } from './pos/order-type-label';
function orderTypeLabel(
  normalized: 'dine_in' | 'takeaway' | 'delivery',
  tableLabel?: string | null,
): string {
  return formatOrderTypeLabel(normalized, tableLabel);
}

function toBridgeReceiptOrder(order: PrintOrder, companyInfo?: {
  name?: string; phone?: string; address?: string; taxNumber?: string; logoUrl?: string; terminalName?: string;
}) {
  const normalizedType = normalizeOrderType(order.orderType, order.tableNumber);
  const footerMode = getFooterMode();
  // ── Delivery fee handling (customer receipt ONLY) ─────────────────────
  // The external delivery fee is NOT revenue for the restaurant — it belongs
  // to the courier company. We strip it from the printed total/subtotal and
  // surface it only as a note line. The DB invoice total and accounting
  // journal are NOT touched here (they live in POSPage / complete_pos_order).
  const deliveryFee = Math.max(0, Number(order.deliveryFee || 0));
  const printedTotal = Math.max(0, Number(order.total || 0) - deliveryFee);
  // NOTE: order.subtotal is already items-only in POSPage (the delivery fee
  // is only added when computing `total`). So do NOT subtract here.
  const printedSubtotal = order.subtotal != null ? Number(order.subtotal) : undefined;
  // v6.3.6-clean: notes are sent as SEPARATE fields so the bridge can
  // render them in distinct boxes (no overlap, no leaking onto thanks).
  //   customerNote  → customer-facing note (typed at POS)
  //   deliveryNote  → external courier fee disclosure (auto-built here)
  //   kitchenNote   → kitchen-only banner, NEVER sent on the receipt
  // We still also pass `orderNote` for back-compat with older bridges.
  const customerNote = order.orderNote || '';
  const deliveryNote = deliveryFee > 0
    ? `سعر التوصيل: ₪${deliveryFee.toFixed(2)} يخص شركة التوصيل وليس ضمن إجمالي الفاتورة`
    : '';
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    branchName: order.branchName,
    companyName: companyInfo?.name || order.branchName,
    companyPhone: companyInfo?.phone,
    taxNumber: companyInfo?.taxNumber,
    cashierName: order.cashier,
    orderType: normalizedType,
    orderTypeLabel: orderTypeLabel(normalizedType, order.tableNumber),
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
    total: printedTotal,
    discount: order.discount,
    tax: 0,
    paymentMethod: order.paymentMethod,
    cashReceived: order.tenderedAmount,
    change: order.change,
    createdAt: order.date ? `${order.date}T${order.time || '00:00'}` : new Date().toISOString(),
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    foreignAmount: order.foreignAmount,
    subtotal: printedSubtotal,
    customerNote: customerNote || undefined,
    deliveryNote: deliveryNote || undefined,
    // Back-compat: old bridges only know `orderNote`. Send the customer
    // note here so they keep working; new bridge prefers `customerNote`.
    orderNote: customerNote || undefined,
    terminalName: companyInfo?.terminalName,
    // ── FOOTER MODE (bridge must respect this to avoid raster overflow) ──
    footerMode,
    showQr: footerMode === 'full',
    showThanks: footerMode !== 'off',
  };
}

// ──────────────────────────────────────────
// Station mapping
// ──────────────────────────────────────────

export const STATION_TO_PRINTER: Record<string, { key: string; label: string }> = {
  'a09ebd1b-392c-42b2-a8a7-d180fdde1f97': { key: 'kitchen', label: 'المطبخ' },
  '4f64e6b4-89ab-4e22-b935-52f3ec665e54': { key: 'grill', label: 'السخان' },
  'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e': { key: 'grill', label: 'السخان' },
  '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516': { key: 'pizza', label: 'البيتزا' },
};

const ALL_STATIONS = [
  { key: 'kitchen', label: 'المطبخ' },
  { key: 'grill', label: 'السخان' },
  { key: 'pizza', label: 'البيتزا' },
];

// Phase A — Generalization Hard Stop:
// The unified-kitchen routing was previously hardcoded to the Ramallah Plaza
// branch ID. It is now driven by data:
//   1) Any active pos_printers row for the device's branch with
//      settings->>'image_mode' = 'unified_kitchen'   (preferred)
//   2) Legacy fallback: the original Ramallah Plaza branch ID + name match,
//      kept ONLY so existing Plaza terminals do not break before they
//      configure their printer settings.
const LEGACY_RAMALLAH_PLAZA_BRANCH_ID = 'f82642e1-ce32-456e-8ef8-e556d8d65af9';

let _unifiedKitchenCache: { branchId: string | null; value: boolean; at: number } | null = null;

async function branchHasUnifiedKitchenPrinter(branchId: string | null): Promise<boolean> {
  if (!branchId) return false;
  const now = Date.now();
  if (_unifiedKitchenCache && _unifiedKitchenCache.branchId === branchId && now - _unifiedKitchenCache.at < 60_000) {
    return _unifiedKitchenCache.value;
  }
  try {
    const { data } = await supabase
      .from('pos_printers')
      .select('id, settings, is_active, branch_id')
      .eq('branch_id', branchId)
      .eq('is_active', true);
    const value = !!(data || []).find((p: any) => (p?.settings?.image_mode === 'unified_kitchen'));
    _unifiedKitchenCache = { branchId, value, at: now };
    return value;
  } catch {
    return false;
  }
}

async function shouldUseUnifiedKitchenPrinter(order: PrintOrder): Promise<boolean> {
  const branchId = getDeviceBranchId();
  if (await branchHasUnifiedKitchenPrinter(branchId)) return true;
  // Legacy fallback — keep Plaza working until they set image_mode.
  return branchId === LEGACY_RAMALLAH_PLAZA_BRANCH_ID || !!order.branchName?.includes('رام الله بلازا');
}

function toBridgeKitchenOrder(order: PrintOrder, items: PrintItem[]) {
  const normalizedType = normalizeOrderType(order.orderType, order.tableNumber);
  const totalQty = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  // Daily counter — send WITHOUT leading zeros. Bridge also normalizes,
  // but we strip here too so the printed value is "5" (not "000005").
  // For composite numbers like "POS-20260602-0005" we take the last numeric
  // segment and drop its zeros; for plain digits we just drop leading zeros.
  const dailyCounterRaw = order.queueNumber ?? order.orderNumber;
  let dailyCounter: string | undefined;
  if (dailyCounterRaw !== undefined && dailyCounterRaw !== null) {
    const s = String(dailyCounterRaw).trim();
    if (/[-_/\s]/.test(s)) {
      const parts = s.split(/[-_/\s]+/);
      const last = parts[parts.length - 1] || '';
      dailyCounter = /^\d+$/.test(last) ? (last.replace(/^0+(?=\d)/, '') || last) : s;
    } else if (/^\d+$/.test(s)) {
      dailyCounter = s.replace(/^0+(?=\d)/, '') || s;
    } else {
      dailyCounter = s;
    }
  }
  return {
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    dailyCounter,
    branchName: order.branchName,
    cashierName: order.cashier,
    orderType: normalizedType,
    orderTypeLabel: orderTypeLabel(normalizedType, order.tableNumber),
    tableNumber: order.tableNumber,
    customerName: order.customerName || undefined,
    customerPhone: order.customerPhone || undefined,
    pickupBy: order.pickupBy || undefined,
    totalQty,
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
    // v6.3.7-clean: kitchen tickets now render BOTH notes in separate
    // stacked boxes. We forward them as distinct fields:
    //   kitchenNote → internal banner (e.g. "طلب معدل — بديل عن فاتورة …")
    //   orderNote   → customer-facing invoice note (special requests like
    //                 "بدون بصل") — explicitly required on the kitchen
    //                 ticket so the line cook sees the customer's note.
    // Older bridges (≤ v6.3.6) only knew the legacy "fallback" pattern
    // (kitchenNote || orderNote) — that path still works on the old box
    // because either field alone will render. v6.3.7 prints them stacked.
    kitchenNote: order.kitchenNote || undefined,
    orderNote: order.orderNote || undefined,
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
  const dedupeKey = `receipt|${order.orderNumber}|${order.id || 'noid'}`;
  console.log(`[frontend-print-click] receipt key=${dedupeKey}`);
  if (!_markInFlight(dedupeKey)) {
    return { success: true, error: 'in_progress' };
  }
  if (_shouldBlockDuplicate(dedupeKey)) {
    _clearInFlight(dedupeKey);
    return { success: true, error: 'duplicate_blocked' };
  }
  // Shared guard — blocks if printAllImage() already fired the receipt
  // for this order within the dedupe window (or vice versa).
  const sharedKey = _receiptSharedKey(order);
  if (_shouldBlockDuplicate(sharedKey)) {
    _clearInFlight(dedupeKey);
    console.warn(`[frontend-print-blocked-shared] receipt sharedKey=${sharedKey}`);
    return { success: true, error: 'duplicate_blocked_shared' };
  }
  try {
    console.log(`[frontend-print-request] receipt key=${dedupeKey}`);
    const bridgeOrder = toBridgeReceiptOrder(order, companyInfo);
    const itemsCount = order.items?.length || 0;
    const meta = buildMeta('cashier_receipt', { itemsCount, estimatedHeight: estimateReceiptHeight(itemsCount) });
    const result = await bridgeFetch(
      '/print-receipt',
      { order: bridgeOrder, meta },
      { receiptType: 'cashier_receipt', itemsCount, estimatedHeight: meta.estimatedHeight },
    );
    if (result.success) console.log(`[frontend-print-success] receipt key=${dedupeKey}`);
    else console.warn(`[frontend-print-failed] receipt key=${dedupeKey} err=${result.error}`);
    return { success: result.success, error: result.error };
  } catch (err: any) {
    console.error('[printReceiptImage]', err);
    return { success: false, error: err.message };
  } finally {
    _clearInFlight(dedupeKey);
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
  options?: { skipReceipt?: boolean },
): Promise<PrintImageResult> {
  const dedupeKey = `all|${order.orderNumber}|${order.id || 'noid'}`;
  console.log(`[frontend-print-click] all key=${dedupeKey}`);
  if (!_markInFlight(dedupeKey)) {
    return { success: true, error: 'in_progress' };
  }
  if (_shouldBlockDuplicate(dedupeKey)) {
    _clearInFlight(dedupeKey);
    return { success: true, error: 'duplicate_blocked' };
  }
  try {
    console.log(`[frontend-print-request] all key=${dedupeKey}`);
    const receiptOrder = toBridgeReceiptOrder(order, companyInfo);
    const itemsCount = order.items?.length || 0;
    const receiptMeta = buildMeta('cashier_receipt', { itemsCount, estimatedHeight: estimateReceiptHeight(itemsCount) });
    const kitchenMeta = (key: string) => buildMeta(`kitchen_${key}`, { itemsCount });

    // ── RECEIPT job ──
    // Skipped for delivery orders (kitchen-only printing).
    const jobs: Promise<{ printerKey: string; name: string; success: boolean; error?: string }>[] = [];
    if (!options?.skipReceipt) {
      // Mark the shared receipt key so any concurrent printReceiptImage()
      // call for the same order is blocked at the source. We only block
      // additional CALLS — this first one proceeds normally.
      const sharedKey = _receiptSharedKey(order);
      _shouldBlockDuplicate(sharedKey); // stamps timestamp; first call returns false
      jobs.push(
        bridgeFetch('/print-receipt', { order: receiptOrder, meta: receiptMeta }, { receiptType: 'cashier_receipt', itemsCount, estimatedHeight: receiptMeta.estimatedHeight })
          .then((r: any) => ({ printerKey: 'receipt', name: 'الوصل', success: r.success, error: r.error }))
          .catch((err: any) => ({ printerKey: 'receipt', name: 'الوصل', success: false, error: err.message })),
      );
    } else {
      console.log(`[frontend-print-skip-receipt] all key=${dedupeKey} reason=delivery`);
    }

    // ── KITCHEN jobs ──
    // If filtered kitchenJobs are provided, send ONLY those (one per station, filtered items).
    // Otherwise, fall back to legacy behaviour: send full order to all 3 stations.
    const stationsToPrintRaw: { key: string; label: string; items: PrintItem[] }[] =
      kitchenJobs && kitchenJobs.length > 0
        ? kitchenJobs
            .filter(j => j.items && j.items.length > 0)
            .map(j => ({ key: j.printerKey, label: j.stationLabel, items: j.items }))
        : ALL_STATIONS.map(s => ({ key: s.key, label: s.label, items: order.items }));

    const unifiedKitchenItems = kitchenJobs && kitchenJobs.length > 0
      ? stationsToPrintRaw.flatMap(s => s.items)
      : order.items;
    const stationsToPrint = (await shouldUseUnifiedKitchenPrinter(order))
      ? [{ key: 'kitchen', label: 'المطبخ', items: unifiedKitchenItems }]
      : stationsToPrintRaw;

    // ── DEDUPE by printerKey ──
    // If multiple stations resolve to the same printerKey (e.g. unmapped station IDs
    // all falling back to 'kitchen'), merge their items into ONE job to avoid
    // printing the same physical printer multiple times.
    const mergedByKey = new Map<string, { key: string; label: string; items: PrintItem[] }>();
    for (const s of stationsToPrint) {
      const existing = mergedByKey.get(s.key);
      if (existing) {
        existing.items = [...existing.items, ...s.items];
      } else {
        mergedByKey.set(s.key, { ...s, items: [...s.items] });
      }
    }
    const dedupedStations = Array.from(mergedByKey.values());

    for (const station of dedupedStations) {
      const kitchenOrder = toBridgeKitchenOrder(order, station.items);
      const stationItemsCount = station.items.length;
      jobs.push(
        bridgeFetch(
          '/print-kitchen',
          { order: kitchenOrder, printerKey: station.key, stationLabel: station.label, meta: kitchenMeta(station.key) },
          { receiptType: `kitchen_${station.key}`, itemsCount: stationItemsCount },
        )
          .then((r: any) => ({ printerKey: station.key, name: station.label, success: r.success, error: r.error }))
          .catch((err: any) => ({ printerKey: station.key, name: station.label, success: false, error: err.message })),
      );
    }

    const results = await Promise.all(jobs);

    const allOk = results.every(r => r.success);
    if (allOk) console.log(`[frontend-print-success] all key=${dedupeKey}`);
    else console.warn(`[frontend-print-partial] all key=${dedupeKey} failed=${results.filter(r=>!r.success).map(r=>r.name).join(',')}`);
    return { success: allOk, results };
  } catch (err: any) {
    console.error('[printAllImage]', err);
    return { success: false, error: err.message };
  } finally {
    _clearInFlight(dedupeKey);
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
      logoUrl: data.logoUrl,
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
    const baseUrl = getBridgeUrl();
    if (!baseUrl) return false;
    const res = await fetch(`${baseUrl}/health`, withLocalNetworkAccess({
      signal: AbortSignal.timeout(3000),
    }));
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
      footerMode: getFooterMode(),
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
