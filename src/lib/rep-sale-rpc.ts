/**
 * Rep Sale RPC adapter (atomic, mandatory).
 *
 * Wraps `create_rep_sale_atomic` which performs in ONE DB transaction:
 *   1) create invoice header + GL entry (via create_invoice_with_entry)
 *   2) insert invoice_items with cost_price + line_profit snapshot
 *   3) write stock_movements + decrement product quantity
 *      (skipped only if rep_disable_stock_deduction = true)
 *
 * This is the ONLY supported path for /rep/new-order.
 * The DB trigger `trg_guard_rep_invoice` rejects any direct insert into
 * invoices with source='rep' and linked_transaction_id IS NULL.
 */
import { supabase } from "@/integrations/supabase/client";

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
  discountType?: "percent" | "value" | null;
  discountValue?: number | null;
}

export interface RepSaleResult {
  success: boolean;
  duplicate?: boolean;
  invoice_id?: string;
  invoice_number?: string;
  transaction_id?: string;
  subtotal?: number;
  discount_amount?: number;
  total?: number;
  total_cost?: number;
  total_profit?: number;
  stock_deducted?: boolean;
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
    p_invoice_number: null,
    p_discount_type: p.discountType ?? null,
    p_discount_value: p.discountValue ?? 0,
  });

  if (error) return { success: false, error: error.message };
  return (data as RepSaleResult) ?? { success: false, error: "empty response" };
}
