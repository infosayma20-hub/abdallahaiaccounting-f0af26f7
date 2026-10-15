import { describe, it, expect } from "vitest";
import { computeAttendanceSalary, tallyLeaves } from "@/lib/hr/attendanceSalary";

describe("راتب البصمة", () => {
  it("المبلغ = (العادية + الإضافي×1.5 + السنوية×8) × معدل الساعة", () => {
    const c = computeAttendanceSalary({ hours: 64.17, overtime: 1.63, annualDays: 0, sickDays: 0, priorSickDays: 0, hourlyRate: 9.6 });
    expect(c.amount).toBeCloseTo((64.17 - 1.63 + 1.63 * 1.5) * 9.6, 6);
  });
  it("الإجازة السنوية تُحتسب 8 ساعات لليوم", () => {
    const c = computeAttendanceSalary({ hours: 0, overtime: 0, annualDays: 2, sickDays: 0, priorSickDays: 0, hourlyRate: 10 });
    expect(c.amount).toBe(160);
  });
  it("المرضية بعد 14 يوم بالسنة بنصف أجر", () => {
    const c = computeAttendanceSalary({ hours: 0, overtime: 0, annualDays: 0, sickDays: 2, priorSickDays: 14, hourlyRate: 10 });
    expect(c.amount).toBe(80);
  });
  it("أيام الإجازة تُعدّ داخل الفترة فقط", () => {
    const t = tallyLeaves([{ employee_id: "e", leave_type: "سنوية", start_date: "2026-09-29", end_date: "2026-10-03", days_count: 5 }], "2026-10-01", "2026-10-31");
    expect(t.e.annual).toBe(3);
  });
});
