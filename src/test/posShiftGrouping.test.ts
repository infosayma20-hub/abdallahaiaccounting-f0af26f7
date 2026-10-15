import { describe, it, expect } from "vitest";
import { groupRowsByShift, type PosShiftInfo } from "@/lib/pos-shift-grouping";

const info = { session_id: "S1", business_date: "2026-10-15", opened_at: "", closed_at: null, state: "closed", cashier_name: "x", device_name: null, cash_box_id: null, cash_box_name: null, session_seq: 1, order_count: 1, total_debit: 0, total_credit: 0, total_vat: 0, expected_cash: null, closing_cash: null, cash_variance: null, currency: "ILS" } as PosShiftInfo;
const row = (o: any) => ({ date: "2026-10-15", description: "", currency: "شيكل", balance: 0, debit: 0, credit: 0, ...o });

describe("shift grouping includes cash-out documents", () => {
  it("folds expenses and purchases of the shift into its summary", () => {
    const rows = [
      row({ transaction_id: "t1", transaction_type: "pos_sale", reference: "POS-1", debit: 100, balance: 100 }),
      row({ transaction_id: "t2", transaction_type: "purchase_cash", reference: "PUR-POS-abcd1234", credit: 30, balance: 70 }),
      row({ transaction_id: "t3", transaction_type: "expense", reference: "POS-EXP-1", credit: 20, balance: 50 }),
    ];
    const out = groupRowsByShift(rows as any, {
      shifts: new Map([["S1", info]]), orderToSession: new Map([["POS-1", "S1"]]),
      txToSession: new Map([["t3", "S1"]]), refToSession: new Map([["PUR-POS-abcd1234", "S1"]]),
      expandedSessions: new Set(), enabled: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0].debit).toBe(100);
    expect(out[0].credit).toBe(50);
    expect(out[0].balance).toBe(50);
  });
});
