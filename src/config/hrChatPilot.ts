/**
 * HR ↔ Employee chat is in limited pilot.
 * Only the employee IDs listed here see the "المراسلة" tab in the employee app.
 * Remove this gate (and its usages) once the pilot is approved for everyone.
 */
export const HR_CHAT_PILOT_EMPLOYEE_IDS: string[] = [
  "a66a6c39-230d-4f12-a2fe-ed80252ba5bf", // عبد الله صايمة
];

export function isHRChatPilotEmployee(employeeId?: string | null): boolean {
  if (!employeeId) return false;
  return HR_CHAT_PILOT_EMPLOYEE_IDS.includes(employeeId);
}