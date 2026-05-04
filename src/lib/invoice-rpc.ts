/**
 * Phase 5H — Invoice ledger RPC adapter.
 *
 * Wraps `create_invoice_with_entry` so the InvoiceCreatePage can route the
 * GL posting through the canonical RPC instead of a direct
 * `transactions.insert`. The RPC enforces `_fc_validate_postable_account`
 * (Phase 5G.2) and uses tenant sub-accounts (Phase 5G.3).
 *
 * Gated by the `invoices_use_rpc` feature flag (default OFF). When the flag
 * is OFF, callers keep the legacy direct-insert path. When ON, the ledger
 * is created via this adapter; the `invoices` row + items still happen in
 * the existing UI flow (the RPC only touches `transactions`).
 */
import { supabase } from "@/integrations/supabase/client";

export function isInvoicesRpcEnabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags.invoices_use_rpc === true;
  } catch {
    return false;
  }
}

export interface InvoiceLedgerRpcParams {
  userId: string;
  contactId?: string | null;
  contactName?: string | null;
  amount: number;
  description?: string | null;
  paymentMethod?: string;       // 'نقدي' | 'بنك' | 'شيك' | 'آجل'
  currency?: string;
  idempotencyKey?: string | null;
  invoiceType?: "sales" | "purchase";
  transactionDate?: string | null;   // YYYY-MM-DD
  foreignAmount?: number | null;
  exchangeRate?: number | null;
  reference?: string | null;
  workshopId?: string | null;
  costCenterName?: string | null;
}

export interface InvoiceLedgerRpcResult {
  success: boolean;
  duplicate?: boolean;
  transaction_id?: string | null;
  debit_account_code?: string | null;
  credit_account_code?: string | null;
  error?: string;
}

export async function callCreateInvoiceLedgerRpc(
  p: InvoiceLedgerRpcParams,
): Promise<InvoiceLedgerRpcResult> {
  const { data, error } = await supabase.rpc("create_invoice_with_entry", {
    p_user_id: p.userId,
    p_contact_id: p.contactId ?? null,
    p_contact_name: p.contactName ?? null,
    p_amount: p.amount,
    p_description: p.description ?? null,
    p_payment_method: p.paymentMethod ?? "آجل",
    p_currency: p.currency ?? "شيكل",
    p_items: [],
    p_idempotency_key: p.idempotencyKey ?? null,
    p_invoice_type: p.invoiceType ?? "sale",
    p_transaction_date: p.transactionDate ?? null,
    p_foreign_amount: p.foreignAmount ?? null,
    p_exchange_rate: p.exchangeRate ?? null,
    p_reference: p.reference ?? null,
    p_workshop_id: p.workshopId ?? null,
    p_cost_center_name: p.costCenterName ?? null,
  } as any);

  if (error) return { success: false, error: error.message };
  return (data as unknown as InvoiceLedgerRpcResult) ?? { success: false, error: "empty response" };
}
