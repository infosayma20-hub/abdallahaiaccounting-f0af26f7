/**
 * Print Bridge Hook v3 — supports station-based routing
 */
import { useCallback } from "react";
import {
  sendToBridge,
  sendRoutedPrint,
  checkBridgeStatus,
  checkBridgeHealth,
  testPrinterConnection,
  bridgePrintAll as _bridgePrintAll,
  bridgeOpenDrawer,
} from "@/lib/print-bridge-client";
import { toast } from "sonner";

export interface PrintItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  note?: string;
  stationId?: string;
  /** Which printer key this item routes to */
  printerKey?: "kitchen" | "grill" | "pizza" | "none";
  modifiers?: { option_name: string; extra_price?: number }[];
  /** Station IDs from product.print_station_ids */
  print_station_ids?: string[];
}

/** Maps station IDs to their printer IDs in pos_printers */
export type StationPrinterMap = Record<string, string>;

export interface PrintOrder {
  id?: string;
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
  /**
   * Kitchen-only banner (e.g. "طلب معدل — بديل عن فاتورة #...").
   * Printed ONLY on KOT / kitchen / grill / pizza tickets.
   * NEVER printed on the customer receipt.
   */
  kitchenNote?: string;
  /** Station ID — used by bridge to route to the correct printer */
  stationId?: string;
  /** Station name — used by bridge to map to printer key */
  stationName?: string;
  /** Marks this print job as a CANCELLATION ticket (to alert kitchen to stop preparation) */
  isCancellation?: boolean;
  /** Reason text shown on the cancellation ticket */
  cancelReason?: string;
  /** Who cancelled — printed on the ticket */
  cancelledBy?: string;
  /** Customer name (for delivery / takeaway / call-center orders) */
  customerName?: string;
  /** Customer phone (for delivery / takeaway / call-center orders) */
  customerPhone?: string;
  /** Pickup note — e.g. "استلام من فيصل" */
  pickupBy?: string;
}

export function usePrintBridge() {
  const checkBridge = useCallback(async (): Promise<boolean> => {
    return checkBridgeStatus();
  }, []);

  const getHealth = useCallback(async () => {
    return checkBridgeHealth();
  }, []);

  const testPrinter = useCallback(async (ip: string, port: number) => {
    return testPrinterConnection(ip, port);
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

  /** Print with station-based routing — items are grouped by station */
  const printRouted = useCallback(async (order: PrintOrder) => {
    return sendRoutedPrint(order);
  }, []);

  const openDrawer = useCallback(() => {
    bridgeOpenDrawer();
  }, []);

  return { checkBridge, getHealth, testPrinter, printReceipt, printKitchen, printAll, printRouted, openDrawer };
}
