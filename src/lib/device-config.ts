/**
 * Device Configuration — Per-device POS settings
 *
 * Stores all device-specific config in localStorage. This makes the POS
 * portable to ANY company / branch / terminal without code changes.
 *
 * Stored keys:
 *   pos-device:bridge-url   → e.g. "http://192.168.1.65:3001"
 *   pos-device:branch-id    → branch UUID this device belongs to
 *   pos-device:terminal-id  → terminal/cash-box UUID for this device
 *   pos-device:label        → optional friendly name (e.g. "كاشير 1 - رام الله")
 */

import { supabase } from "@/integrations/supabase/client";

const KEYS = {
  bridgeUrl: "pos-device:bridge-url",
  branchId: "pos-device:branch-id",
  terminalId: "pos-device:terminal-id",
  label: "pos-device:label",
  cashBoxId: "pos-device:cash-box-id",
} as const;

const DEFAULT_BRIDGE_PORT = 3001;

/** Default fallback. Used only if nothing is configured yet. Empty string = unconfigured. */
const DEFAULT_BRIDGE_URL = "";

/**
 * The Print Bridge running on the cashier PC also stores a copy of the
 * device config on disk (c:\print-bridge\device.json) and exposes it at
 * GET/POST /device-config. This makes the configuration survive ANY
 * browser-side wipe (clear history, clear site data, new browser, etc.)
 * because the source of truth is a file on the local PC.
 *
 * We probe a small set of well-known local URLs in order to find the bridge
 * even before the user has set the Bridge URL in localStorage.
 */
const BRIDGE_PROBE_URLS = [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
];

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Normalize: strip trailing slash, ensure http:// prefix, default port if missing. */
export function normalizeBridgeUrl(input: string): string {
  let url = (input || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, "");
  // Add default port if no port was specified after the host
  try {
    const u = new URL(url);
    if (!u.port && u.protocol === "http:") {
      u.port = String(DEFAULT_BRIDGE_PORT);
      url = u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* invalid URL — return as-is so caller can validate */
  }
  return url;
}

// ── Bridge URL ──────────────────────────────────────────────

export function getBridgeUrl(): string {
  return safeGet(KEYS.bridgeUrl) || DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string): void {
  safeSet(KEYS.bridgeUrl, normalizeBridgeUrl(url));
  notifyChange();
  void pushConfigToBridge();
}

export function isBridgeConfigured(): boolean {
  return Boolean(getBridgeUrl());
}

// ── Branch ──────────────────────────────────────────────────

export function getDeviceBranchId(): string {
  return safeGet(KEYS.branchId);
}

export function setDeviceBranchId(id: string): void {
  safeSet(KEYS.branchId, id);
  notifyChange();
  void pushConfigToBridge();
}

// ── Terminal ────────────────────────────────────────────────

export function getDeviceTerminalId(): string {
  return safeGet(KEYS.terminalId);
}

export function setDeviceTerminalId(id: string): void {
  safeSet(KEYS.terminalId, id);
  notifyChange();
  void pushConfigToBridge();
}

// ── Label ───────────────────────────────────────────────────

export function getDeviceLabel(): string {
  return safeGet(KEYS.label);
}

export function setDeviceLabel(label: string): void {
  safeSet(KEYS.label, label);
  notifyChange();
  void pushConfigToBridge();
}

// ── Bulk operations ─────────────────────────────────────────

export interface DeviceConfig {
  bridgeUrl: string;
  branchId: string;
  terminalId: string;
  label: string;
  cashBoxId: string;
}

// ── Printer config that lives on the bridge (device.json) ────
export type BridgePrinterKey =
  | "receipt" | "kitchen" | "grill" | "pizza" | "unified_kitchen";

export interface BridgeNetworkPrinter {
  type: "network";
  name?: string;
  ip: string;
  port: number;
  width?: number;
  stationId?: string;
}
export interface BridgeWindowsPrinter {
  type: "windows";
  name?: string;
  windowsPrinterName: string;
  width?: number;
  stationId?: string;
}
export type BridgePrinter = BridgeNetworkPrinter | BridgeWindowsPrinter;
export type BridgePrintersMap = Partial<Record<BridgePrinterKey, BridgePrinter | null>>;

const ALL_BRIDGE_PRINTER_KEYS: BridgePrinterKey[] = ["receipt", "kitchen", "grill", "pizza", "unified_kitchen"];

type PosPrinterRow = {
  id?: string;
  name: string;
  ip_address: string | null;
  port: number | null;
  printer_type: string | null;
  print_categories: string[] | null;
  branch_id?: string | null;
  is_active?: boolean | null;
  settings?: Record<string, any> | null;
};

export function posPrinterRoleToBridgeKey(role: string | null | undefined): BridgePrinterKey | null {
  switch (role) {
    case "receipt": return "receipt";
    case "kitchen_ticket":
    case "kitchen": return "kitchen";
    case "grill": return "grill";
    case "pizza": return "pizza";
    case "unified_kitchen": return "unified_kitchen";
    default: return null;
  }
}

export function buildBridgePrintersMapFromRows(rows: PosPrinterRow[]): BridgePrintersMap {
  const out: BridgePrintersMap = {};
  for (const p of rows) {
    const role = p.print_categories?.[0] || p.printer_type;
    const key = posPrinterRoleToBridgeKey(role);
    if (!key) continue;
    const settings = (p.settings || {}) as Record<string, any>;
    const isWindows = settings.connection === "usb" || settings.connection === "windows" || !!settings.windows_printer_name;
    if (isWindows) {
      out[key] = {
        type: "windows",
        name: p.name,
        windowsPrinterName: String(settings.windows_printer_name || ""),
      };
    } else if (p.ip_address && p.ip_address !== "usb") {
      out[key] = {
        type: "network",
        name: p.name,
        ip: p.ip_address,
        port: Number(p.port) || 9100,
      };
    }
  }
  return out;
}

function completePrintersReplacementMap(map: BridgePrintersMap): BridgePrintersMap {
  const fullMap: BridgePrintersMap = { ...map };
  for (const key of ALL_BRIDGE_PRINTER_KEYS) {
    if (!(key in map)) fullMap[key] = null;
  }
  return fullMap;
}

export async function syncBranchPrintersToBridge(branchId: string): Promise<{ ok: boolean; count: number }> {
  if (!branchId) return { ok: false, count: 0 };
  const { data, error } = await (supabase.from("pos_printers") as any)
    .select("id, name, ip_address, port, printer_type, print_categories, branch_id, is_active, settings")
    .eq("is_active", true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order("is_default", { ascending: false });
  if (error) throw error;
  const map = buildBridgePrintersMapFromRows((data || []) as PosPrinterRow[]);
  const count = Object.keys(map).length;
  if (count === 0) return { ok: false, count: 0 };
  const ok = await pushPrintersToBridge(completePrintersReplacementMap(map), { replace: true });
  return { ok, count };
}

export function getDeviceConfig(): DeviceConfig {
  return {
    bridgeUrl: getBridgeUrl(),
    branchId: getDeviceBranchId(),
    terminalId: getDeviceTerminalId(),
    label: getDeviceLabel(),
    cashBoxId: safeGet(KEYS.cashBoxId),
  };
}

export function clearDeviceConfig(): void {
  Object.values(KEYS).forEach(k => safeSet(k, ""));
  notifyChange();
}

// ── Bridge-side persistence (survives browser data wipes) ───

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 1500): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function bridgeJsonHeaders(): HeadersInit {
  // Use text/plain for add-on endpoints so older installed bridges do not have
  // bodyParser.json() consume the stream before device-config-addon can read it.
  // The add-on still parses the body as JSON text.
  return { "Content-Type": "text/plain;charset=UTF-8" };
}

/** Try the configured bridge URL first, then well-known local URLs. */
function bridgeCandidates(): string[] {
  const cfg = getBridgeUrl();
  const list: string[] = [];
  if (cfg) list.push(cfg);
  for (const u of BRIDGE_PROBE_URLS) if (!list.includes(u)) list.push(u);
  return list;
}

/**
 * Push the current localStorage config to the bridge so it persists on disk.
 * Fire-and-forget — never throws.
 */
export async function pushConfigToBridge(): Promise<void> {
  const cfg = getDeviceConfig();
  // Only push if there is at least one meaningful field set
  if (!cfg.branchId && !cfg.terminalId && !cfg.bridgeUrl && !cfg.label && !cfg.cashBoxId) return;
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/device-config`, {
        method: "POST",
        headers: bridgeJsonHeaders(),
        body: JSON.stringify(cfg),
      });
      if (res.ok) return;
    } catch {
      /* try next */
    }
  }
}

// ────────────────────────────────────────────────────────────
// Unified one-shot device sync ("مزامنة هذا الجهاز")
// ────────────────────────────────────────────────────────────
export interface SyncDeviceResult {
  ok: boolean;
  configPushed: boolean;
  printersPushed: boolean;
  printerCount: number;
  reloaded: boolean;
  health: {
    online: boolean;
    branchId: string | null;
    terminalId: string | null;
    printersSource: string | null;
  };
  fallback: boolean;
  message: string;
}

/**
 * Push local device config + branch printers to the Print Bridge, reload it,
 * then verify via /health that:
 *   • device.branchId / device.terminalId are reflected on the bridge
 *   • printers_source is NOT "fallback" whenever the branch has active printers
 *
 * Returns a structured result so the UI can show a precise success / warning.
 */
export async function syncThisDeviceToBridge(): Promise<SyncDeviceResult> {
  const cfg = getDeviceConfig();
  const result: SyncDeviceResult = {
    ok: false,
    configPushed: false,
    printersPushed: false,
    printerCount: 0,
    reloaded: false,
    health: { online: false, branchId: null, terminalId: null, printersSource: null },
    fallback: true,
    message: "",
  };

  // 1) POST /device-config with label / branchId / terminalId / cashBoxId / bridgeUrl
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/device-config`, {
        method: "POST",
        headers: bridgeJsonHeaders(),
        body: JSON.stringify(cfg),
      }, 3000);
      if (res.ok) { result.configPushed = true; break; }
    } catch { /* try next */ }
  }
  if (!result.configPushed) {
    result.message = "تعذّر الوصول إلى برنامج الطباعة المحلي على هذا الجهاز";
    return result;
  }

  // 2) Push active branch printers (network + windows) — full replace
  if (cfg.branchId) {
    try {
      const sync = await syncBranchPrintersToBridge(cfg.branchId);
      result.printersPushed = sync.ok;
      result.printerCount = sync.count;
    } catch {
      result.printersPushed = false;
    }
  }

  // 3) POST /reload-config
  result.reloaded = await reloadBridgeConfig().catch(() => false);

  // 4) GET /health and verify
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/health`, { method: "GET" }, 4000);
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({} as any));
      const device = (data?.device || {}) as Record<string, any>;
      result.health = {
        online: true,
        branchId: device.branchId ?? null,
        terminalId: device.terminalId ?? null,
        printersSource: data?.printers_source ?? null,
      };
      break;
    } catch { /* try next */ }
  }

  result.fallback = result.health.printersSource === "fallback";
  const hasActivePrinters = result.printerCount > 0;
  const deviceBound = !!(result.health.branchId && result.health.terminalId);

  if (!result.health.online) {
    result.message = "تم إرسال الإعدادات لكن /health لا يستجيب — تأكد أن برنامج الطباعة شغّال";
  } else if (!deviceBound) {
    result.message = "تم إرسال الإعدادات لكن لم تظهر بيانات الجهاز في /health — جرّب إعادة تشغيل برنامج الطباعة";
  } else if (hasActivePrinters && result.fallback) {
    result.message = "تم حفظ الإعدادات في أموالي لكن لم تصل إلى برنامج الطباعة المحلي";
  } else {
    result.ok = true;
    result.message = hasActivePrinters
      ? "تمت مزامنة الجهاز والطابعات بنجاح"
      : "تمت مزامنة الجهاز (لا توجد طابعات فعّالة على هذا الفرع بعد)";
  }

  return result;
}

/**
  * Push printer settings to the bridge's device.json. Merges existing fields;
  * pass null for a key to delete it. Returns true if at least one bridge URL accepted the payload.
 * Set a printer value to null to remove it from device.json.
 */
export async function pushPrintersToBridge(
  printers: BridgePrintersMap,
  opts: { replace?: boolean } = {},
): Promise<boolean> {
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/device-config`, {
        method: "POST",
        headers: bridgeJsonHeaders(),
        body: JSON.stringify({ printers, replacePrinters: opts.replace === true }),
      }, 3000);
      if (res.ok) {
        // Trigger a hot-reload so the bridge picks up the new file immediately
        await reloadBridgeConfig().catch(() => null);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

/** Tell the bridge to re-read device.json from disk. Fire-and-forget. */
export async function reloadBridgeConfig(): Promise<boolean> {
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/reload-config`, { method: "POST" }, 2000);
      if (res.ok) return true;
    } catch { /* try next */ }
  }
  return false;
}

// ── Network printer discovery ───────────────────────────────
export interface DiscoveredPrinter {
  ip: string;
  port: number;
  status: "open";
  label?: string;
}
export interface DiscoverResult {
  ok: boolean;
  subnet?: string;
  port?: number;
  scanned?: number;
  elapsedMs?: number;
  found: DiscoveredPrinter[];
  error?: string;
}

/**
 * Ask the local Print Bridge to scan the LAN for devices with the given
 * TCP port open (defaults to 9100 — thermal printers). Subnet is the
 * /24 prefix like "192.168.1"; when omitted the bridge auto-detects it.
 */
export async function discoverNetworkPrinters(opts: {
  subnet?: string;
  port?: number;
  timeoutMs?: number;
  from?: number;
  to?: number;
} = {}): Promise<DiscoverResult> {
  const body: Record<string, unknown> = {};
  if (opts.subnet)    body.subnet    = opts.subnet;
  if (opts.port)      body.port      = opts.port;
  if (opts.timeoutMs) body.timeoutMs = opts.timeoutMs;
  if (opts.from)      body.from      = opts.from;
  if (opts.to)        body.to        = opts.to;

  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/discover-network-printers`, {
        method: "POST",
        headers: bridgeJsonHeaders(),
        body: JSON.stringify(body),
      }, 90_000);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, found: [], error: err?.error || `http_${res.status}` };
      }
      const json = await res.json();
      return {
        ok: !!json?.ok,
        subnet: json?.subnet,
        port: json?.port,
        scanned: json?.scanned,
        elapsedMs: json?.elapsedMs,
        found: Array.isArray(json?.found) ? json.found : [],
        error: json?.error,
      };
    } catch { /* try next */ }
  }
  return { ok: false, found: [], error: "bridge_unreachable" };
}

/** Fetch the raw device.json from the bridge (incl. printers). null if no bridge. */
export async function pullRawDeviceJsonFromBridge(): Promise<Record<string, any> | null> {
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/device-config`, { method: "GET" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && typeof json === "object") return json;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Read the on-disk config from the bridge. Returns null if no bridge or no config.
 */
export async function pullConfigFromBridge(): Promise<DeviceConfig | null> {
  for (const base of bridgeCandidates()) {
    try {
      const res = await fetchWithTimeout(`${base}/device-config`, { method: "GET" });
      if (!res.ok) continue;
      const json = (await res.json()) as Partial<DeviceConfig> & { bridgeUrl?: string };
      if (!json || typeof json !== "object") continue;
      // If we hit it via a probe URL and no bridgeUrl is stored, remember this base
      const out: DeviceConfig = {
        bridgeUrl: normalizeBridgeUrl(json.bridgeUrl || base),
        branchId: json.branchId || "",
        terminalId: json.terminalId || "",
        label: json.label || "",
      };
      return out;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Run once at app boot. If localStorage is missing critical fields
 * (e.g. user just did "Clear browsing data"), restore them from the
 * bridge's on-disk copy. If localStorage already has them but the
 * bridge is empty, push the local copy up so future wipes are safe.
 *
 * Safe to call from any context — never throws.
 */
export async function hydrateConfigFromBridge(): Promise<void> {
  try {
    const local = getDeviceConfig();
    const remote = await pullConfigFromBridge();

    if (remote && (remote.branchId || remote.terminalId || remote.bridgeUrl)) {
      let restored = false;
      // Restore each missing field from the bridge
      if (!local.bridgeUrl && remote.bridgeUrl) { safeSet(KEYS.bridgeUrl, remote.bridgeUrl); restored = true; }
      if (!local.branchId && remote.branchId)   { safeSet(KEYS.branchId,   remote.branchId);   restored = true; }
      if (!local.terminalId && remote.terminalId) { safeSet(KEYS.terminalId, remote.terminalId); restored = true; }
      if (!local.label && remote.label)         { safeSet(KEYS.label,      remote.label);      restored = true; }
      if (restored) {
        try { console.info("[device-config] Restored from Print Bridge after browser wipe"); } catch {}
        notifyChange();
      }
      return;
    }

    // Bridge has nothing — push our local copy so it's safe next time
    if (local.branchId || local.terminalId || local.bridgeUrl) {
      await pushConfigToBridge();
    }
  } catch {
    /* never block app boot */
  }
}

/** True only when bridge URL + branch + terminal are all set. */
export function isDeviceFullyConfigured(): boolean {
  const cfg = getDeviceConfig();
  return Boolean(cfg.bridgeUrl && cfg.branchId && cfg.terminalId);
}

/**
 * Operational readiness — does NOT require Print Bridge.
 * If true, the cashier can open POS, add items and complete sales.
 * Printing may still be unavailable; that's handled separately.
 */
export function isDeviceOperationallyReady(): boolean {
  const cfg = getDeviceConfig();
  return Boolean(cfg.branchId && cfg.terminalId);
}

/** Printing readiness — only true when the Print Bridge URL is set. */
export function isPrintingReady(): boolean {
  return Boolean(getBridgeUrl());
}

/**
 * Central guard used by ANY POS function before saving / printing / posting.
 * Compares device.branchId to terminal.branch_id and (optionally) cash_box.branch_id
 * passed by the caller. Returns ok:false with a human reason when blocked.
 */
export interface GuardCheckInput {
  terminalBranchId?: string | null;
  cashBoxBranchId?: string | null;
}
export interface GuardResult {
  ok: boolean;
  reason?: string;
}
export function assertDeviceReady(input: GuardCheckInput = {}): GuardResult {
  const cfg = getDeviceConfig();
  // ⚠️ Print Bridge is intentionally NOT checked here. Printing is a
  // non-critical capability — it must never block selling. The cashier
  // can complete sales and we surface a soft warning banner separately.
  if (!cfg.branchId) return { ok: false, reason: "هذا الجهاز غير مهيأ — لم يتم اختيار الفرع." };
  if (!cfg.terminalId) return { ok: false, reason: "هذا الجهاز غير مهيأ — لم يتم اختيار محطة POS." };

  const { terminalBranchId, cashBoxBranchId } = input;
  if (terminalBranchId && terminalBranchId !== cfg.branchId) {
    return { ok: false, reason: "تعارض: فرع الجهاز يختلف عن فرع Terminal. راجع إعدادات الجهاز." };
  }
  if (cashBoxBranchId && cashBoxBranchId !== cfg.branchId) {
    return { ok: false, reason: "تعارض: فرع الجهاز يختلف عن فرع الصندوق المختار. راجع إعدادات الجهاز." };
  }
  if (terminalBranchId && cashBoxBranchId && terminalBranchId !== cashBoxBranchId) {
    return { ok: false, reason: "تعارض: فرع Terminal يختلف عن فرع الصندوق. راجع إعدادات الجهاز." };
  }
  return { ok: true };
}

// ── Change notifications ────────────────────────────────────

const CHANGE_EVENT = "pos-device-config-changed";

function notifyChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore (SSR) */
  }
}

/** Subscribe to changes. Returns unsubscribe fn. */
export function onDeviceConfigChange(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(CHANGE_EVENT, listener);
  // Also listen to storage events from other tabs
  const storageListener = (e: StorageEvent) => {
    if (e.key && Object.values(KEYS).includes(e.key as any)) handler();
  };
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", storageListener);
  };
}