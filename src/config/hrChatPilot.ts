/**
 * HR ↔ Employee chat rollout flag.
 * The limited pilot is over: the "المراسلة" tab is now open to every employee
 * that has an employee record. Kept as a single switch so the feature can be
 * narrowed again (or disabled) from one place if ever needed.
 */
export const HR_CHAT_ENABLED_FOR_ALL = true;

/** Legacy pilot list — only consulted when the global rollout is turned off. */
export const HR_CHAT_PILOT_EMPLOYEE_IDS: string[] = [
  "a66a6c39-230d-4f12-a2fe-ed80252ba5bf", // عبد الله صايمة
];

export function isHRChatPilotEmployee(employeeId?: string | null): boolean {
  if (!employeeId) return false;
  if (HR_CHAT_ENABLED_FOR_ALL) return true;
  return HR_CHAT_PILOT_EMPLOYEE_IDS.includes(employeeId);
}
