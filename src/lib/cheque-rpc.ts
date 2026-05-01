/**
 * Phase 6 — Cheque lifecycle RPC adapter.
 *
 * This module wraps `create_cheque_lifecycle_event` so the UI can keep its
 * current shape while routing accounting writes through a single, audited DB
 * function. It is **gated** by the `cheques_use_rpc` feature flag and is OFF
 * by default. Existing direct-insert paths in ChequesPage remain the default.
 *
 * Supported events: register, deposit, collect, bounce, endorse, cancel,
 * cancel_with_reverse, pay_outbound, cashed, outgoing_bounced, recover,
 * return_to_customer.
 */
import { supabase } from "@/integrations/supabase/client";

export type ChequeRpcEvent =
  | "register"
  | "deposit"
  | "collect"
  | "bounce"
  | "endorse"
  | "cancel"
  | "cancel_with_reverse"
  | "pay_outbound"
  | "cashed"
  | "outgoing_bounced"
  | "recover"
  | "return_to_customer";

export interface ChequeRpcParams {
  userId: string;
  chequeId: string;
  event: ChequeRpcEvent;
  eventDate?: string;
  bankAccountCode?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  bankFees?: number | null;
  bankFeesAccountCode?: string | null;
  endorsedToContactId?: string | null;
  reason?: string | null;
}

export interface ChequeRpcResult {
  success: boolean;
  duplicate?: boolean;
  transaction_id?: string | null;
  fee_transaction_id?: string | null;
  reference?: string | null;
  new_status?: string | null;
  error?: string;
}

/**
 * Returns true if `cheques_use_rpc` is enabled in the tenant's company_settings.
 * Defaults to false on any error, missing flag, or missing settings.
 */
export function isChequesRpcEnabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags.cheques_use_rpc === true;
  } catch {
    return false;
  }
}

/**
 * Calls the `create_cheque_lifecycle_event` RPC.
 * Throws on hard failure; returns the result on success or duplicate.
 */
export async function callChequeLifecycleRpc(
  params: ChequeRpcParams,
): Promise<ChequeRpcResult> {
  const { data, error } = await supabase.rpc("create_cheque_lifecycle_event", {
    p_user_id: params.userId,
    p_cheque_id: params.chequeId,
    p_event: params.event,
    p_event_date: params.eventDate ?? new Date().toISOString().split("T")[0],
    p_bank_account_code: params.bankAccountCode ?? null,
    p_notes: params.notes ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_bank_fees: params.bankFees ?? null,
    p_bank_fees_account_code: params.bankFeesAccountCode ?? "5200",
    p_endorsed_to_contact_id: params.endorsedToContactId ?? null,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;
  return data as unknown as ChequeRpcResult;
}
