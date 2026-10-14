/** Leave intake for one employee: a branch override wins, else the company-wide switch. */
export function isLeaveIntakeOpen(
  globalOpen: boolean | null | undefined,
  overrides: Record<string, boolean> | null | undefined,
  branchId: string | null | undefined,
): boolean {
  const o = branchId && overrides ? overrides[branchId] : undefined;
  if (typeof o === "boolean") return o;
  return globalOpen !== false;
}
