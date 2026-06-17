/**
 * Leave status canonical helper.
 * Backend (employee_leaves.status) stores English only: pending | approved | rejected | cancelled.
 * UI translates for display via formatLeaveStatus.
 */
export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];

export function formatLeaveStatus(status: string | null | undefined): string {
  switch (status) {
    case "pending": return "معلقة";
    case "approved": return "مقبولة";
    case "rejected": return "مرفوضة";
    case "cancelled": return "ملغاة";
    default: return status ?? "—";
  }
}

export function leaveStatusBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved": return "default";
    case "pending": return "secondary";
    case "rejected": return "destructive";
    case "cancelled": return "outline";
    default: return "outline";
  }
}