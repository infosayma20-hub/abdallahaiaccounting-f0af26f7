/**
 * PostingIntentV1 — versioned accounting-intent contract (Stage 3A).
 *
 * The frontend NEVER defines authoritative GL postings. This module only
 * mirrors the server contract so callers can read/trace a posting result and
 * so parity can be asserted in tests. All authoritative resolution, validation
 * and writing happens inside `public.post_receipt_v1` on the database.
 */

export const POSTING_RECEIPT_V1_FLAG = "posting.receipt_v1";
export const POSTING_RECEIPT_V1_SHADOW_FLAG = "posting.receipt_v1_shadow";
export const POSTING_VERSION_V1 = 1;

/** Account roles resolved server-side for Receipt V1. */
export type ReceiptAccountRole =
  | "CASH"
  | "BANK"
  | "CHEQUES_RECEIVABLE"
  | "ACCOUNTS_RECEIVABLE"
  | "ACCOUNTS_RECEIVABLE_SUBLEDGER"
  | "EMPLOYEE_RECEIVABLE"
  | "EXPLICIT"
  | "EXPLICIT_SUBLEDGER";

export interface PostingIntentV1 {
  posting_intent_version: 1;
  posting_version: 1;
  source_type: "finance.receipt.command";
  effect_type: "receipt.gl";
  command_id?: string | null;
  correlation_id?: string | null;
  owner_id: string;
  company_id?: string | null;
  branch_id?: string | null;
  actor_id?: string | null;
  effective_date: string;
  currency: string;
  amount: number;
  base_amount: number;
  exchange_rate?: number | null;
  foreign_amount?: number | null;
  debit_role: ReceiptAccountRole | string;
  credit_role: ReceiptAccountRole | string;
  debit_account_code: string;
  credit_account_code: string;
  contact_id?: string | null;
  payment_method: string;
  balanced: true;
}

/** Shadow-mode comparison result returned by the command envelope. */
export interface PostingShadowResultV1 {
  match: boolean;
  differences?: string[];
  reason?: string;
  legacy_transaction_id?: string | null;
  posting_version?: number;
}

/**
 * Tenant feature flag. Default false on any error / missing flag.
 * Never enabled implicitly.
 */
export function isPostingReceiptV1Enabled(settings: unknown): boolean {
  return readFlag(settings, POSTING_RECEIPT_V1_FLAG);
}

export function isPostingReceiptV1ShadowEnabled(settings: unknown): boolean {
  return readFlag(settings, POSTING_RECEIPT_V1_SHADOW_FLAG);
}

function readFlag(settings: unknown, flag: string): boolean {
  try {
    const flags = (settings as any)?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    const value = flags[flag];
    return value === true || value === "true";
  } catch {
    return false;
  }
}

/**
 * Receipt V1 never posts allocation receipts through the posting engine —
 * allocation stays on the certified legacy path until a safe fixture exists.
 */
export function isPostingEngineEligible(payload: {
  allocations?: unknown[] | null;
  amount?: number | null;
}): boolean {
  if (!payload) return false;
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) return false;
  if (Array.isArray(payload.allocations) && payload.allocations.length > 0) return false;
  return true;
}

/** Debit = credit invariant for a single balanced double-entry effect. */
export function isBalancedIntent(intent: Pick<PostingIntentV1, "amount" | "base_amount">): boolean {
  const amount = Number(intent?.amount);
  const base = Number(intent?.base_amount ?? intent?.amount);
  return Number.isFinite(amount) && amount > 0 && Number.isFinite(base) && base === amount;
}

export interface LegacyPostingSnapshot {
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  currency: string;
  exchange_rate?: number | null;
  foreign_amount?: number | null;
  transaction_date: string;
  contact_id?: string | null;
}

/** Pure parity comparator mirroring `shadow_compare_receipt_posting_v1`. */
export function compareLegacyWithIntent(
  legacy: LegacyPostingSnapshot,
  intent: PostingIntentV1,
): PostingShadowResultV1 {
  const differences: string[] = [];
  const norm = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

  if (legacy.debit_account_code !== intent.debit_account_code) differences.push("debit_account_code");
  if (legacy.credit_account_code !== intent.credit_account_code) differences.push("credit_account_code");
  if (Number(legacy.amount) !== Number(intent.amount)) differences.push("amount");
  if (legacy.currency !== intent.currency) differences.push("currency");
  if (norm(legacy.exchange_rate) !== norm(intent.exchange_rate)) differences.push("exchange_rate");
  if (norm(legacy.foreign_amount) !== norm(intent.foreign_amount)) differences.push("foreign_amount");
  if (legacy.transaction_date !== intent.effective_date) differences.push("effective_date");
  if ((legacy.contact_id ?? null) !== (intent.contact_id ?? null)) differences.push("contact_id");

  return {
    match: differences.length === 0,
    differences,
    posting_version: POSTING_VERSION_V1,
  };
}
