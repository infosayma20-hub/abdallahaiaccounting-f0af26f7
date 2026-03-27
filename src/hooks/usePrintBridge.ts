/**
 * Print Bridge Hook — connects to local print-bridge.js service
 * running on the cashier's machine (localhost:3001)
 * 
 * The bridge handles ESC/POS communication with thermal printers
 * via TCP port 9100 on the local network.
 */
import { useCallback } from "react";
import { toast } from "sonner";

const BRIDGE_URL = "http://192.168.1.65:3001";

export interface PrintItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  note?: string;
  printerKey?: "kitchen" | "grill" | "pizza" | "none";
  modifiers?: { option_name: string; extra_price?: number }[];
}

export interface PrintOrder {
  orderNumber: string | number;
  date?: string;
  time?: string;
  branchName: string;
  cashier?: string;
  tableNumber?: string;
  orderType?: string;
  items: PrintItem[];
  subtotal?: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
  currency?: string;
  exchangeRate?: number;
  foreignAmount?: number;
  tenderedAmount?: number;
  change?: number;
  orderNote?: string;
}

interface BridgeResult {
  success: boolean;
  results?: { name: string; success: boolean; error?: string }[];
}

type PrintType = "receipt" | "kitchen" | "both";

async function sendToBridge(type: PrintType, order: PrintOrder): Promise<BridgeResult> {
  const response = await fetch(`${BRIDGE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, order }),
    signal: AbortSignal.timeout(8000),
  });
  return response.json();
}

export function usePrintBridge() {
  const checkBridge = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const printReceipt = useCallback(async (order: PrintOrder) => {
    return sendToBridge("receipt", order);
  }, []);

  const printKitchen = useCallback(async (order: PrintOrder) => {
    return sendToBridge("kitchen", order);
  }, []);

  /** Fire-and-forget: prints receipt + kitchen tickets simultaneously */
  const printAll = useCallback((order: PrintOrder) => {
    sendToBridge("both", order)
      .then((result) => {
        if (!result.success) {
          const failed = result.results
            ?.filter((r) => !r.success)
            .map((r) => r.name)
            .join("، ");
          if (failed) {
            toast.warning(`⚠️ لم تستجب: ${failed}`);
          }
        }
      })
      .catch(() => {
        // Silent — bridge not running, fallback to browser print
        console.warn("Print bridge unavailable — falling back to browser print");
      });
  }, []);

  return { checkBridge, printReceipt, printKitchen, printAll };
}
