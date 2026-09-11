/**
 * Command Envelope V1 — minimal, versioned command contract.
 *
 * This is the reusable foundation for future Unify business commands.
 * It intentionally stays tiny: an envelope shape, a builder, and a
 * client-side sanity check. All authorization, tenant/company/branch
 * resolution and business validation happen SERVER-SIDE.
 *
 * The browser MUST NOT define actor_id / owner_id / tenant_id. Those are
 * resolved by `resolve_command_context_v1` inside PostgreSQL.
 */

export type CommandSource =
  | "web"
  | "mobile"
  | "pos"
  | "offline"
  | "api"
  | "automation"
  | "device";

export interface CommandEnvelopeV1<TPayload> {
  command_id: string;
  command_type: string;
  schema_version: 1;
  source: CommandSource;
  device_id?: string | null;
  /** Client-supplied *hints* only — the server re-validates ownership. */
  company_id?: string | null;
  branch_id?: string | null;
  idempotency_key: string;
  correlation_id: string;
  causation_id?: string | null;
  occurred_at: string;
  effective_date?: string | null;
  payload: TPayload;
}

export function newUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // RFC4122-shaped fallback for very old browsers / test environments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BuildEnvelopeInput<TPayload> {
  commandType: string;
  idempotencyKey: string;
  payload: TPayload;
  source?: CommandSource;
  deviceId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  effectiveDate?: string | null;
}

export function buildCommandEnvelopeV1<TPayload>(
  input: BuildEnvelopeInput<TPayload>,
): CommandEnvelopeV1<TPayload> {
  if (!input.commandType) throw new Error("commandType is required");
  if (!input.idempotencyKey) throw new Error("idempotencyKey is required");
  return {
    command_id: newUuid(),
    command_type: input.commandType,
    schema_version: 1,
    source: input.source ?? "web",
    device_id: input.deviceId ?? null,
    company_id: input.companyId ?? null,
    branch_id: input.branchId ?? null,
    idempotency_key: input.idempotencyKey,
    correlation_id: input.correlationId ?? newUuid(),
    causation_id: input.causationId ?? null,
    occurred_at: new Date().toISOString(),
    effective_date: input.effectiveDate ?? null,
    payload: input.payload,
  };
}

/** Stable, versioned command result. */
export interface CommandResultV1 {
  version: 1;
  status: "succeeded" | "failed";
  command_id: string;
  correlation_id?: string | null;
  replayed?: boolean;
  error?: string;
  [key: string]: unknown;
}
