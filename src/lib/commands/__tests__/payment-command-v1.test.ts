import { describe, it, expect } from "vitest";
import {
  PAYMENT_COMMAND_V1_TYPE,
  buildPaymentCommandEnvelopeV1,
  hasAllocationsV1,
  isChequePaymentPayloadV1,
  isPaymentCommandV1Enabled,
  isPaymentPostingEngineEligible,
  toLegacyVoucherResult,
} from "../payment-command-v1";

const base = { amount: 100, payment_method: "نقدي", cash_account_code: "11103" };

describe("payment command v1 flag", () => {
  it("defaults to OFF", () => {
    expect(isPaymentCommandV1Enabled(undefined)).toBe(false);
    expect(isPaymentCommandV1Enabled({})).toBe(false);
    expect(isPaymentCommandV1Enabled({ feature_flags: {} })).toBe(false);
    expect(isPaymentCommandV1Enabled({ feature_flags: { "commands.payment_v1": "true" } })).toBe(false);
  });
  it("is ON only for an explicit boolean true", () => {
    expect(isPaymentCommandV1Enabled({ feature_flags: { "commands.payment_v1": true } })).toBe(true);
  });
});

describe("cheque exclusion", () => {
  it("excludes cheque payment methods", () => {
    expect(isChequePaymentPayloadV1({ ...base, payment_method: "شيك" })).toBe(true);
    expect(isChequePaymentPayloadV1({ ...base, payment_method: "Cheque" })).toBe(true);
  });
  it("excludes cheque-bearing fields", () => {
    expect(isChequePaymentPayloadV1({ ...base, cheque_id: "x" } as any)).toBe(true);
    expect(isChequePaymentPayloadV1({ ...base, cheque_number: "112233" } as any)).toBe(true);
  });
  it("excludes cheque accounts", () => {
    expect(isChequePaymentPayloadV1({ ...base, cash_account_code: "2120" })).toBe(true);
    expect(isChequePaymentPayloadV1({ ...base, contact_account_code: "1150" })).toBe(true);
  });
  it("allows plain cash/bank payments", () => {
    expect(isChequePaymentPayloadV1(base)).toBe(false);
    expect(isChequePaymentPayloadV1({ ...base, payment_method: "بنك", cash_account_code: "1121" })).toBe(false);
  });
});

describe("posting engine eligibility", () => {
  it("rejects cheque and allocation payments", () => {
    expect(isPaymentPostingEngineEligible({ ...base, payment_method: "شيك" })).toBe(false);
    expect(isPaymentPostingEngineEligible({ ...base, allocations: [{ invoice_id: "i", amount: 5 } as any] })).toBe(false);
    expect(hasAllocationsV1({ ...base, allocations: [] })).toBe(false);
  });
  it("rejects non-positive amounts", () => {
    expect(isPaymentPostingEngineEligible({ ...base, amount: 0 })).toBe(false);
    expect(isPaymentPostingEngineEligible({ ...base, amount: -5 })).toBe(false);
  });
  it("accepts plain cash/bank/supplier/expense payments", () => {
    expect(isPaymentPostingEngineEligible(base)).toBe(true);
    expect(isPaymentPostingEngineEligible({ ...base, contact_account_code: "5150" })).toBe(true);
  });
});

describe("envelope", () => {
  it("builds a versioned envelope and rejects invalid amounts", () => {
    const env = buildPaymentCommandEnvelopeV1({ idempotencyKey: "k1", payload: base });
    expect(env.command_type).toBe(PAYMENT_COMMAND_V1_TYPE);
    expect(env.idempotency_key).toBe("k1");
    expect(() => buildPaymentCommandEnvelopeV1({ idempotencyKey: "k2", payload: { ...base, amount: 0 } })).toThrow();
  });
});

describe("legacy result adapter", () => {
  it("maps status and replay to the legacy shape", () => {
    expect(toLegacyVoucherResult({ status: "succeeded", replayed: true, transaction_id: "t1" } as any)).toEqual({
      success: true,
      duplicate: true,
      transaction_id: "t1",
      allocations: undefined,
      error: undefined,
    });
    expect(toLegacyVoucherResult({ status: "failed", error: "boom" } as any).success).toBe(false);
  });
});
