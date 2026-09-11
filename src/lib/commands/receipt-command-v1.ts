/**
 * Receipt Command V1 — first Unify command pilot.
 *
 * Scope (deliberately tiny):
 *   - simple receipt vouchers only (contact based, single currency)
 *   - routed ONLY when the tenant flag `commands.receipt_v1` is true
 *   - default OFF for every tenant
 *
 * The command is a thin, versioned, audited boundary in front of the SAME
 * `create_receipt_with_entry` logic used today. It does not re-implement any
 * accounting rule, numbering rule, VAT rule, allocation rule or posting rule.
 *
 * This command is NOT part of any AI tool surface.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildCommandEnvelopeV1,
  type CommandEnvelopeV1,
  type CommandResultV1,
  type CommandSource,
} from "./command-envelope-v1";
import type { VoucherAllocation, VoucherRpcResult } from "@/lib/voucher-rpc";

export const RECEIPT_COMMAND_V1_TYPE = "finance.create_receipt.v1";
export const RECEIPT_COMMAND_V1_FLAG = "commands.receipt_v1";

/**
 * Tenant feature flag. Default false on any error / missing flag / missing
 * settings. Completely independent from `vouchers_use_rpc`.
 */
export function isReceiptCommandV1Enabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags[RECEIPT_COMMAND_V1_FLAG] === true;
  } catch {
    return false;
  }
}

export interface ReceiptCommandPayloadV1 {
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
}

export interface ReceiptCommandResultV1 extends CommandResultV1 {
  transaction_id?: string | null;
  transaction_ids?: string[];
  allocations?: any;
}

export interface SubmitReceiptCommandInput {
  idempotencyKey: string;
  payload: ReceiptCommandPayloadV1;
  source?: CommandSource;
  deviceId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
}

export function buildReceiptCommandEnvelopeV1(
  input: SubmitReceiptCommandInput,
): CommandEnvelopeV1<ReceiptCommandPayloadV1> {
  if (!Number.isFinite(input.payload?.amount) || Number(input.payload.amount) <= 0) {
    throw new Error("amount must be greater than zero");
  }
  return buildCommandEnvelopeV1<ReceiptCommandPayloadV1>({
    commandType: RECEIPT_COMMAND_V1_TYPE,
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
export async function submitReceiptCommandV1(
  input: SubmitReceiptCommandInput,
): Promise<ReceiptCommandResultV1> {
  const envelope = buildReceiptCommandEnvelopeV1(input);
  const { data, error } = await supabase.rpc("create_receipt_command_v1" as any, {
    p_envelope: envelope as any,
  } as any);
  if (error) throw error;
  return data as unknown as ReceiptCommandResultV1;
}

/** Shadow validation: no writes, no financial effect. */
export async function validateReceiptCommandV1(
  input: SubmitReceiptCommandInput,
): Promise<any> {
  const envelope = buildReceiptCommandEnvelopeV1(input);
  const { data, error } = await supabase.rpc("validate_receipt_command_v1" as any, {
    p_envelope: envelope as any,
  } as any);
  if (error) throw error;
  return data;
}

/**
 * Adapts a V1 command result to the legacy `VoucherRpcResult` shape so the
 * existing UI branch stays byte-for-byte compatible with today's behaviour.
 */
export function toLegacyVoucherResult(r: ReceiptCommandResultV1): VoucherRpcResult {
  return {
    success: r?.status === "succeeded",
    duplicate: r?.replayed === true,
    transaction_id: r?.transaction_id ?? null,
    allocations: r?.allocations ?? undefined,
    error: r?.error,
  };
}
