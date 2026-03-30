/**
 * Print Bridge Hook — thin React wrapper around print-bridge-client.ts
 */
import { useCallback } from "react";
import { sendToBridge, checkBridgeStatus, bridgePrintAll as _bridgePrintAll, bridgeOpenDrawer } from "@/lib/print-bridge-client";
import { toast } from "sonner";

export interface PrintItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  note?: string;
  stationId?: string;
  printerKey?: "kitchen" | "grill" | "pizza" | "none";
  modifiers?: { option_name: string; extra_price?: number }[];
}

/** Maps station IDs to their printer IDs in pos_printers */
export type StationPrinterMap = Record<string, string>;

export interface PrintOrder {
  orderNumber: string | number;
  queueNumber?: number;
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
  /** Station ID — used by bridge to route to the correct printer */
  stationId?: string;
}

export function usePrintBridge() {
  const checkBridge = useCallback(async (): Promise<boolean> => {
    return checkBridgeStatus();
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
        console.warn("Print bridge unavailable");
      });
  }, []);

  const openDrawer = useCallback(() => {
    bridgeOpenDrawer();
  }, []);

  return { checkBridge, printReceipt, printKitchen, printAll, openDrawer };
}
