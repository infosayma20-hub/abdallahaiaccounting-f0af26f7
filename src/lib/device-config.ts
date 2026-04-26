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

const KEYS = {
  bridgeUrl: "pos-device:bridge-url",
  branchId: "pos-device:branch-id",
  terminalId: "pos-device:terminal-id",
  label: "pos-device:label",
} as const;

const DEFAULT_BRIDGE_PORT = 3001;

/** Default fallback. Used only if nothing is configured yet. Empty string = unconfigured. */
const DEFAULT_BRIDGE_URL = "";

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
}

// ── Terminal ────────────────────────────────────────────────

export function getDeviceTerminalId(): string {
  return safeGet(KEYS.terminalId);
}

export function setDeviceTerminalId(id: string): void {
  safeSet(KEYS.terminalId, id);
  notifyChange();
}

// ── Label ───────────────────────────────────────────────────

export function getDeviceLabel(): string {
  return safeGet(KEYS.label);
}

export function setDeviceLabel(label: string): void {
  safeSet(KEYS.label, label);
  notifyChange();
}

// ── Bulk operations ─────────────────────────────────────────

export interface DeviceConfig {
  bridgeUrl: string;
  branchId: string;
  terminalId: string;
  label: string;
}

export function getDeviceConfig(): DeviceConfig {
  return {
    bridgeUrl: getBridgeUrl(),
    branchId: getDeviceBranchId(),
    terminalId: getDeviceTerminalId(),
    label: getDeviceLabel(),
  };
}

export function clearDeviceConfig(): void {
  Object.values(KEYS).forEach(k => safeSet(k, ""));
  notifyChange();
}

/** True only when bridge URL + branch + terminal are all set. */
export function isDeviceFullyConfigured(): boolean {
  const cfg = getDeviceConfig();
  return Boolean(cfg.bridgeUrl && cfg.branchId && cfg.terminalId);
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