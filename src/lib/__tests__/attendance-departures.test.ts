import { describe, it, expect } from "vitest";
import {
  gapCountsAsDeparture,
  deriveGapsFromPunches,
  deriveGapsFromSessions,
  END_OF_DAY_RETURN_GRACE_MIN,
  MAX_DERIVED_GAP_MIN,
} from "../attendance-departures";

const t = (h: number, m: number) =>
  new Date(Date.UTC(2026, 7, 19, h, m, 0)).toISOString();

describe("gapCountsAsDeparture", () => {
  it("مغادرة مؤقتة ضمن الحد = تُحتسب", () => {
    expect(gapCountsAsDeparture(25, "temporary", MAX_DERIVED_GAP_MIN)).toBe(true);
  });
  it("إنهاء دوام ثم عودة متأخرة = لا تُحتسب", () => {
    expect(gapCountsAsDeparture(120, "end_of_day", MAX_DERIVED_GAP_MIN)).toBe(false);
  });
  it("إنهاء دوام مع عودة سريعة = تُحتسب (مضاد تحايل)", () => {
    expect(
      gapCountsAsDeparture(END_OF_DAY_RETURN_GRACE_MIN - 1, "end_of_day", MAX_DERIVED_GAP_MIN),
    ).toBe(true);
  });
  it("بصمات قديمة (NULL) تحافظ على السلوك السابق", () => {
    expect(gapCountsAsDeparture(45, null, MAX_DERIVED_GAP_MIN)).toBe(true);
    expect(gapCountsAsDeparture(1, null, MAX_DERIVED_GAP_MIN)).toBe(false);
  });
});

describe("deriveGapsFromPunches", () => {
  it("يحتسب المغادرة المؤقتة فقط ويتجاهل نهاية الدوام", () => {
    const gaps = deriveGapsFromPunches([
      { event_type: "check_in", event_time: t(6, 0), status: "valid" },
      { event_type: "check_out", event_time: t(9, 0), status: "valid", checkout_kind: "temporary" },
      { event_type: "check_in", event_time: t(9, 20), status: "valid" },
      { event_type: "check_out", event_time: t(12, 0), status: "valid", checkout_kind: "end_of_day" },
      { event_type: "check_in", event_time: t(16, 0), status: "valid" },
      { event_type: "check_out", event_time: t(20, 0), status: "valid", checkout_kind: "end_of_day" },
    ]);
    expect(gaps.map((g) => g.minutes)).toEqual([20]);
  });
});

describe("deriveGapsFromSessions", () => {
  it("يحترم نية الخروج المخزّنة على الجلسة", () => {
    const gaps = deriveGapsFromSessions([
      { checkIn: t(6, 0), checkOut: t(9, 0), checkoutKind: "end_of_day" },
      { checkIn: t(13, 0), checkOut: t(17, 0), checkoutKind: "temporary" },
      { checkIn: t(17, 10), checkOut: null },
    ]);
    expect(gaps.map((g) => g.minutes)).toEqual([10]);
  });
});
