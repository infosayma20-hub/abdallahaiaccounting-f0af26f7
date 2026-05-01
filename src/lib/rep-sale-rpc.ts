/**
 * Phase 7 — Rep Sale RPC adapter (atomic).
 *
 * Wraps `create_rep_sale_atomic` which performs in ONE DB transaction:
 *   1) create invoice header + GL entry (via create_invoice_with_entry, Phase 5H)
 *   2) insert invoice_items with cost_price + line_profit snapshot
 *   3) write stock_movements (rep warehouse) + decrement_stock_safe
 *   4) (cash only) create receipt voucher (via create_receipt_with_entry)
 *
 * Gated by `rep_use_rpc` feature flag in company_settings.feature_flags.
 * When OFF, RepNewOrderPage falls back to the legacy direct-insert path.
 */
import { supabase } from "@/integrations/supabase/client";

export function isRepRpcEnabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    return !!(flags && typeof flags === "object" && flags.rep_use_rpc === true);
  } catch {
    return false;
  }
}

export interface RepSaleItem {
  product_id: string;
  name: string;
  qty: number;
  price: number;
}

export interface RepSaleParams {
  userId: string;            // rep.user_id (tenant owner)
  salesRepId: string;        // sales_representatives.id
  warehouseId: string;       // rep warehouse
  vanDayId: string;
  contactId?: string | null; // required for credit
  contactName?: string | null;
  paymentMethod: "cash" | "credit";
  items: RepSaleItem[];
  idempotencyKey: string;
  invoiceNumber?: string | null;
}

export interface RepSaleResult {
  success: boolean;
  duplicate?: boolean;
  invoice_id?: string;
  invoice_number?: string;
  total?: number;
  total_cost?: number;
  total_profit?: number;
  error?: string;
}

export async function callCreateRepSaleAtomic(p: RepSaleParams): Promise<RepSaleResult> {
  const { data, error } = await (supabase as any).rpc("create_rep_sale_atomic", {
    p_user_id: p.userId,
    p_sales_rep_id: p.salesRepId,
    p_warehouse_id: p.warehouseId,
    p_van_day_id: p.vanDayId,
    p_contact_id: p.contactId ?? null,
    p_contact_name: p.contactName ?? null,
    p_payment_method: p.paymentMethod,
    p_items: p.items.map(i => ({
      product_id: i.product_id,
      name: i.name,
      qty: i.qty,
      price: i.price,
    })),
    p_idempotency_key: p.idempotencyKey,
    p_invoice_number: p.invoiceNumber ?? null,
  });

  if (error) return { success: false, error: error.message };
  return (data as RepSaleResult) ?? { success: false, error: "empty response" };
}
