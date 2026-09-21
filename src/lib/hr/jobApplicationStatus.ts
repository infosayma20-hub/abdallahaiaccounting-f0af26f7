export type JobApplicationStatusGroup = "active" | "interview" | "decision" | "closed";

export type JobApplicationStatusDefinition = {
  key: string;
  label: string;
  group: JobApplicationStatusGroup;
  badgeClass: string;
};

/**
 * المصدر الموحّد لمراحل طلب التوظيف.
 * أبقينا مفاتيح shortlisted و rejected القديمة حتى تظهر السجلات التاريخية
 * بالمسميات الجديدة من دون أي ترحيل أو تعديل على بياناتها.
 */
export const JOB_APPLICATION_STATUSES: readonly JobApplicationStatusDefinition[] = [
  { key: "new", label: "جديد", group: "active", badgeClass: "border-border bg-muted text-foreground" },
  { key: "shortlisted", label: "قيد الفرز", group: "active", badgeClass: "border-primary/25 bg-primary/10 text-primary" },
  { key: "qualified_for_interview", label: "مؤهل للمقابلة", group: "interview", badgeClass: "border-success/30 bg-success/10 text-success" },
  { key: "interview_scheduled", label: "تم تحديد مقابلة", group: "interview", badgeClass: "border-primary/30 bg-primary/10 text-primary" },
  { key: "interview_completed_pending_evaluation", label: "تمت المقابلة – بانتظار التقييم", group: "interview", badgeClass: "border-warning/30 bg-warning/10 text-warning" },
  { key: "reserve_candidate", label: "مرشح احتياطي", group: "decision", badgeClass: "border-warning/30 bg-warning/10 text-warning" },
  { key: "job_offer", label: "عرض وظيفي", group: "decision", badgeClass: "border-primary/30 bg-primary/10 text-primary" },
  { key: "hired", label: "تم التوظيف", group: "decision", badgeClass: "border-success/30 bg-success/10 text-success" },
  { key: "rejected", label: "مرفوض في الفرز", group: "closed", badgeClass: "border-destructive/30 bg-destructive/10 text-destructive" },
  { key: "rejected_after_interview", label: "مرفوض بعد المقابلة", group: "closed", badgeClass: "border-destructive/30 bg-destructive/10 text-destructive" },
  { key: "candidate_withdrew", label: "اعتذر المرشح", group: "closed", badgeClass: "border-border bg-muted text-muted-foreground" },
  { key: "follow_up_later", label: "مؤجل للمتابعة لاحقًا", group: "closed", badgeClass: "border-warning/30 bg-warning/10 text-warning" },
  { key: "closed_archived", label: "مغلق / مؤرشف", group: "closed", badgeClass: "border-border bg-muted text-muted-foreground" },
] as const;

const STATUS_BY_KEY = new Map(JOB_APPLICATION_STATUSES.map((status) => [status.key, status]));

const UNKNOWN_STATUS: JobApplicationStatusDefinition = {
  key: "unknown",
  label: "مرحلة غير معروفة",
  group: "active",
  badgeClass: "border-border bg-muted text-muted-foreground",
};

export function getJobApplicationStatus(status: string | null | undefined): JobApplicationStatusDefinition {
  return STATUS_BY_KEY.get(status || "new") || UNKNOWN_STATUS;
}

export function jobApplicationStatusToUnified(status: string | null | undefined): "pending" | "approved" | "rejected" {
  if (status === "hired") return "approved";
  if (["rejected", "rejected_after_interview", "candidate_withdrew", "closed_archived"].includes(status || "")) {
    return "rejected";
  }
  return "pending";
}