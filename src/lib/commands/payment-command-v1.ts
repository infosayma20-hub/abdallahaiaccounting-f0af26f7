/**
 * Payment Command V1 — Stage 3B (NON-CHEQUE PAYMENTS ONLY).
 *
 * Reuses the certified Stage 3A architecture (CommandEnvelopeV1,
 * CommandContextV1, Posting Engine V1, Transactional Outbox V1). It does NOT
 * create a second framework and does NOT re-implement any accounting rule:
 * the server command wraps the SAME `create_payment_with_entry` behaviour and
 * only routes eligible payments through Posting Engine V1.
 *
 * Hard exclusions (always stay on the legacy path):
 *   - anything cheque related (method, cheque fields, 2120/1150 accounts)
 *   - payments carrying invoice allocations (uncertified in Stage 3B)
 *
 * Routed ONLY when the tenant flag `commands.payment_v1` is true.
 * Default OFF for every tenant.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildCommandEnvelopeV1,
  type CommandEnvelopeV1,
  type CommandResultV1,
  type CommandSource,
} from "./command-envelope-v1";
import type { VoucherAllocation, VoucherRpcResult } from "@/lib/voucher-rpc";

export const PAYMENT_COMMAND_V1_TYPE = "finance.create_payment.v1";
export const PAYMENT_COMMAND_V1_FLAG = "commands.payment_v1";

/** Cheque payment methods that must never enter the V1 posting engine. */
const CHEQUE_METHODS = ["شيك", "شيكات", "cheque", "check"];
/** Cheque-bearing payload fields. */
const CHEQUE_FIELDS = ["cheque_id", "cheque_ids", "cheques", "cheque_number", "cheque_book_id"];
/** Cheque GL account prefixes (issued cheques / cheques under collection). */
const CHEQUE_ACCOUNT_PREFIXES = ["2120", "1150"];

export interface PaymentCommandPayloadV1 {
  contact_id?: string | null;
  contact_name?: string | null;
  amount: number;
  payment_method?: string | null;
  description?: string | null;
  currency?: string | null;
  voucher_date?: string | null; // YYYY-MM-DD
  exchange_rate?: number | null;
  reference?: string | null;
  cash_account_code?: string | null;
  contact_account_code?: string | null;
  notes?: string | null;
  employee_id?: string | null;
  workshop_id?: string | null;
  cost_center_id?: string | null;
  allocations?: VoucherAllocation[] | null;
  [key: string]: unknown;
}

export interface PaymentCommandResultV1 extends CommandResultV1 {
  transaction_id?: string | null;
  transaction_ids?: string[];
  allocations?: any;
  /** 0 / absent = legacy writer, 1 = Posting Engine V1. */
  posting_version?: number;
  posting_intent_id?: string | null;
  /** True when the cheque guard forced the legacy path. */
  cheque_excluded?: boolean;
  shadow?: { match?: boolean; differences?: string[]; reason?: string } | null;
}

export interface SubmitPaymentCommandInput {
  idempotencyKey: string;
  payload: PaymentCommandPayloadV1;
  source?: CommandSource;
  deviceId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
}

/** Tenant feature flag. Default false on any error / missing flag / settings. */
export function isPaymentCommandV1Enabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags[PAYMENT_COMMAND_V1_FLAG] === true;
  } catch {
    return false;
  }
}

/**
 * Client-side mirror of the server guard `is_cheque_payment_v1`.
 * Advisory only — the server guard is authoritative.
 */
export function isChequePaymentPayloadV1(payload: PaymentCommandPayloadV1 | null | undefined): boolean {
  if (!payload) return false;
  const method = String(payload.payment_method ?? "").trim().toLowerCase();
  if (CHEQUE_METHODS.some((m) => method === m.toLowerCase())) return true;
  for (const field of CHEQUE_FIELDS) {
    const value = (payload as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== "") return true;
  }
  const codes = [payload.cash_account_code, payload.contact_account_code];
  return codes.some(
    (code) => !!code && CHEQUE_ACCOUNT_PREFIXES.some((p) => String(code).startsWith(p)),
  );
}

/** Payments carrying allocations remain on the legacy path (uncertified). */
export function hasAllocationsV1(payload: PaymentCommandPayloadV1 | null | undefined): boolean {
  return Array.isArray(payload?.allocations) && (payload!.allocations as VoucherAllocation[]).length > 0;
}

/** Only these payments may be posted by Posting Engine V1. */
export function isPaymentPostingEngineEligible(payload: PaymentCommandPayloadV1 | null | undefined): boolean {
  if (!payload) return false;
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) return false;
  if (isChequePaymentPayloadV1(payload)) return false;
  if (hasAllocationsV1(payload)) return false;
  return true;
}

export function buildPaymentCommandEnvelopeV1(
  input: SubmitPaymentCommandInput,
): CommandEnvelopeV1<PaymentCommandPayloadV1> {
  if (!Number.isFinite(input.payload?.amount) || Number(input.payload.amount) <= 0) {
    throw new Error("amount must be greater than zero");
  }
  return buildCommandEnvelopeV1<PaymentCommandPayloadV1>({
    commandType: PAYMENT_COMMAND_V1_TYPE,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    source: input.source ?? "web",
    deviceId: input.deviceId ?? null,
    companyId: input.companyId ?? null,
    branchId: input.branchId ?? null,
    correlationId: input.correlationId ?? null,
    effectiveDate: input.payload.voucher_date ?? null,
  });
}

/** Executes the command. One PostgreSQL transaction, server-resolved context. */
export async function submitPaymentCommandV1(
  input: SubmitPaymentCommandInput,
): Promise<PaymentCommandResultV1> {
  const envelope = buildPaymentCommandEnvelopeV1(input);
  const { data, error } = await supabase.rpc("create_payment_command_v1" as any, {
    p_envelope: envelope as any,
  } as any);
  if (error) throw error;
  return data as unknown as PaymentCommandResultV1;
}

/** Adapts a V1 command result to the legacy `VoucherRpcResult` shape. */
export function toLegacyVoucherResult(r: PaymentCommandResultV1): VoucherRpcResult {
  return {
    success: r?.status === "succeeded",
    duplicate: r?.replayed === true,
    transaction_id: r?.transaction_id ?? null,
    allocations: r?.allocations ?? undefined,
    error: r?.error,
  };
}
