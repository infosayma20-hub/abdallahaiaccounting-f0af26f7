import { describe, it, expect } from "vitest";
import {
  RECEIPT_CREATED_EVENT_V1,
  RECEIPT_EVENT_V1_FLAG,
  isReceiptEventV1Enabled,
  receiptEventDedupeKey,
  amountBucket,
  buildReceiptCreatedPayloadV1,
  payloadHasDisallowedData,
} from "../domain-event-v1";

describe("domain event contract v1", () => {
  it("uses one versioned event name", () => {
    expect(RECEIPT_CREATED_EVENT_V1).toBe("finance.receipt.created.v1");
  });

  it("flag is OFF by default and only true for an explicit true", () => {
    expect(isReceiptEventV1Enabled(undefined)).toBe(false);
    expect(isReceiptEventV1Enabled({})).toBe(false);
    expect(isReceiptEventV1Enabled({ feature_flags: {} })).toBe(false);
    expect(isReceiptEventV1Enabled({ feature_flags: { [RECEIPT_EVENT_V1_FLAG]: "true" } })).toBe(false);
    expect(isReceiptEventV1Enabled({ feature_flags: { [RECEIPT_EVENT_V1_FLAG]: true } })).toBe(true);
  });

  it("dedupe key is stable for the same logical command (replay safety)", () => {
    expect(receiptEventDedupeKey("idem-1")).toBe(receiptEventDedupeKey("idem-1"));
    expect(receiptEventDedupeKey("idem-1")).not.toBe(receiptEventDedupeKey("idem-2"));
    expect(() => receiptEventDedupeKey("")).toThrow();
  });

  it("buckets amounts instead of publishing values", () => {
    expect(amountBucket(50)).toBe("lt_100");
    expect(amountBucket(999)).toBe("lt_1k");
    expect(amountBucket(9999)).toBe("lt_10k");
    expect(amountBucket(99999)).toBe("lt_100k");
    expect(amountBucket(250000)).toBe("gte_100k");
  });

  it("payload carries only safe metadata", () => {
    const payload = buildReceiptCreatedPayloadV1({
      transactionId: "11111111-1111-4111-8111-111111111111",
      currency: "شيكل",
      amount: 4300.5,
      contactId: "22222222-2222-4222-8222-222222222222",
      allocations: [{ invoice_id: "x", amount: 10 }],
      source: "web",
    });
    expect(payload).toEqual({
      schema_version: 1,
      transaction_id: "11111111-1111-4111-8111-111111111111",
      currency: "شيكل",
      amount_bucket: "lt_10k",
      has_contact: true,
      has_allocations: true,
      source: "web",
    });
    expect(payloadHasDisallowedData(payload)).toBe(false);
  });

  it("detects disallowed sensitive data anywhere in a payload", () => {
    expect(payloadHasDisallowedData({ amount: 100 })).toBe(true);
    expect(payloadHasDisallowedData({ meta: { contact_name: "x" } })).toBe(true);
    expect(payloadHasDisallowedData({ list: [{ iban: "IL..." }] })).toBe(true);
    expect(payloadHasDisallowedData({ ok: true })).toBe(false);
  });

  it("event identity is derived from context, never from the browser", () => {
    const payload = buildReceiptCreatedPayloadV1({ transactionId: null, amount: 10 });
    expect(Object.keys(payload)).not.toContain("owner_id");
    expect(Object.keys(payload)).not.toContain("actor_id");
    expect(Object.keys(payload)).not.toContain("company_id");
  });
});
