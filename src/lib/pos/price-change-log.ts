/**
 * POS in-cart price change audit.
 *
 * Every time a cashier overrides the catalog price of a cart line, the POS
 * asks for a reason and records the change here (who / when / why / how much).
 * Rows are written when the order lines are persisted, so each entry is tied
 * to a real order.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PriceChangeEntry {
  product_id: string | null;
  product_name: string;
  qty: number;
  original_price: number;
  new_price: number;
  reason: string;
}

export interface PriceChangeContext {
  dataOwnerId: string;
  branchId?: string | null;
  branchName?: string | null;
  sessionId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  changedBy?: string | null;
  changedByName?: string | null;
}

export async function logPriceChanges(
  ctx: PriceChangeContext,
  entries: PriceChangeEntry[],
): Promise<void> {
  if (!ctx.dataOwnerId || entries.length === 0) return;

  const rows = entries.map(e => ({
    user_id: ctx.dataOwnerId,
    branch_id: ctx.branchId || null,
    branch_name: ctx.branchName || null,
    session_id: ctx.sessionId || null,
    order_id: ctx.orderId || null,
    order_number: ctx.orderNumber || null,
    product_id: e.product_id,
    product_name: e.product_name,
    qty: e.qty,
    original_price: e.original_price,
    new_price: e.new_price,
    diff_amount: (e.new_price - e.original_price) * e.qty,
    reason: e.reason,
    changed_by: ctx.changedBy || null,
    changed_by_name: ctx.changedByName || null,
  }));

  const { error } = await supabase.from("pos_price_change_log" as any).insert(rows as any);
  // Never block the sale on an audit failure — surface it in the console only.
  if (error) console.error("[price-change-log] insert failed", error);
}
