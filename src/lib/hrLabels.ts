/**
 * Translates technical HR/attendance keys into professional Arabic labels.
 * Used everywhere user-facing text needs to be Arabic instead of raw DB values.
 */

const ATTENDANCE_STATUS: Record<string, string> = {
  present: "حاضر",
  complete: "حاضر",
  مكتمل: "حاضر",
  late: "متأخر",
  absent: "غائب",
  incomplete: "ناقص",
  on_leave: "إجازة",
  leave: "إجازة",
  holiday: "عطلة",
  weekend: "عطلة أسبوعية",
  off: "عطلة",
};

const EVENT_TYPE: Record<string, string> = {
  check_in: "تسجيل دخول",
  check_out: "تسجيل خروج",
  break_start: "بداية استراحة",
  break_end: "نهاية استراحة",
  manual: "إدخال يدوي",
};

const FORM_TYPE: Record<string, string> = {
  correction_request: "طلب تصحيح بصمة",
  attendance_correction: "طلب تصحيح بصمة",
  leave_request: "طلب إجازة",
  loan_request: "طلب قرض",
  advance_request: "طلب سلفة",
  resignation: "طلب استقالة",
  document_request: "طلب مستند",
  complaint: "شكوى",
  general: "طلب عام",
};

const FORM_STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
  closed: "مغلق",
  read: "تم الاطلاع",
  responded: "تم الرد",
};

export function tAttendanceStatus(s?: string | null): string {
  if (!s) return "—";
  return ATTENDANCE_STATUS[s] || s;
}

export function tEventType(s?: string | null): string {
  if (!s) return "—";
  return EVENT_TYPE[s] || s;
}

export function tFormType(s?: string | null): string {
  if (!s) return "—";
  return FORM_TYPE[s] || s;
}

export function tFormStatus(s?: string | null): string {
  if (!s) return "—";
  return FORM_STATUS[s] || s;
}

/** Removes a leading "نموذج: <key>" pattern and replaces with Arabic form type. */
export function tTimelineTitle(title: string): string {
  if (!title) return "—";
  const m = title.match(/^نموذج:\s*(.+)$/);
  if (m) return tFormType(m[1].trim());
  const m2 = title.match(/^حضور:\s*(.+)$/);
  if (m2) return `حضور: ${tAttendanceStatus(m2[1].trim())}`;
  return title;
}

/** Returns tone classes for a normalized attendance status. */
export function attendanceStatusTone(s?: string | null): string {
  const k = (s || "").toLowerCase();
  if (["present", "complete", "حاضر", "مكتمل"].includes(k))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (["late", "متأخر"].includes(k))
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (["absent", "غائب"].includes(k))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
  if (["on_leave", "leave", "إجازة"].includes(k))
    return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
  if (["holiday", "weekend", "off", "عطلة", "عطلة أسبوعية"].includes(k))
    return "bg-muted text-muted-foreground border-border";
  if (["incomplete", "ناقص"].includes(k))
    return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
  return "";
}

export function formStatusTone(s?: string | null): string {
  const k = (s || "").toLowerCase();
  if (["approved", "معتمد", "closed", "مغلق"].includes(k))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (["pending", "قيد المراجعة"].includes(k))
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (["rejected", "مرفوض", "cancelled", "ملغي"].includes(k))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
  if (["read", "تم الاطلاع", "responded", "تم الرد"].includes(k))
    return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
  return "";
}
