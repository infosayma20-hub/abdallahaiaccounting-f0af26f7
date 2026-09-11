/**
 * Domain Events V1 — Stage 2 (Transactional Outbox).
 *
 * Events are COMMITTED FACTS emitted by a business command inside the same
 * PostgreSQL transaction as the business write. Nothing in the app depends on
 * an event to finish a receipt; events are for downstream reactions only.
 *
 * Stage 2 has NO external delivery: no webhooks, banks, payments, email,
 * WhatsApp, AI or third-party APIs.
 */
import { supabase } from "@/integrations/supabase/client";

export const RECEIPT_CREATED_EVENT_V1 = "finance.receipt.created.v1";
export const RECEIPT_EVENT_V1_FLAG = "events.receipt_v1";

export type DomainEventStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "dead_letter"
  | "suppressed";

export interface DomainEventV1 {
  event_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string | null;
  owner_id: string;
  actor_id: string | null;
  company_id: string | null;
  branch_id: string | null;
  command_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  dedupe_key: string;
  occurred_at: string;
  effective_at: string | null;
  payload: Record<string, unknown>;
  status: DomainEventStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  processed_at: string | null;
  dead_lettered_at: string | null;
}

/** Tenant feature flag. Default OFF on any error / missing flag / settings. */
export function isReceiptEventV1Enabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags[RECEIPT_EVENT_V1_FLAG] === true;
  } catch {
    return false;
  }
}

/** Stable dedupe key: one logical event per logical command. */
export function receiptEventDedupeKey(idempotencyKey: string): string {
  if (!idempotencyKey) throw new Error("idempotencyKey is required");
  return `finance.create_receipt.v1:${idempotencyKey}`;
}

export function amountBucket(amount: number): string {
  if (!Number.isFinite(amount)) return "unknown";
  if (amount < 100) return "lt_100";
  if (amount < 1000) return "lt_1k";
  if (amount < 10000) return "lt_10k";
  if (amount < 100000) return "lt_100k";
  return "gte_100k";
}

/**
 * Fields that must never leave the transactional boundary inside an event
 * payload. Mirrors the server-side payload builder in the migration.
 */
export const DISALLOWED_EVENT_PAYLOAD_KEYS = [
  "amount",
  "exchange_rate",
  "contact_id",
  "contact_name",
  "employee_id",
  "description",
  "notes",
  "reference",
  "cash_account_code",
  "contact_account_code",
  "allocations",
  "phone",
  "email",
  "iban",
  "account_number",
] as const;

export interface ReceiptCreatedPayloadV1 {
  schema_version: 1;
  transaction_id: string | null;
  currency: string;
  amount_bucket: string;
  has_contact: boolean;
  has_allocations: boolean;
  source: string;
}

/** Client-side mirror of the server payload builder — used by contract tests. */
export function buildReceiptCreatedPayloadV1(input: {
  transactionId: string | null;
  currency?: string | null;
  amount: number;
  contactId?: string | null;
  allocations?: unknown;
  source?: string | null;
}): ReceiptCreatedPayloadV1 {
  return {
    schema_version: 1,
    transaction_id: input.transactionId ?? null,
    currency: input.currency || "شيكل",
    amount_bucket: amountBucket(input.amount),
    has_contact: !!input.contactId,
    has_allocations: Array.isArray(input.allocations),
    source: input.source || "web",
  };
}

/** True when a payload leaks any disallowed sensitive field (deep check). */
export function payloadHasDisallowedData(payload: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    for (const key of Object.keys(node as Record<string, unknown>)) {
      if ((DISALLOWED_EVENT_PAYLOAD_KEYS as readonly string[]).includes(key)) return true;
      if (walk((node as Record<string, unknown>)[key])) return true;
    }
    return false;
  };
  return walk(payload);
}

/** Read-only observability. RLS keeps the result inside the caller's tenant. */
export async function fetchOutboxHealthV1() {
  const { data, error } = await supabase
    .from("domain_events_outbox_health_v1" as any)
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchEventsForCommandV1(commandId: string) {
  const { data, error } = await supabase
    .from("domain_events_outbox" as any)
    .select("*")
    .eq("command_id", commandId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DomainEventV1[];
}
