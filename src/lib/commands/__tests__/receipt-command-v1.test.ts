import { describe, it, expect } from "vitest";
import {
  buildCommandEnvelopeV1,
  newUuid,
} from "../command-envelope-v1";
import {
  RECEIPT_COMMAND_V1_FLAG,
  RECEIPT_COMMAND_V1_TYPE,
  buildReceiptCommandEnvelopeV1,
  isReceiptCommandV1Enabled,
  toLegacyVoucherResult,
} from "../receipt-command-v1";

describe("Receipt Command V1 — feature flag", () => {
  it("is OFF by default / on missing settings", () => {
    expect(isReceiptCommandV1Enabled(undefined)).toBe(false);
    expect(isReceiptCommandV1Enabled(null)).toBe(false);
    expect(isReceiptCommandV1Enabled({})).toBe(false);
    expect(isReceiptCommandV1Enabled({ feature_flags: {} })).toBe(false);
  });

  it("is not activated by the legacy vouchers_use_rpc flag", () => {
    expect(isReceiptCommandV1Enabled({ feature_flags: { vouchers_use_rpc: true } })).toBe(false);
  });

  it("requires the literal boolean true", () => {
    expect(isReceiptCommandV1Enabled({ feature_flags: { [RECEIPT_COMMAND_V1_FLAG]: "true" } })).toBe(false);
    expect(isReceiptCommandV1Enabled({ feature_flags: { [RECEIPT_COMMAND_V1_FLAG]: 1 } })).toBe(false);
    expect(isReceiptCommandV1Enabled({ feature_flags: { [RECEIPT_COMMAND_V1_FLAG]: true } })).toBe(true);
  });
});

describe("Receipt Command V1 — envelope contract", () => {
  const base = {
    idempotencyKey: "RCV-test-1",
    payload: { contact_id: newUuid(), amount: 100, voucher_date: "2026-09-01" },
  };

  it("builds a versioned envelope with the pilot command type", () => {
    const env = buildReceiptCommandEnvelopeV1(base);
    expect(env.command_type).toBe(RECEIPT_COMMAND_V1_TYPE);
    expect(env.schema_version).toBe(1);
    expect(env.source).toBe("web");
    expect(env.idempotency_key).toBe("RCV-test-1");
    expect(env.effective_date).toBe("2026-09-01");
    expect(env.command_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(env.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("never carries a client-supplied actor/owner/tenant identity", () => {
    const env = buildReceiptCommandEnvelopeV1(base) as Record<string, unknown>;
    expect(env.actor_id).toBeUndefined();
    expect(env.owner_id).toBeUndefined();
    expect(env.user_id).toBeUndefined();
    expect(env.tenant_id).toBeUndefined();
  });

  it("keeps the same idempotency key across rebuilds (replay safety)", () => {
    const a = buildReceiptCommandEnvelopeV1(base);
    const b = buildReceiptCommandEnvelopeV1(base);
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.command_id).not.toBe(b.command_id);
  });

  it("rejects invalid amounts before any network call", () => {
    expect(() => buildReceiptCommandEnvelopeV1({ ...base, payload: { amount: 0 } })).toThrow();
    expect(() => buildReceiptCommandEnvelopeV1({ ...base, payload: { amount: -5 } })).toThrow();
    expect(() => buildReceiptCommandEnvelopeV1({ ...base, payload: { amount: NaN } })).toThrow();
  });

  it("requires an idempotency key", () => {
    expect(() =>
      buildCommandEnvelopeV1({ commandType: RECEIPT_COMMAND_V1_TYPE, idempotencyKey: "", payload: {} }),
    ).toThrow();
  });
});

describe("Receipt Command V1 — legacy result parity", () => {
  it("maps a successful command to the legacy shape", () => {
    const legacy = toLegacyVoucherResult({
      version: 1,
      status: "succeeded",
      command_id: "c1",
      replayed: false,
      transaction_id: "tx-1",
    } as any);
    expect(legacy).toMatchObject({ success: true, duplicate: false, transaction_id: "tx-1" });
  });

  it("maps a replayed command to duplicate=true (no double posting)", () => {
    const legacy = toLegacyVoucherResult({
      version: 1,
      status: "succeeded",
      command_id: "c1",
      replayed: true,
      transaction_id: "tx-1",
    } as any);
    expect(legacy.success).toBe(true);
    expect(legacy.duplicate).toBe(true);
    expect(legacy.transaction_id).toBe("tx-1");
  });

  it("maps a failed command so the UI throws exactly like today", () => {
    const legacy = toLegacyVoucherResult({
      version: 1,
      status: "failed",
      command_id: "c1",
      error: "boom",
    } as any);
    expect(legacy.success).toBe(false);
    expect(legacy.error).toBe("boom");
    expect(legacy.transaction_id).toBeNull();
  });
});
