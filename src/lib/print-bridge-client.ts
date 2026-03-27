/**
 * Standalone Print Bridge client — can be used outside React components.
 * All printing goes through the local bridge service (no browser dialogs).
 */

import type { PrintOrder } from "@/hooks/usePrintBridge";

const BRIDGE_URL = "http://192.168.1.65:3001";

type PrintType = "receipt" | "kitchen" | "both";
type BridgeTargetAddressSpace = "local" | "loopback";
type BridgeRequestInit = RequestInit & {
  targetAddressSpace?: BridgeTargetAddressSpace;
};

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
  if (isEmbeddedPreview()) {
    return "المعاينة المدمجة داخل Lovable تمنع Chrome من الوصول إلى الشبكة المحلية. افتح التطبيق في تبويب مستقل ثم جرّب الطباعة.";
  }

  if (window.isSecureContext) {
    return "Chrome حظر الوصول إلى Print Bridge المحلي. اسمح بالوصول للشبكة المحلية/المحتوى غير الآمن لهذا الموقع ثم أعد المحاولة.";
  }

  return "تعذر الوصول إلى Print Bridge على 192.168.1.65:3001. تأكد أن الخدمة تعمل على نفس الشبكة والجهاز.";
}

async function bridgeFetch(path: string, init: BridgeRequestInit = {}) {
  try {
    return await fetch(`${BRIDGE_URL}${path}`, {
      ...init,
      targetAddressSpace: "local",
    } as BridgeRequestInit);
  } catch {
    const message = getBridgeBlockedMessage();
    throw new PrintBridgeConnectionError(
      isEmbeddedPreview() ? "iframe_blocked" : window.isSecureContext ? "browser_blocked" : "network_failed",
      message,
    );
  }
}

export async function sendToBridge(type: PrintType, order: PrintOrder): Promise<BridgeResult> {
  const response = await bridgeFetch("/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, order }),
    signal: AbortSignal.timeout(8000),
  });
  return response.json();
}

export async function checkBridgeStatus(): Promise<boolean> {
  try {
    const res = await bridgeFetch("/status", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getPrintBridgeUrl() {
  return BRIDGE_URL;
}

export function getPrintBridgeBlockedMessage() {
  return getBridgeBlockedMessage();
}

/** Fire-and-forget print (silent, no await needed) */
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
