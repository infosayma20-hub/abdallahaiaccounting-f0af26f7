import { describe, it, expect } from "vitest";
import { isLeaveIntakeOpen } from "@/lib/hr/leaveIntake";
describe("leave intake per branch", () => {
  it("closed branch overrides open company", () => expect(isLeaveIntakeOpen(true, { b1: false }, "b1")).toBe(false));
  it("open branch overrides closed company", () => expect(isLeaveIntakeOpen(false, { b1: true }, "b1")).toBe(true));
  it("branch without override follows company", () => expect(isLeaveIntakeOpen(false, { b1: true }, "b2")).toBe(false));
});
