/**
 * Print Bridge Client v3 — supports station-based routing
 * and Arabic encoding instructions for the local bridge.
 */

import type { PrintOrder } from "@/hooks/usePrintBridge";
import { getBridgeUrl, getDeviceBranchId, setBridgeUrl, syncBranchPrintersToBridge } from "@/lib/device-config";
import { supabase } from "@/integrations/supabase/client";
import { getLocalNetworkBlockedMessage, withLocalNetworkAccess, type LocalNetworkRequestInit } from "@/lib/local-network-fetch";

type PrintType = "receipt" | "kitchen" | "both";

interface BridgeResult {
  success: boolean;
  results?: { name: string; success: boolean; error?: string }[];
}

export class PrintBridgeConnectionError extends Error {
  code: "iframe_blocked" | "browser_blocked" | "network_failed";

  constructor(code: "iframe_blocked" | "browser_blocked" | "network_failed", message: string) {
    super(message);
    this.name = "PrintBridgeConnectionError";
    this.code = code;
  }
}

function isEmbeddedPreview() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getBridgeBlockedMessage() {
  const url = getBridgeUrl();
  if (isEmbeddedPreview()) {
    return "المعاينة المدمجة داخل Lovable تمنع Chrome من الوصول إلى الشبكة المحلية. افتح التطبيق في تبويب مستقل ثم جرّب الطباعة.";
  }
  if (!url) {
    return "لم يتم إعداد عنوان Print Bridge لهذا الجهاز. اذهب إلى إعدادات الجهاز وأدخل العنوان (مثال: http://192.168.1.65:3001).";
  }
  if (window.isSecureContext) {
    return getLocalNetworkBlockedMessage();
  }
  return `تعذر الوصول إلى Print Bridge على ${url}. تأكد أن الخدمة تعمل على نفس الشبكة والجهاز.`;
}

type BridgeRequestInit = LocalNetworkRequestInit;

function bridgeCandidates(): string[] {
  const configured = getBridgeUrl();
  return [configured, "http://127.0.0.1:3001", "http://localhost:3001"].filter(
    (url, index, list): url is string => Boolean(url) && list.indexOf(url) === index,
  );
}

async function bridgeFetch(path: string, init: BridgeRequestInit = {}) {
  const baseUrl = getBridgeUrl();
  if (!baseUrl) {
    throw new PrintBridgeConnectionError(
      "network_failed",
      "لم يتم إعداد عنوان Print Bridge لهذا الجهاز. افتح إعدادات الجهاز وأدخل العنوان.",
    );
  }
  try {
    return await fetch(`${baseUrl}${path}`, withLocalNetworkAccess({
      ...init,
    }));
  } catch {
    const message = getBridgeBlockedMessage();
    throw new PrintBridgeConnectionError(
      isEmbeddedPreview() ? "iframe_blocked" : window.isSecureContext ? "browser_blocked" : "network_failed",
      message,
    );
  }
}

/** Send a print job — type can be receipt, kitchen, or both */
export async function sendToBridge(type: PrintType, order: PrintOrder): Promise<BridgeResult> {
  const response = await bridgeFetch("/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, order, stationId: order.stationId }),
    signal: AbortSignal.timeout(8000),
  });
  return response.json();
}

/** Send station-routed kitchen tickets — one per station with filtered items */
export async function sendRoutedPrint(order: PrintOrder): Promise<BridgeResult> {
  const response = await bridgeFetch("/print-routed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
    signal: AbortSignal.timeout(12000),
  });
  return response.json();
}

/** Test a specific printer by IP */
export async function testPrinterConnection(ip: string, port: number): Promise<boolean> {
  try {
    const res = await bridgeFetch("/test-printer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, port }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

/** Test a Windows / USB printer by its exact Windows printer name. */
export async function testWindowsPrinter(
  windowsPrinterName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await bridgeFetch("/test-printer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "windows", windowsPrinterName }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { success: data?.success === true, error: data?.error };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/** Check bridge health + printer statuses */
export async function checkBridgeHealth(): Promise<{
  online: boolean;
  printers?: { key: string; name: string; ip: string; connected: boolean; source?: string; subnetMismatch?: boolean; port?: number }[];
  source?: string;
  synced?: boolean;
  subnetWarnings?: { key: string; name: string; ip: string; message: string }[];
  hostSubnets?: { iface: string; ip?: string; cidr: string }[];
  subnetCheckSupported?: boolean;
  logo?: boolean;
}> {
  try {
    const res = await bridgeFetch("/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { online: false };
    const data = await res.json();
    const printers = Array.isArray(data.printers)
      ? data.printers.map((printer: { key?: string; name?: string; ip?: string; port?: number; connected?: boolean; status?: string; subnet_mismatch?: boolean }) => ({
          key: printer.key || printer.name || "printer",
          name: printer.name || "",
          ip: printer.ip || "",
          port: printer.port,
          connected: printer.connected ?? printer.status === "online",
          source: data.printers_source,
          subnetMismatch: !!printer.subnet_mismatch,
        }))
      : [];
    if (data.printers_source === "fallback" || printers.some((p) => /^192\.168\.1\.5[0-3]$/.test(p.ip))) {
      const branchId = getDeviceBranchId();
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
      if (user?.id && branchId) {
        const sync = await syncBranchPrintersToBridge(branchId).catch(() => ({ ok: false, count: 0 }));
        if (sync.ok) {
          const fresh = await bridgeFetch("/health", { signal: AbortSignal.timeout(5000) }).catch(() => null);
          if (fresh?.ok) {
            const freshData = await fresh.json();
            const freshPrinters = Array.isArray(freshData.printers)
              ? freshData.printers.map((printer: { key?: string; name?: string; ip?: string; port?: number; connected?: boolean; status?: string; subnet_mismatch?: boolean }) => ({
                  key: printer.key || printer.name || "printer",
                  name: printer.name || "",
                  ip: printer.ip || "",
                  port: printer.port,
                  connected: printer.connected ?? printer.status === "online",
                  source: freshData.printers_source,
                  subnetMismatch: !!printer.subnet_mismatch,
                }))
              : [];
            return {
              online: true,
              printers: freshPrinters,
              source: freshData.printers_source,
              // Only flag "synced" when the bridge actually adopted our branch
              // printers (i.e. dropped the baked-in fallback list).
              synced: freshData.printers_source !== "fallback",
              subnetWarnings: Array.isArray(freshData.subnet_warnings) ? freshData.subnet_warnings : [],
              hostSubnets: Array.isArray(freshData.host_subnets) ? freshData.host_subnets : [],
              subnetCheckSupported: !!freshData.subnet_check,
              logo: typeof freshData.logo === "boolean" ? freshData.logo : (typeof freshData.logo_present === "boolean" ? freshData.logo_present : undefined),
            };
          }
        }
      }
    }
    return {
      online: true,
      printers,
      source: data.printers_source,
      subnetWarnings: Array.isArray(data.subnet_warnings) ? data.subnet_warnings : [],
      hostSubnets: Array.isArray(data.host_subnets) ? data.host_subnets : [],
      subnetCheckSupported: !!data.subnet_check,
      logo: typeof data.logo === "boolean" ? data.logo : (typeof data.logo_present === "boolean" ? data.logo_present : undefined),
    };
  } catch {
    return { online: false };
  }
}

export async function checkBridgeStatus(): Promise<boolean> {
  for (const baseUrl of bridgeCandidates()) {
    try {
      // IMPORTANT: keep this fetch as minimal as possible.
      // Do NOT add `mode: "cors"` or `targetAddressSpace` here — those
      // trigger a Private Network Access preflight that older bridge
      // versions don't answer, causing "Failed to fetch" even when the
      // bridge is actually running. A plain GET to /health works for
      // every bridge version (old and v6.3.6-clean).
      const res = await fetch(`${baseUrl}/health?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      // Bridge is "connected" as long as /health responds with status ok,
      // even if device.json is missing (unbound). The onboarding page
      // surfaces the "غير مربوط" state separately via pullConfigFromBridge.
      if (data && data.status === "ok") {
        if (!getBridgeUrl()) setBridgeUrl(baseUrl);
        return true;
      }
    } catch {
      /* try next candidate */
    }
  }
  return false;
}

export function getPrintBridgeUrl() {
  return getBridgeUrl();
}

export function getPrintBridgeBlockedMessage() {
  return getBridgeBlockedMessage();
}

/** Fire-and-forget: prints receipt + routed kitchen tickets */
export function bridgePrintAll(order: PrintOrder): void {
  sendToBridge("both", order).catch(() => {
    console.warn("Print bridge unavailable");
  });
}

/** Send cash drawer kick command via bridge */
export function bridgeOpenDrawer(): void {
  bridgeFetch("/drawer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    console.warn("Print bridge unavailable — drawer kick failed");
  });
}
