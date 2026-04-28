// HR Messages & Disciplinary Actions encoder/decoder
// Stored inside correction_requests.reason as a structured text + JSON META block.
// This avoids a DB migration while keeping a clean parsing contract.

export type HRMessageType =
  | "info"            // رسالة إدارية
  | "inquiry"         // طلب توضيح
  | "warning"         // إنذار
  | "penalty"         // إجراء عقابي
  | "approval"        // موافقة/رفض
  | "document_request"; // طلب مستند

export type PenaltyKind =
  | "verbal_warning"     // إنذار شفهي
  | "written_warning"    // إنذار خطي
  | "salary_deduction"   // خصم من الراتب
  | "day_deduction"      // خصم يوم
  | "suspension"         // إيقاف مؤقت
  | "other";             // أخرى

export interface HRMessageMeta {
  type: HRMessageType;
  subject: string;
  body: string;
  requires_response?: boolean;
  due_date?: string | null;
  related_attendance_date?: string | null;
  // Penalty-specific:
  penalty_kind?: PenaltyKind;
  violation_date?: string | null;
  effective_date?: string | null;
  affects_payroll_flag?: boolean;
  attachment_url?: string | null;
  // Audit:
  edited_by?: string | null;
  edited_at?: string | null;
  edit_history?: { at: string; by: string; from: Partial<HRMessageMeta> }[];
  // Employee response:
  employee_acknowledged_at?: string | null;
  employee_response?: string | null;
  employee_response_at?: string | null;
}

const TAG_OPEN = "<<HRMSG:";
const TAG_CLOSE = ":HRMSG>>";

/** Encode meta into a string suitable for correction_requests.reason */
export function encodeHRMessage(meta: HRMessageMeta): string {
  const human =
    `[${typeLabel(meta.type)}] ${meta.subject}\n` +
    `${meta.body}` +
    (meta.penalty_kind ? `\nنوع الإجراء: ${penaltyLabel(meta.penalty_kind)}` : "") +
    (meta.violation_date ? `\nتاريخ المخالفة: ${meta.violation_date}` : "") +
    (meta.effective_date ? `\nتاريخ التنفيذ: ${meta.effective_date}` : "") +
    (meta.related_attendance_date ? `\nمرتبط بحضور: ${meta.related_attendance_date}` : "") +
    (meta.requires_response ? `\nمطلوب رد${meta.due_date ? ` قبل: ${meta.due_date}` : ""}` : "");
  return `${human}\n\n${TAG_OPEN}${JSON.stringify(meta)}${TAG_CLOSE}`;
}

/** Decode meta from reason. Returns null if not a structured HR message. */
export function decodeHRMessage(reason: string | null | undefined): HRMessageMeta | null {
  if (!reason) return null;
  const start = reason.indexOf(TAG_OPEN);
  const end = reason.indexOf(TAG_CLOSE);
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const json = reason.slice(start + TAG_OPEN.length, end);
    return JSON.parse(json) as HRMessageMeta;
  } catch {
    return null;
  }
}

/** Update meta and re-encode preserving formatting */
export function updateHRMessage(reason: string, patch: Partial<HRMessageMeta>): string {
  const meta = decodeHRMessage(reason) || ({} as HRMessageMeta);
  return encodeHRMessage({ ...meta, ...patch });
}

export function typeLabel(t: HRMessageType): string {
  switch (t) {
    case "info": return "رسالة إدارية";
    case "inquiry": return "طلب توضيح";
    case "warning": return "إنذار";
    case "penalty": return "إجراء عقابي";
    case "approval": return "موافقة/رفض";
    case "document_request": return "طلب مستند";
  }
}

export function typeColor(t: HRMessageType): string {
  switch (t) {
    case "penalty": return "bg-red-600 text-white";
    case "warning": return "bg-amber-500 text-white";
    case "inquiry": return "bg-blue-500 text-white";
    case "info": return "bg-slate-500 text-white";
    case "approval": return "bg-emerald-600 text-white";
    case "document_request": return "bg-purple-500 text-white";
  }
}

export function penaltyLabel(k: PenaltyKind): string {
  switch (k) {
    case "verbal_warning": return "إنذار شفهي";
    case "written_warning": return "إنذار خطي";
    case "salary_deduction": return "خصم من الراتب";
    case "day_deduction": return "خصم يوم";
    case "suspension": return "إيقاف مؤقت";
    case "other": return "أخرى";
  }
}

/** Map our internal type to correction_requests.request_type */
export function toRequestType(t: HRMessageType): string {
  if (t === "penalty" || t === "warning") return "penalty";
  return "hr_message";
}

/** Status helpers (lifecycle: pending → read → responded → closed) */
export const STATUS_LABELS: Record<string, string> = {
  pending: "جديد",
  read: "مقروء",
  responded: "تم الرد",
  closed: "مغلق",
  approved: "معتمد",
  rejected: "مرفوض",
};

/**
 * Strip the internal HRMSG JSON tag from a reason string for display.
 * If the reason has structured meta, returns a clean human-readable summary.
 * Otherwise returns the original string.
 */
export function displayReason(reason: string | null | undefined): string {
  if (!reason) return "";
  const meta = decodeHRMessage(reason);
  if (meta) {
    return [
      `[${typeLabel(meta.type)}] ${meta.subject}`,
      meta.body,
      meta.penalty_kind ? `نوع الإجراء: ${penaltyLabel(meta.penalty_kind)}` : "",
    ].filter(Boolean).join("\n");
  }
  // Defensive: hide any stray HRMSG tags
  const start = reason.indexOf(TAG_OPEN);
  if (start >= 0) return reason.slice(0, start).trim();
  return reason;
}