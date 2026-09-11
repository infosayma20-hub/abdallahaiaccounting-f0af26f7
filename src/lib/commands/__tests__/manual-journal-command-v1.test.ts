import { describe, expect, it } from "vitest";
import {
  MANUAL_JOURNAL_COMMAND_V1_TYPE,
  buildManualJournalCommandEnvelopeV1,
  clientPairPreview,
  isManualJournalCommandV1Enabled,
  isManualJournalPostingEngineEligible,
  isManualJournalPostingV1Enabled,
  isManualJournalPostingV1ShadowEnabled,
  toLegacyJournalResult,
} from "../manual-journal-command-v1";

const entries = [
  { account_code: "5150", debit: 300, credit: 0 },
  { account_code: "5111", debit: 200, credit: 0 },
  { account_code: "11103", debit: 0, credit: 500 },
];

describe("manual journal command v1 — feature flags", () => {
  it("defaults to OFF when settings are missing or malformed", () => {
    for (const s of [null, undefined, {}, { feature_flags: null }, { feature_flags: "x" }]) {
      expect(isManualJournalCommandV1Enabled(s)).toBe(false);
      expect(isManualJournalPostingV1Enabled(s)).toBe(false);
      expect(isManualJournalPostingV1ShadowEnabled(s)).toBe(false);
    }
  });

  it("is enabled only on an explicit true", () => {
    expect(
      isManualJournalCommandV1Enabled({ feature_flags: { "commands.manual_journal_v1": true } }),
    ).toBe(true);
    expect(
      isManualJournalCommandV1Enabled({ feature_flags: { "commands.manual_journal_v1": false } }),
    ).toBe(false);
    expect(
      isManualJournalPostingV1Enabled({ feature_flags: { "posting.manual_journal_v1": "true" } }),
    ).toBe(true);
  });
});

describe("manual journal command v1 — eligibility", () => {
  it("accepts a balanced multi-line journal", () => {
    expect(isManualJournalPostingEngineEligible({ entry_date: "2026-09-11", entries })).toBe(true);
  });

  it("rejects unbalanced journals", () => {
    expect(
      isManualJournalPostingEngineEligible({
        entry_date: "2026-09-11",
        entries: [
          { account_code: "5150", debit: 300, credit: 0 },
          { account_code: "11103", debit: 0, credit: 200 },
        ],
      }),
    ).toBe(false);
  });

  it("keeps allocation and cheque journals on the legacy path", () => {
    expect(
      isManualJournalPostingEngineEligible({
        entry_date: "2026-09-11",
        entries,
        allocations: [{ invoice_id: "x", amount: 1 }],
      } as any),
    ).toBe(false);
    expect(
      isManualJournalPostingEngineEligible({
        entry_date: "2026-09-11",
        entries,
        cheque_id: "c1",
      } as any),
    ).toBe(false);
  });
});

describe("manual journal command v1 — pairing preview", () => {
  it("pairs debits against credits greedily", () => {
    const pairs = clientPairPreview(entries)!;
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({
      debit_account_code: "5150",
      credit_account_code: "11103",
      amount: 300,
    });
    expect(pairs[1]).toMatchObject({
      debit_account_code: "5111",
      credit_account_code: "11103",
      amount: 200,
    });
  });

  it("returns null for an unbalanced set", () => {
    expect(
      clientPairPreview([
        { account_code: "5150", debit: 100, credit: 0 },
        { account_code: "11103", debit: 0, credit: 50 },
      ]),
    ).toBeNull();
  });
});

describe("manual journal command v1 — envelope", () => {
  it("builds a versioned envelope with the journal date as effective date", () => {
    const env = buildManualJournalCommandEnvelopeV1({
      idempotencyKey: "MJ-1",
      payload: { entry_date: "2026-09-11", entries },
    });
    expect(env.command_type).toBe(MANUAL_JOURNAL_COMMAND_V1_TYPE);
    expect(env.schema_version).toBe(1);
    expect(env.idempotency_key).toBe("MJ-1");
    expect(env.effective_date).toBe("2026-09-11");
    expect(env.correlation_id).toBeTruthy();
    // the browser never defines actor/owner/tenant
    expect((env as any).actor_id).toBeUndefined();
    expect((env as any).owner_id).toBeUndefined();
  });

  it("refuses an envelope without lines or a date", () => {
    expect(() =>
      buildManualJournalCommandEnvelopeV1({ idempotencyKey: "MJ-2", payload: { entry_date: "" } }),
    ).toThrow();
    expect(() =>
      buildManualJournalCommandEnvelopeV1({
        idempotencyKey: "MJ-3",
        payload: { entry_date: "2026-09-11" },
      }),
    ).toThrow();
  });
});

describe("manual journal command v1 — legacy result adapter", () => {
  it("maps success and replay", () => {
    expect(
      toLegacyJournalResult({
        version: 1,
        status: "succeeded",
        command_id: "c",
        replayed: true,
        transaction_id: "t",
        reference: "JV-1",
        lines: 2,
      }),
    ).toEqual({
      success: true,
      duplicate: true,
      transaction_id: "t",
      reference: "JV-1",
      lines: 2,
      error: undefined,
    });
  });

  it("maps failure", () => {
    const r = toLegacyJournalResult({
      version: 1,
      status: "failed",
      command_id: "c",
      error: "unbalanced",
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe("unbalanced");
  });
});
