/**
 * Standalone Print Bridge client — can be used outside React components.
 * All printing goes through the local bridge service (no browser dialogs).
 */

import type { PrintOrder } from "@/hooks/usePrintBridge";

const BRIDGE_URL = "http://192.168.1.65:3001";

type PrintType = "receipt" | "kitchen" | "both";

interface BridgeResult {
  success: boolean;
  results?: { name: string; success: boolean; error?: string }[];
}

export async function sendToBridge(type: PrintType, order: PrintOrder): Promise<BridgeResult> {
  const response = await fetch(`${BRIDGE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, order }),
    signal: AbortSignal.timeout(8000),
  });
  return response.json();
}

export async function checkBridgeStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget print (silent, no await needed) */
export function bridgePrintAll(order: PrintOrder): void {
  sendToBridge("both", order).catch(() => {
    console.warn("Print bridge unavailable");
  });
}

/** Send cash drawer kick command via bridge */
export function bridgeOpenDrawer(): void {
  fetch(`${BRIDGE_URL}/drawer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    console.warn("Print bridge unavailable — drawer kick failed");
  });
}
