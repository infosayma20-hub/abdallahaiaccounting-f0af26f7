import { describe, it, expect } from "vitest";
import { computeExpectedCashPerCurrency, computeVariance } from "../shift-close-math";
import { getPosBusinessDate } from "../business-day";

describe("getPosBusinessDate (cutoff = 6 AM)", () => {
  it("ILS sale at 22:30 belongs to same day", () => {
    expect(getPosBusinessDate("2026-06-03T22:30:00", 6)).toBe("2026-06-03");
  });
  it("sale at 02:00 belongs to previous day", () => {
    const local = new Date(2026, 5, 4, 2, 0, 0); // 4 June 02:00 local
    expect(getPosBusinessDate(local, 6)).toBe("2026-06-03");
  });
  it("sale at 05:59 still belongs to previous day", () => {
    const local = new Date(2026, 5, 4, 5, 59, 0);
    expect(getPosBusinessDate(local, 6)).toBe("2026-06-03");
  });
  it("sale at 06:00 belongs to new day", () => {
    const local = new Date(2026, 5, 4, 6, 0, 0);
    expect(getPosBusinessDate(local, 6)).toBe("2026-06-04");
  });
});

describe("computeExpectedCashPerCurrency — multi-currency reconciliation", () => {
  const baseInput = {
    openingILS: 500,
    payments: [],
    returns: [],
    cashExpensesILS: 0,
    cashPurchasesILS: 0,
  };

  it("(1) ILS cash sale increases ILS only", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      payments: [
        {
          payment_method: "cash",
          amount: 100,
          currency: "ILS",
          tendered: 100,
          change_amount: 0,
          change_currency: "ILS",
          exchange_rate: 1,
        },
      ],
    });
    expect(r.expected.ILS).toBe(600);
    expect(r.expected.USD).toBe(0);
    expect(r.expected.JOD).toBe(0);
  });

  it("(3) JOD sale with ILS change: JOD +10, ILS -17 (real-world example)", () => {
    // Invoice 23.86 ILS; customer pays 10 JOD (~40.86 ILS @ rate 4.086); change 17 ILS
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      openingILS: 0,
      payments: [
        {
          payment_method: "cash",
          amount: 23.86,        // invoice total in ILS
          currency: "JOD",
          tendered: 40.86,      // 10 JOD × 4.086 — stored in ILS
          exchange_rate: 4.086,
          change_amount: 17,    // 17 ILS handed back
          change_currency: "ILS",
        },
      ],
    });
    expect(r.expected.JOD).toBeCloseTo(10, 5);
    expect(r.expected.ILS).toBeCloseTo(-17, 5);
    expect(r.expected.USD).toBe(0);
  });

  it("(4) USD sale with USD change", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      openingILS: 0,
      payments: [
        {
          payment_method: "cash",
          amount: 36, currency: "USD",
          tendered: 72,           // 20 USD × 3.6
          exchange_rate: 3.6,
          change_amount: 10,      // 10 USD back
          change_currency: "USD",
        },
      ],
    });
    expect(r.expected.USD).toBeCloseTo(10, 5); // 20 tendered - 10 change
    expect(r.expected.ILS).toBe(0);
  });

  it("(5) Card payment does not touch any cash drawer", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      payments: [
        {
          payment_method: "card",
          amount: 500, currency: "ILS",
          tendered: 500, exchange_rate: 1,
          change_amount: 0, change_currency: "ILS",
        },
      ],
    });
    expect(r.expected.ILS).toBe(500); // == opening
    expect(r.expected.USD).toBe(0);
    expect(r.expected.JOD).toBe(0);
  });

  it("(6) Cash refund in ILS reduces ILS drawer", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      returns: [{ currency: "ILS", cashAmount: 30 }],
    });
    expect(r.expected.ILS).toBe(470);
  });

  it("(7) Cash refund in JOD reduces JOD drawer only", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      returns: [{ currency: "JOD", cashAmount: 5 }],
    });
    expect(r.expected.ILS).toBe(500);
    expect(r.expected.JOD).toBe(-5);
  });

  it("(8) Cash expense reduces ILS drawer", () => {
    const r = computeExpectedCashPerCurrency({
      ...baseInput,
      cashExpensesILS: 80,
    });
    expect(r.expected.ILS).toBe(420);
  });
});

describe("computeVariance", () => {
  it("calculates per-currency variance and ILS-equivalent total", () => {
    const v = computeVariance(
      { ILS: 100, USD: 10, JOD: 5 },
      { ILS: 105, USD: 9, JOD: 5 },
      { USD: 3.6, JOD: 5 },
    );
    expect(v.perCurrency.ILS.variance).toBe(5);
    expect(v.perCurrency.USD.variance).toBe(-1);
    expect(v.perCurrency.JOD.variance).toBe(0);
    // 5 + (-1×3.6) + 0 = 1.4
    expect(v.totalVarianceILS).toBeCloseTo(1.4, 5);
  });
});