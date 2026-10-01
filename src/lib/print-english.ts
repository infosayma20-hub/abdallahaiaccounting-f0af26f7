/**
 * English printing (customer receipt / kitchen ticket / shift summary).
 *
 * Uses the bridge's EXISTING raw-text mode (POST /print {ip,port,text}),
 * so the clean bridge file (v6.3.7-clean) is not touched and no reinstall
 * is needed. English is plain ASCII, so raw ESC/POS text prints cleanly.
 *
 * Safety: if the language is Arabic, or the target printer is not a
 * network printer, or anything fails before sending, the caller falls
 * back to the normal Arabic image path — printing never stops.
 */
import { getBridgeUrl } from "@/lib/device-config";
import { withLocalNetworkAccess, localNetworkTimeoutSignal } from "@/lib/local-network-fetch";

export type ReceiptLang = "ar" | "en";

let receiptLang: ReceiptLang = "ar";
let header: { name?: string | null; address?: string | null; phone?: string | null; taxNumber?: string | null } = {};
const enNames = new Map<string, string>();

export function setReceiptLanguage(lang: ReceiptLang) { receiptLang = lang === "en" ? "en" : "ar"; }
export function getReceiptLanguage(): ReceiptLang { return receiptLang; }
export function setEnglishReceiptHeader(h: typeof header) { header = h || {}; }
/** Register Arabic name → English name for products, categories, add-ons. */
export function registerEnglishNames(rows: { name?: string | null; name_en?: string | null }[]) {
  for (const r of rows || []) {
    if (r?.name && r?.name_en && r.name_en.trim()) enNames.set(r.name.trim(), r.name_en.trim());
  }
}

const W = 48; // chars per line on 80mm printers (Font A)
const money = (n: any) => Number(n || 0).toFixed(2);
const en = (s: any) => {
  const t = String(s ?? "").trim();
  return enNames.get(t) || t;
};
const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const line = (ch = "-") => ch.repeat(W);
const center = (s: string) => {
  const t = s.slice(0, W);
  const pad = Math.max(0, Math.floor((W - t.length) / 2));
  return " ".repeat(pad) + t;
};
const lr = (l: string, r: string) => {
  const space = W - l.length - r.length;
  if (space >= 1) return l + " ".repeat(space) + r;
  return l.slice(0, Math.max(0, W - r.length - 1)) + " " + r;
};
function wrap(s: string, width: number): string[] {
  const words = String(s || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let w of words) {
    while (w.length > width) { if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, width)); w = w.slice(width); }
    const c = cur ? cur + " " + w : w;
    if (c.length > width) { out.push(cur); cur = w; } else cur = c;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}
/** Never print Arabic glyphs in raw mode (printer would show garbage). */
const safe = (s: any, fallback = "") => {
  const t = en(s);
  return hasArabic(t) ? fallback : t;
};

const ORDER_TYPE: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };
function paymentLabel(p: string): string {
  const s = String(p || "");
  if (/نقد/.test(s)) return "Cash";
  if (/فيزا|بطاقة/.test(s)) return "Card";
  if (/حساب موظف/.test(s)) return "Employee account";
  if (/آجل/.test(s)) return "Credit";
  if (/المحفظة/.test(s)) return "Wallet";
  if (/مختلط/.test(s)) return "Split payment";
  if (/تحويل/.test(s)) return "Transfer";
  return hasArabic(s) ? "Other" : s;
}
const counter = (o: any) => {
  const raw = String(o.dailyCounter ?? o.queueNumber ?? o.orderNumber ?? "").trim();
  const last = raw.split(/[-_/\s]+/).pop() || raw;
  return /^\d+$/.test(last) ? last.replace(/^0+(?=\d)/, "") : raw;
};
const dt = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const ok = !isNaN(d.getTime()) ? d : new Date();
  return `${ok.toLocaleDateString("en-GB")}  ${ok.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

function itemRows(items: any[], withPrice: boolean): string[] {
  const out: string[] = [];
  for (const it of items || []) {
    const qty = Number(it.quantity || 1);
    const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(3);
    const name = safe(it.name, "Item");
    if (withPrice) {
      const total = money(qty * Number(it.unitPrice || 0));
      const nameLines = wrap(name, W - 6 - 10);
      out.push(lr(`${qtyStr.padEnd(5)} ${nameLines[0]}`, total));
      nameLines.slice(1).forEach((l) => out.push(`      ${l}`));
      if (qty !== 1) out.push(`      @ ${money(it.unitPrice)}`);
    } else {
      const nameLines = wrap(name, W - 6);
      out.push(`${(qtyStr + " x").padEnd(5)} ${nameLines[0]}`);
      nameLines.slice(1).forEach((l) => out.push(`      ${l}`));
    }
    if (it.notes) {
      const parts = String(it.notes).split(/[،,]/).map((p) => safe(p.trim())).filter(Boolean);
      parts.forEach((p) => wrap(p, W - 8).forEach((l, i) => out.push(`      ${i === 0 ? "+ " : "  "}${l}`)));
    }
  }
  return out;
}

export function buildEnglishReceiptText(o: any): string {
  const L: string[] = [];
  const name = safe(header.name) || safe(o.companyName) || "";
  if (name) L.push(center(name.toUpperCase()));
  if (safe(header.address)) wrap(safe(header.address), W).forEach((l) => L.push(center(l)));
  const phone = header.phone || o.companyPhone;
  if (phone) L.push(center(`Tel: ${phone}`));
  const tax = header.taxNumber || o.taxNumber;
  if (tax) L.push(center(`VAT No: ${tax}`));
  L.push(center(dt(o.createdAt)));
  L.push(line("="));
  L.push(lr("ORDER NO.", `#${counter(o)}`));
  const cashier = safe(o.cashierName);
  if (cashier) L.push(lr("Cashier", cashier));
  L.push(lr("Order type", ORDER_TYPE[o.orderType] || "Takeaway"));
  if (o.tableNumber && safe(o.tableNumber)) L.push(lr("Table", safe(o.tableNumber)));
  const cust = safe(o.customerName);
  if (cust) L.push(lr("Customer", cust));
  if (o.customerPhone) L.push(lr("Phone", String(o.customerPhone)));
  L.push(line("-"));
  L.push(lr("QTY   ITEM", "TOTAL"));
  L.push(line("-"));
  L.push(...itemRows(o.items, true));
  L.push(line("-"));
  if (o.subtotal != null && Number(o.discount || 0) > 0) L.push(lr("Subtotal", money(o.subtotal)));
  if (Number(o.discount || 0) > 0) L.push(lr("Discount", `-${money(o.discount)}`));
  L.push(line("="));
  L.push(lr("TOTAL (ILS)", money(o.total)));
  L.push(line("="));
  L.push(lr("Payment", paymentLabel(o.paymentMethod)));
  if (o.cashReceived) L.push(lr("Received", money(o.cashReceived)));
  if (o.change) L.push(lr("Change", money(o.change)));
  const note = safe(o.customerNote || o.orderNote);
  if (note) { L.push(line("-")); wrap(`Note: ${note}`, W).forEach((l) => L.push(l)); }
  L.push("");
  L.push(center("Thank you for your visit!"));
  L.push(center("Powered by UNIFY"));
  return L.join("\n") + "\n";
}

export function buildEnglishKitchenText(o: any, stationLabel?: string): string {
  const L: string[] = [];
  const st = safe(stationLabel);
  L.push(center(`KITCHEN${st ? " - " + st.toUpperCase() : ""}`));
  L.push(line("="));
  L.push(center(`ORDER #${counter(o)}`));
  L.push(lr(ORDER_TYPE[o.orderType] || "Takeaway", dt(o.createdAt)));
  if (o.tableNumber && safe(o.tableNumber)) L.push(lr("Table", safe(o.tableNumber)));
  const cashier = safe(o.cashierName);
  if (cashier) L.push(lr("Cashier", cashier));
  const cust = safe(o.customerName);
  if (cust) L.push(lr("Customer", cust));
  L.push(line("-"));
  L.push(...itemRows(o.items, false));
  L.push(line("-"));
  const qty = (o.items || []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
  L.push(lr("Items", String(qty)));
  if (o.kitchenNote) { L.push(line("*")); L.push(center("EDITED ORDER")); L.push(line("*")); }
  const note = safe(o.orderNote);
  if (note) { L.push(line("-")); wrap(`Note: ${note}`, W).forEach((l) => L.push(l)); }
  return L.join("\n") + "\n";
}

export function buildEnglishShiftText(s: any): string {
  const L: string[] = [];
  L.push(center("SHIFT SUMMARY"));
  const name = safe(header.name) || safe(s.branchName);
  if (name) L.push(center(name.toUpperCase()));
  L.push(line("="));
  const cashier = safe(s.cashierName); if (cashier) L.push(lr("Cashier", cashier));
  const term = safe(s.terminalName); if (term) L.push(lr("Terminal", term));
  if (s.sessionStart) L.push(lr("Opened", dt(s.sessionStart)));
  if (s.sessionEnd) L.push(lr("Closed", dt(s.sessionEnd)));
  L.push(line("-"));
  L.push(lr("Orders", String(s.totalOrders || 0)));
  L.push(lr("Total sales", money(s.totalSales)));
  L.push(lr("Cash sales", money(s.cashSales)));
  L.push(lr("Card sales", money(s.cardSales)));
  if (Number(s.totalExpenses || 0)) L.push(lr("Expenses", money(s.totalExpenses)));
  if (Number(s.cancelledOrdersCount || 0)) L.push(lr(`Cancelled (${s.cancelledOrdersCount})`, money(s.cancelledOrdersTotal)));
  if (Number(s.voidedOrdersCount || 0)) L.push(lr(`Voided (${s.voidedOrdersCount})`, money(s.voidedOrdersTotal)));
  L.push(line("-"));
  L.push(lr("Opening cash", money(s.openingBalance)));
  L.push(lr("Expected cash", money(s.expectedCash)));
  L.push(lr("Counted cash", money(s.closingBalance)));
  L.push(lr("Difference", money(s.difference ?? s.varianceILS)));
  L.push(line("="));
  return L.join("\n") + "\n";
}

// ── printer resolution (bridge /health, cached) ─────────────────────────
let printersCache: { at: number; list: any[] } | null = null;
async function getPrinters(): Promise<any[]> {
  if (printersCache && Date.now() - printersCache.at < 60_000) return printersCache.list;
  const base = getBridgeUrl();
  if (!base) return [];
  const res = await fetch(`${base}/health`, withLocalNetworkAccess({ signal: localNetworkTimeoutSignal(5000) }));
  const json = await res.json();
  const list = Array.isArray(json?.printers) ? json.printers : [];
  printersCache = { at: Date.now(), list };
  return list;
}

/**
 * Try to print English text on printerKey. Returns null when English
 * printing is not applicable (caller must use the Arabic path).
 */
export async function tryPrintEnglish(path: string, body: any): Promise<{ success: boolean; error?: string } | null> {
  if (receiptLang !== "en") return null;
  let key: string; let text: string;
  try {
    if (path === "/print-receipt") { key = "receipt"; text = buildEnglishReceiptText(body?.order || {}); }
    else if (path === "/print-kitchen") { key = body?.printerKey || "kitchen"; text = buildEnglishKitchenText(body?.order || {}, body?.stationLabel); }
    else if (path === "/print-shift") { key = "receipt"; text = buildEnglishShiftText(body?.session || {}); }
    else return null;
    const p = (await getPrinters()).find((x) => x.key === key);
    if (!p || (p.type || "network") !== "network" || !p.ip) return null; // Windows/USB → Arabic image path
    const base = getBridgeUrl();
    const res = await fetch(`${base}/print`, withLocalNetworkAccess({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: p.ip, port: p.port || 9100, text }),
      signal: localNetworkTimeoutSignal(15000),
    }));
    const json = await res.json();
    return { success: !!json?.success, error: json?.error };
  } catch {
    return null;
  }
}
