/**
 * Manual Journal Command V1 — Stage 3C (MANUAL JOURNALS ONLY).
 *
 * Reuses the certified Stage 3A/3B architecture (CommandEnvelopeV1,
 * CommandContextV1, Posting Engine V1, Transactional Outbox V1,
 * business_commands audit, idempotency, feature flags). It creates NO second
 * framework and re-implements NO accounting rule: the server command wraps the
 * SAME certified writer (`create_journal_entry_multi_party_atomic`) and only
 * routes eligible journals through Posting Engine V1.
 *
 * Hard exclusions (always stay on the legacy path):
 *   - system-generated journals (invoices, POS, payroll, inventory, assets,
 *     manufacturing, receipts, payments) — they never call this command
 *   - cheque-bearing journals
 *   - journals carrying invoice allocations (uncertified)
 *
 * Routed ONLY when the tenant flag `commands.manual_journal_v1` is true.
 * Default OFF for every tenant. Nothing in the UI calls it yet.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildCommandEnvelopeV1,
  type CommandEnvelopeV1,
  type CommandResultV1,
  type CommandSource,
} from "./command-envelope-v1";
import { pairJournalLines, type PairableLine } from "@/lib/journal-line-pairing";

export const MANUAL_JOURNAL_COMMAND_V1_TYPE = "finance.create_manual_journal.v1";
export const MANUAL_JOURNAL_COMMAND_V1_FLAG = "commands.manual_journal_v1";
export const MANUAL_JOURNAL_POSTING_V1_FLAG = "posting.manual_journal_v1";
export const MANUAL_JOURNAL_POSTING_V1_SHADOW_FLAG = "posting.manual_journal_v1_shadow";

/** A raw journal line as typed by the user (debit column / credit column). */
export interface ManualJournalEntryLineV1 {
  account_code: string;
  debit: number;
  credit: number;
  contact_id?: string | null;
  cost_center_id?: string | null;
  line_comment?: string | null;
}

/** A server-ready debit<->credit pair. */
export interface ManualJournalPairV1 {
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  contact_id?: string | null;
  cost_center_id?: string | null;
  description?: string | null;
}

export interface ManualJournalCommandPayloadV1 {
  entry_date: string; // YYYY-MM-DD
  description?: string | null;
  notes?: string | null;
  currency?: string | null;
  exchange_rate?: number | null;
  reference?: string | null;
  cost_center_id?: string | null;
  /** Free-form lines; the server pairs them authoritatively. */
  entries?: ManualJournalEntryLineV1[];
  /** Already-paired lines (legacy shape). */
  lines?: ManualJournalPairV1[];
  [key: string]: unknown;
}

export interface ManualJournalCommandResultV1 extends CommandResultV1 {
  transaction_id?: string | null;
  reference?: string | null;
  lines?: number;
  /** 0 / absent = legacy writer, 1 = Posting Engine V1. */
  posting_version?: number;
  posting_intent_id?: string | null;
  shadow?: { match?: boolean; differences?: string[]; reason?: string } | null;
}

export interface SubmitManualJournalCommandInput {
  idempotencyKey: string;
  payload: ManualJournalCommandPayloadV1;
  source?: CommandSource;
  deviceId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
}

function readFlag(settings: any, flag: string): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags[flag] === true || flags[flag] === "true";
  } catch {
    return false;
  }
}

/** Tenant feature flag. Default false on any error / missing flag / settings. */
export function isManualJournalCommandV1Enabled(settings: any): boolean {
  return readFlag(settings, MANUAL_JOURNAL_COMMAND_V1_FLAG);
}

export function isManualJournalPostingV1Enabled(settings: any): boolean {
  return readFlag(settings, MANUAL_JOURNAL_POSTING_V1_FLAG);
}

export function isManualJournalPostingV1ShadowEnabled(settings: any): boolean {
  return readFlag(settings, MANUAL_JOURNAL_POSTING_V1_SHADOW_FLAG);
}

/** Journals carrying allocations or cheque data stay on the legacy path. */
export function isManualJournalPostingEngineEligible(
  payload: ManualJournalCommandPayloadV1 | null | undefined,
): boolean {
  if (!payload) return false;
  const allocations = (payload as any).allocations;
  if (Array.isArray(allocations) && allocations.length > 0) return false;
  if ((payload as any).cheque_id || Array.isArray((payload as any).cheques)) return false;
  const pairs = payload.lines ?? clientPairPreview(payload.entries);
  return Array.isArray(pairs) && pairs.length > 0;
}

/**
 * Advisory client-side pairing preview only. The SERVER pairing
 * (`pair_journal_lines_v1`) is authoritative for anything that posts.
 */
export function clientPairPreview(
  entries: ManualJournalEntryLineV1[] | null | undefined,
): ManualJournalPairV1[] | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return pairJournalLines(entries as PairableLine[]) as ManualJournalPairV1[] | null;
}

export function buildManualJournalCommandEnvelopeV1(
  input: SubmitManualJournalCommandInput,
): CommandEnvelopeV1<ManualJournalCommandPayloadV1> {
  const payload = input.payload;
  if (!payload?.entry_date) throw new Error("entry_date is required");
  const hasLines = Array.isArray(payload.lines) && payload.lines.length > 0;
  const hasEntries = Array.isArray(payload.entries) && payload.entries.length > 0;
  if (!hasLines && !hasEntries) throw new Error("journal lines are required");
  return buildCommandEnvelopeV1<ManualJournalCommandPayloadV1>({
    commandType: MANUAL_JOURNAL_COMMAND_V1_TYPE,
    idempotencyKey: input.idempotencyKey,
    payload,
    source: input.source ?? "web",
    deviceId: input.deviceId ?? null,
    companyId: input.companyId ?? null,
    branchId: input.branchId ?? null,
    correlationId: input.correlationId ?? null,
    effectiveDate: payload.entry_date,
  });
}

/** Executes the command. One PostgreSQL transaction, server-resolved context. */
export async function submitManualJournalCommandV1(
  input: SubmitManualJournalCommandInput,
): Promise<ManualJournalCommandResultV1> {
  const envelope = buildManualJournalCommandEnvelopeV1(input);
  const { data, error } = await supabase.rpc("create_manual_journal_command_v1" as any, {
    p_envelope: envelope as any,
  } as any);
  if (error) throw error;
  return data as unknown as ManualJournalCommandResultV1;
}

/** Adapts a V1 command result to the legacy journal RPC result shape. */
export function toLegacyJournalResult(r: ManualJournalCommandResultV1) {
  return {
    success: r?.status === "succeeded",
    duplicate: r?.replayed === true,
    transaction_id: r?.transaction_id ?? null,
    reference: r?.reference ?? null,
    lines: r?.lines ?? 0,
    error: r?.error,
  };
}
