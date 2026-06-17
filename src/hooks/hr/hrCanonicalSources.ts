/**
 * HR Canonical Sources — Single Source of Truth
 * ============================================
 * هذا الملف يثبّت المصادر الرسمية لبيانات الموارد البشرية في النظام.
 * أي قراءة جديدة من جداول HR يجب أن تستخدم الجداول المذكورة أدناه فقط.
 *
 *  ✅ Leaves           → employee_leaves
 *      statuses (canonical English, CHECK-enforced):
 *        "pending" | "approved" | "rejected" | "cancelled"
 *      UI translation via src/lib/hr/leaveStatus.ts → formatLeaveStatus()
 *  ✅ Attendance       → attendance_days + attendance_events
 *  ✅ Requests/Forms   → employee_forms      (إجازة/سلفة/مغادرة/خدمات)
 *  ✅ Corrections      → correction_requests
 *  ✅ Payroll          → employee_payroll + monthly_payroll_inputs + payroll_settings
 *  ✅ Advances         → employee_advances + employee_advance_installments
 *  ✅ Loans            → employee_loans + loan_installments
 *  ✅ Movements        → employee_financial_movements
 *
 * ⛔ Deprecated tables (DO NOT READ / DO NOT WRITE):
 *  - leave_requests   → أُرشف باسم `_archive_leave_requests_dropped_2026_06_17`
 *                       (rename بدل drop كشبكة أمان). كل القراءة/الكتابة الآن
 *                       على employee_leaves حصراً.
 *
 * ملاحظة الإنتاج: لم نحذف الجدول المُهمل من قاعدة البيانات حفاظاً على الـ history
 * في حال احتاجت الأرشفة لاحقاً. كل ما عملناه هو إيقاف القراءة والكتابة منه في الواجهة.
 */

/** Helper لتحذير المطورين عند أي محاولة استخدام جدول مُهمل عن طريق الخطأ. */
export function warnDeprecatedTable(tableName: "leave_requests"): void {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[HR] "${tableName}" is deprecated — read/write canonical source instead. ` +
        `See src/hooks/hr/hrCanonicalSources.ts`,
    );
  }
}

/**
 * Leave status canonical = English (CHECK-enforced at DB).
 * Arabic legacy values kept here ONLY for backwards-compat in read-side filters
 * (in case any historical row leaked Arabic before the migration). New writes
 * MUST use English values; see src/lib/hr/leaveStatus.ts.
 */
export const LEAVE_STATUS_PENDING = ["pending", "معلقة"] as const;
export const LEAVE_STATUS_APPROVED = ["approved", "موافقة", "معتمدة", "موافق عليها"] as const;
export const LEAVE_STATUS_REJECTED = ["rejected", "مرفوضة"] as const;

export type LeaveStatusGroup = "pending" | "approved" | "rejected";

export function classifyLeaveStatus(status: string | null | undefined): LeaveStatusGroup | null {
  if (!status) return null;
  if ((LEAVE_STATUS_PENDING as readonly string[]).includes(status)) return "pending";
  if ((LEAVE_STATUS_APPROVED as readonly string[]).includes(status)) return "approved";
  if ((LEAVE_STATUS_REJECTED as readonly string[]).includes(status)) return "rejected";
  return null;
}