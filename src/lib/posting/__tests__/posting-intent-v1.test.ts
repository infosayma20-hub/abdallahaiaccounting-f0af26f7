import { describe, expect, it } from "vitest";
import {
  compareLegacyWithIntent,
  isBalancedIntent,
  isPostingEngineEligible,
  isPostingReceiptV1Enabled,
  isPostingReceiptV1ShadowEnabled,
  POSTING_RECEIPT_V1_FLAG,
  type PostingIntentV1,
} from "../posting-intent-v1";

const intent = (over: Partial<PostingIntentV1> = {}): PostingIntentV1 => ({
  posting_intent_version: 1,
  posting_version: 1,
  source_type: "finance.receipt.command",
  effect_type: "receipt.gl",
  owner_id: "00000000-0000-0000-0000-000000000001",
  effective_date: "2026-09-11",
  currency: "شيكل",
  amount: 111,
  base_amount: 111,
  debit_role: "CASH",
  credit_role: "ACCOUNTS_RECEIVABLE_SUBLEDGER",
  debit_account_code: "11103",
  credit_account_code: "11300020",
  contact_id: "c1",
  payment_method: "نقدي",
  balanced: true,
  ...over,
});

const legacy = (over: Record<string, unknown> = {}) => ({
  debit_account_code: "11103",
  credit_account_code: "11300020",
  amount: 111,
  currency: "شيكل",
  exchange_rate: null,
  foreign_amount: null,
  transaction_date: "2026-09-11",
  contact_id: "c1",
  ...over,
}) as any;

describe("posting.receipt_v1 feature flag", () => {
  it("is OFF by default", () => {
    expect(isPostingReceiptV1Enabled(undefined)).toBe(false);
    expect(isPostingReceiptV1Enabled({})).toBe(false);
    expect(isPostingReceiptV1Enabled({ feature_flags: {} })).toBe(false);
    expect(isPostingReceiptV1Enabled({ feature_flags: null })).toBe(false);
  });

  it("is ON only for an explicit true value", () => {
    expect(isPostingReceiptV1Enabled({ feature_flags: { [POSTING_RECEIPT_V1_FLAG]: true } })).toBe(true);
    expect(isPostingReceiptV1Enabled({ feature_flags: { [POSTING_RECEIPT_V1_FLAG]: "true" } })).toBe(true);
    expect(isPostingReceiptV1Enabled({ feature_flags: { [POSTING_RECEIPT_V1_FLAG]: "1" } })).toBe(false);
  });

  it("keeps the shadow flag independent", () => {
    const s = { feature_flags: { [POSTING_RECEIPT_V1_FLAG]: true } };
    expect(isPostingReceiptV1ShadowEnabled(s)).toBe(false);
  });
});

describe("posting engine eligibility", () => {
  it("accepts a plain receipt", () => {
    expect(isPostingEngineEligible({ amount: 100 })).toBe(true);
    expect(isPostingEngineEligible({ amount: 100, allocations: [] })).toBe(true);
  });

  it("keeps allocation receipts on the legacy path", () => {
    expect(isPostingEngineEligible({ amount: 100, allocations: [{ invoice_id: "x" } as any] })).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    expect(isPostingEngineEligible({ amount: 0 })).toBe(false);
    expect(isPostingEngineEligible({ amount: -5 })).toBe(false);
    expect(isPostingEngineEligible({ amount: null })).toBe(false);
  });
});

describe("debit = credit invariant", () => {
  it("holds for a balanced intent", () => {
    expect(isBalancedIntent(intent())).toBe(true);
  });

  it("fails when the base amount drifts", () => {
    expect(isBalancedIntent(intent({ base_amount: 110 }))).toBe(false);
    expect(isBalancedIntent(intent({ amount: 0, base_amount: 0 }))).toBe(false);
  });
});

describe("legacy vs V1 parity", () => {
  it("matches a cash receipt", () => {
    expect(compareLegacyWithIntent(legacy(), intent()).match).toBe(true);
  });

  it("matches a bank receipt", () => {
    const i = intent({ debit_role: "BANK", debit_account_code: "1121", amount: 222, base_amount: 222 });
    expect(compareLegacyWithIntent(legacy({ debit_account_code: "1121", amount: 222 }), i).match).toBe(true);
  });

  it("matches a foreign currency receipt", () => {
    const i = intent({
      currency: "دولار",
      amount: 444,
      base_amount: 444,
      exchange_rate: 3.7,
      foreign_amount: 120,
      debit_account_code: "1111",
    });
    const l = legacy({ currency: "دولار", amount: 444, exchange_rate: 3.7, foreign_amount: 120, debit_account_code: "1111" });
    expect(compareLegacyWithIntent(l, i).match).toBe(true);
  });

  it("treats null and zero exchange rate as equal", () => {
    expect(compareLegacyWithIntent(legacy({ exchange_rate: 0 }), intent()).match).toBe(true);
  });

  it("reports every differing field", () => {
    const r = compareLegacyWithIntent(
      legacy({ debit_account_code: "1110", amount: 999, transaction_date: "2026-01-01" }),
      intent(),
    );
    expect(r.match).toBe(false);
    expect(r.differences).toEqual(
      expect.arrayContaining(["debit_account_code", "amount", "effective_date"]),
    );
  });

  it("flags a credit account drift", () => {
    const r = compareLegacyWithIntent(legacy({ credit_account_code: "1130" }), intent());
    expect(r.match).toBe(false);
    expect(r.differences).toContain("credit_account_code");
  });
});
