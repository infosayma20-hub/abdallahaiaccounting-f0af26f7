/**
 * Helpers to derive Arabic labels and smart summaries for employee requests.
 * Works against `employee_forms` rows AND optionally `correction_requests` rows.
 * Safe-by-default: missing fields never throw.
 */
import { tFormType, tFormStatus, tLeaveType, tEventType, tRequestType } from "./hrLabels";
import { serviceYearsLabel } from "./employeeFinancialDisplay";

export type AnyRequest = {
  id?: string;
  form_type?: string | null;
  request_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  rejection_reason?: string | null;
  attachment_url?: string | null;
  attachments?: any;
  form_data?: Record<string, any> | null;
  // common correction_requests fields
  date?: string | null;
  correction_time?: string | null;
  reason?: string | null;
  [k: string]: any;
};

export function getRequestKind(r: AnyRequest): string {
  return String(r.form_type || r.request_type || "general");
}

export function getRequestTitle(r: AnyRequest): string {
  const k = getRequestKind(r);
  return tFormType(k);
}

export function getStatusBadge(status?: string | null) {
  const s = String(status || "pending").toLowerCase();
  switch (s) {
    case "approved":
      return { text: "تمت الموافقة", emoji: "✅", variant: "default" as const };
    case "rejected":
      return { text: "مرفوض", emoji: "❌", variant: "destructive" as const };
    case "cancelled":
      return { text: "ملغي", emoji: "🚫", variant: "outline" as const };
    case "pending":
      return { text: "قيد المراجعة", emoji: "🟡", variant: "outline" as const };
    default:
      return { text: tFormStatus(s) || s, emoji: "⏳", variant: "outline" as const };
  }
}

/**
 * نماذج «رأي/بلاغ» لا يُعتمد فيها شيء — الموافقة تعني: تم الاطلاع والمعالجة.
 */
const OPINION_KINDS = new Set([
  "complaints",
  "employee_voice",
  "hr_message",
  "facility_quality",
  "equipment_fault",
]);

/** تسمية الحالة حسب نوع النموذج (شكوى/اقتراح ≠ اعتماد). */
export function getStatusLabelFor(r: AnyRequest): string {
  const s = String(r.status || "pending").toLowerCase();
  if (OPINION_KINDS.has(getRequestKind(r))) {
    if (s === "approved") return "تم الاطلاع والمعالجة";
    if (s === "pending") return "قيد المراجعة";
    if (s === "rejected") return "لم يُؤخذ بها";
    if (s === "cancelled") return "ملغاة";
  }
  return tFormStatus(s) || s;
}

/** شارة الحالة حسب نوع النموذج. */
export function getStatusBadgeFor(r: AnyRequest) {
  const base = getStatusBadge(r.status);
  return { ...base, text: getStatusLabelFor(r) };
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ar-EG-u-ca-gregory", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch {
    return String(d);
  }
}

function fmtTime(t?: string | null): string {
  if (!t) return "—";
  // accept "HH:MM" or full ISO
  const s = String(t);
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  try {
    return new Date(s).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

/** Smart short summary line for a request card. */
export function getRequestSummary(r: AnyRequest): string {
  const kind = getRequestKind(r);
  const f: Record<string, any> = r.form_data || {};
  switch (kind) {
    case "leave_request": {
      const t = tLeaveType(f.leave_type);
      const from = fmtDate(f.from_date || f.start_date);
      const to = fmtDate(f.to_date || f.end_date);
      const days = f.days_count ?? f.days;
      return `${t} • ${from} ← ${to}${days ? ` • ${days} يوم` : ""}`;
    }
    case "correction_request":
    case "attendance_correction":
    case "attendance_edit_request": {
      const date = fmtDate(f.date || r.date);
      const evt = tEventType(f.event_type || f.correction_type);
      const time = fmtTime(f.correction_time || r.correction_time);
      return `${date} • ${evt} • ${time}`;
    }
    case "overtime_request": {
      const date = fmtDate(f.date);
      const from = fmtTime(f.from_time);
      const to = fmtTime(f.to_time);
      const hrs = f.hours_count ?? f.hours;
      return `${date} • ${from} → ${to}${hrs ? ` • ${hrs} ساعة` : ""}`;
    }
    case "loan_request": {
      const amt = f.amount ?? f.loan_amount;
      const inst = f.installments ?? f.installments_count;
      const elig = f.eligibility_status ? ` • ${f.eligibility_status === "eligible" ? "مؤهل" : "غير مؤهل"}` : "";
      return `${amt ? `₪${amt}` : "—"}${inst ? ` • ${inst} قسط` : ""}${elig}`;
    }
    case "advance_request": {
      const amt = f.amount;
      const reason = (f.reason || "").toString().slice(0, 40);
      return `${amt ? `₪${amt}` : "—"}${reason ? ` • ${reason}` : ""}`;
    }
    case "employee_info":
    case "birthday_whatsapp": {
      const name = f.full_name || f.name;
      const wa = f.whatsapp || f.phone;
      return [name, wa, f.id_number].filter(Boolean).join(" • ") || "تحديث بيانات";
    }
    case "hr_message": {
      const subj = f.subject || f.title;
      const body = (f.message || f.body || "").toString().slice(0, 60);
      return [subj, body].filter(Boolean).join(" • ") || "رسالة";
    }
    case "complaints":
    case "complaint": {
      const t = f.complaint_type || f.type;
      const body = (f.message || f.description || "").toString().slice(0, 60);
      return [t, body].filter(Boolean).join(" • ") || "شكوى";
    }
    case "employee_voice": {
      const t = f.voice_type || f.type;
      const body = (f.content || f.message || "").toString().slice(0, 60);
      return [t, body].filter(Boolean).join(" • ") || "صوت الموظف";
    }
    case "disciplinary_action": {
      const name = f.employee_name;
      const t = f.action_type || f.type;
      const desc = (f.description || "").toString().slice(0, 40);
      return [name, t, desc].filter(Boolean).join(" • ");
    }
    default: {
      const reason = (f.reason || r.reason || "").toString().slice(0, 80);
      return reason || tRequestType(kind);
    }
  }
}

/** Group fields into Arabic-labelled sections for the details dialog. */
export type DetailField = { label: string; value: any; isUrl?: boolean };
export type DetailGroup = { title: string; fields: DetailField[] };

const FIELD_LABELS: Record<string, string> = {
  leave_type: "نوع الإجازة",
  from_date: "من تاريخ",
  to_date: "إلى تاريخ",
  start_date: "من تاريخ",
  end_date: "إلى تاريخ",
  days_count: "عدد الأيام",
  days: "عدد الأيام",
  date: "التاريخ",
  correction_time: "وقت البصمة",
  event_type: "نوع البصمة",
  correction_type: "نوع البصمة",
  from_time: "من ساعة",
  to_time: "إلى ساعة",
  hours_count: "عدد الساعات",
  hours: "عدد الساعات",
  amount: "المبلغ",
  loan_amount: "قيمة القرض",
  installments: "عدد الدفعات",
  installments_count: "عدد الدفعات",
  eligibility_status: "حالة الأهلية",
  eligibility_reason: "سبب الأهلية",
  reason: "السبب",
  notes: "ملاحظات",
  description: "الوصف",
  subject: "الموضوع",
  title: "العنوان",
  message: "الرسالة",
  body: "النص",
  complaint_type: "نوع الشكوى",
  content: "المحتوى",
  type: "النوع",
  action_type: "نوع الإجراء",
  employee_name: "اسم الموظف",
  full_name: "الاسم",
  name: "الاسم",
  whatsapp: "واتساب",
  phone: "الهاتف",
  id_number: "رقم الهوية",
  birth_date: "تاريخ الميلاد",
  marital_status: "الحالة الاجتماعية",
  education: "المؤهل",
  branch: "الفرع",
  branch_id: "الفرع",
  branch_name: "الفرع",
  department: "القسم",
  department_id: "القسم",
  department_name: "القسم",
  shift: "الشفت",
  shift_id: "الشفت",
  shift_name: "الشفت",
  photo_url: "الصورة",
  attachment_url: "المرفق",
  attachment: "المرفق",
  file_url: "المرفق",
  attachment_path: "المرفق",
  medical_report_url: "التقرير الطبي",
  medical_report_path: "التقرير الطبي",
  spouse_name: "اسم الزوج/الزوجة",
  children_count: "عدد الأطفال",
  work_start_date: "تاريخ بدء العمل",
  date_of_birth: "تاريخ الميلاد",
  salary: "الراتب",
  calculated_loan_limit: "سقف القرض المحسوب",
  max_installments: "أقصى مدة سداد (شهر)",
  months_of_service: "سنوات الخدمة",
  years_of_service: "سنوات الخدمة",
  malaky_start_date: "تاريخ البداية في الملكي",
  whatsapp_prefix: "مقدمة الواتساب",
  whatsapp_local: "رقم الواتساب (محلي)",
  annual_leave_remaining_claimed: "رصيد الإجازات السنوية المتبقي (حسب الموظف)",
  sick_days_taken_claimed: "الإجازات المرضية المأخوذة (حسب الموظف)",
};

const ROUTING_KEYS = new Set(["branch", "branch_id", "branch_name", "department", "department_id", "department_name", "shift", "shift_id", "shift_name"]);
const ATTACH_KEYS = new Set(["attachment_url", "attachment", "attachment_path", "file_url", "file_path", "photo_url", "photo_path", "medical_report_url", "medical_report_path"]);

function tFieldValue(key: string, val: any): any {
  if (val == null || val === "") return val;
  if (typeof val === "string") val = sanitizeHumanText(val);
  if (val === "") return val;
  if (key === "leave_type") return tLeaveType(String(val));
  if (key === "event_type" || key === "correction_type") return tEventType(String(val));
  if (key === "from_date" || key === "to_date" || key === "start_date" || key === "end_date" || key === "date" || key === "birth_date" || key === "date_of_birth" || key === "malaky_start_date" || key === "work_start_date") return fmtDate(String(val));
  if (key === "from_time" || key === "to_time" || key === "correction_time") return fmtTime(String(val));
  if (key === "eligibility_status") return val === "eligible" ? "مؤهل" : val === "not_eligible" ? "غير مؤهل" : String(val);
  // مدة الخدمة تُعرض دائماً بالسنوات (المخزّن قد يكون بالأشهر لطلبات قديمة)
  if (key === "months_of_service") return serviceYearsLabel(Number(val));
  if (key === "years_of_service") {
    const y = Number(val);
    return isFinite(y) ? serviceYearsLabel(Math.round(y * 12)) : String(val);
  }
  return val;
}

function isUrl(v: any): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

/**
 * Remove internal machine tags / raw JSON blobs from any text shown to users,
 * and turn escaped "\n" sequences into real line breaks.
 */
export function sanitizeHumanText(input: string): string {
  if (!input) return "";
  let s = String(input);
  // Internal HR message envelopes (both historical formats)
  s = s.replace(/<<HRMSG:[\s\S]*?(?::HRMSG>>|$)/g, " ");
  s = s.replace(/\[HRMSG\][\s\S]*?(?:\[\/HRMSG\]|$)/g, " ");
  // Any leftover raw JSON object blob (e.g. truncated metadata)
  s = s.replace(/\{[^{}]*"[a-z_]+"\s*:[\s\S]*?(\}|$)/gi, " ");
  // Escaped newlines/tabs stored as literal characters
  s = s.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, " ");
  // Tidy whitespace
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function getDetailGroups(r: AnyRequest): DetailGroup[] {
  const f: Record<string, any> = r.form_data || {};
  const formFields: DetailField[] = [];
  const routingFields: DetailField[] = [];
  const attachmentFields: DetailField[] = [];

  // Pull common correction_requests top-level fields into form_data view
  const merged: Record<string, any> = { ...f };
  if (r.date && merged.date == null) merged.date = r.date;
  if (r.correction_time && merged.correction_time == null) merged.correction_time = r.correction_time;
  if (r.reason && merged.reason == null) merged.reason = r.reason;
  if (r.attachment_url && merged.attachment_url == null) merged.attachment_url = r.attachment_url;

  for (const [key, raw] of Object.entries(merged)) {
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    const label = FIELD_LABELS[key] || key;
    const value = tFieldValue(key, raw);
    const url = isUrl(raw);
    const target = ATTACH_KEYS.has(key) || url ? attachmentFields
      : ROUTING_KEYS.has(key) ? routingFields
      : formFields;
    target.push({ label, value, isUrl: url || ATTACH_KEYS.has(key) });
  }

  const groups: DetailGroup[] = [];

  groups.push({
    title: "معلومات الطلب",
    fields: [
      { label: "نوع الطلب", value: getRequestTitle(r) },
      { label: "الحالة", value: tFormStatus(r.status || "pending") },
      { label: "تاريخ التقديم", value: fmtDate(r.created_at) },
    ],
  });

  if (formFields.length) groups.push({ title: "تفاصيل النموذج", fields: formFields });
  if (routingFields.length) groups.push({ title: "الفرز", fields: routingFields });
  if (attachmentFields.length) groups.push({ title: "المرفقات", fields: attachmentFields });

  const review: DetailField[] = [];
  if (r.reviewed_at) review.push({ label: "تاريخ المراجعة", value: fmtDate(r.reviewed_at) });
  if (r.review_notes) review.push({ label: "ملاحظات HR", value: r.review_notes });
  if (r.rejection_reason) review.push({ label: "سبب الرفض", value: r.rejection_reason });
  if (review.length) groups.push({ title: "مراجعة HR", fields: review });

  return groups;
}
