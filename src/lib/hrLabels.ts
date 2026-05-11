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
  attendance_edit_request: "طلب تعديل بصمة",
  leave_request: "طلب إجازة",
  loan_request: "طلب قرض",
  advance_request: "طلب سلفة",
  resignation: "طلب استقالة",
  document_request: "طلب مستند",
  complaint: "شكوى",
  complaints: "شكاوى وملاحظات",
  hr_message: "رسالة لـ HR",
  overtime_request: "طلب أوفرتايم",
  employee_info: "معلومات الموظف",
  birthday_whatsapp: "معلومات الموظف",
  disciplinary_action: "إجراء عقابي",
  facility_quality: "جودة المرافق",
  equipment_fault: "أعطال المعدات",
  inventory_balance: "رصيد الأصناف",
  general: "طلب عام",
};

/** Sub-types used by Attendance Center correction_requests */
const REQUEST_TYPE: Record<string, string> = {
  missing_checkin: "دخول مفقود",
  missing_checkout: "خروج مفقود",
  wrong_time: "وقت خاطئ",
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
  overtime_request: "ساعات إضافية",
  hr_message: "رسالة HR",
  penalty: "إجراء عقابي",
  correction_request: "طلب تصحيح بصمة",
  attendance_correction: "طلب تصحيح بصمة",
};

export function tRequestType(s?: string | null): string {
  if (!s) return "—";
  return REQUEST_TYPE[String(s).toLowerCase()] || tFormType(s);
}

const FORM_STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
  closed: "مغلق",
  read: "تم الاطلاع",
  responded: "تم الرد",
};

const CONTRACT_TYPE: Record<string, string> = {
  permanent: "دائم",
  temporary: "مؤقت",
  seasonal: "موسمي",
  contract: "عقد",
  freelance: "بالقطعة",
  part_time: "دوام جزئي",
  full_time: "دوام كامل",
  internship: "تدريب",
  probation: "تحت التجربة",
};

const MARITAL_STATUS: Record<string, string> = {
  single: "أعزب",
  married: "متزوج",
  divorced: "مطلق",
  widowed: "أرمل",
  engaged: "مخطوب",
};

const GENDER: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
  m: "ذكر",
  f: "أنثى",
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

export function tContractType(s?: string | null): string {
  if (!s) return "—";
  return CONTRACT_TYPE[s.toLowerCase()] || s;
}

export function tMaritalStatus(s?: string | null): string {
  if (!s) return "—";
  return MARITAL_STATUS[s.toLowerCase()] || s;
}

export function tGender(s?: string | null): string {
  if (!s) return "—";
  return GENDER[s.toLowerCase()] || s;
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

const PAYROLL_STATUS: Record<string, string> = {
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  pending: "قيد المراجعة",
  draft: "مسودة",
  approved: "معتمد",
  cancelled: "ملغي",
};

export function tPayrollStatus(s?: string | null | boolean): string {
  if (s === true) return "مدفوع";
  if (s === false) return "غير مدفوع";
  if (!s) return "—";
  return PAYROLL_STATUS[String(s).toLowerCase()] || String(s);
}

export function payrollStatusTone(s?: string | null | boolean): string {
  const k = s === true ? "paid" : s === false ? "unpaid" : String(s || "").toLowerCase();
  if (["paid", "مدفوع", "approved", "معتمد"].includes(k))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (["unpaid", "غير مدفوع", "pending", "قيد المراجعة", "draft", "مسودة"].includes(k))
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (["cancelled", "ملغي"].includes(k))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "";
}

const LEAVE_TYPE: Record<string, string> = {
  annual: "سنوية",
  regular: "عادية",
  sick: "مرضية",
  personal: "شخصية",
  unpaid: "بدون راتب",
  maternity: "أمومة",
  emergency: "طارئة",
  bereavement: "وفاة",
  hajj: "حج",
  marriage: "زواج",
  study: "دراسية",
  other: "أخرى",
};

export function tLeaveType(s?: string | null): string {
  if (!s) return "—";
  return LEAVE_TYPE[String(s).toLowerCase()] || s;
}

const DEDUCTION_TYPE: Record<string, string> = {
  late: "تأخير",
  absence: "غياب",
  manual: "خصم يدوي",
  pos: "خصم نقطة بيع",
  loan: "قسط قرض",
  advance: "سلفة",
  penalty: "إجراء عقابي",
  insurance: "تأمين",
  tax: "ضريبة",
  other: "أخرى",
};

export function tDeductionType(s?: string | null): string {
  if (!s) return "—";
  return DEDUCTION_TYPE[String(s).toLowerCase()] || s;
}

const DEDUCTION_SOURCE: Record<string, string> = {
  pos: "نقطة بيع",
  manual: "يدوي",
  payroll: "راتب",
  attendance: "حضور",
  loan: "قرض",
  system: "النظام",
};

export function tDeductionSource(s?: string | null): string {
  if (!s) return "يدوي";
  return DEDUCTION_SOURCE[String(s).toLowerCase()] || s;
}

const LOAN_STATUS: Record<string, string> = {
  active: "نشط",
  paid: "مسدد",
  closed: "مغلق",
  cancelled: "ملغي",
  pending: "قيد المراجعة",
};

export function tLoanStatus(s?: string | null): string {
  if (!s) return "—";
  return LOAN_STATUS[String(s).toLowerCase()] || s;
}
