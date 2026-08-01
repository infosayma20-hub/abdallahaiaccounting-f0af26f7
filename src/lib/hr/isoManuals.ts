// ISO 22000 — أدلة/ملفات النظام (13 مجلد فرعي)
export type IsoManualDef = {
  code: string;
  name_ar: string;
  owner_role_label?: string;
};

export const ISO_MANUALS: IsoManualDef[] = [
  { code: "FSM", name_ar: "نظام إدارة سلامة الغذاء", owner_role_label: "مسؤول الجودة" },
  { code: "MDC", name_ar: "إدارة الوثائق والسجلات", owner_role_label: "مسؤول الجودة" },
  { code: "PRP", name_ar: "البرامج التمهيدية (PRPs)", owner_role_label: "مسؤول الجودة" },
  { code: "OPT", name_ar: "العمليات التشغيلية", owner_role_label: "مدير العمليات" },
  { code: "PCS", name_ar: "ضبط العمليات ونقاط التحكم", owner_role_label: "مسؤول الجودة" },
  { code: "FHM", name_ar: "مناولة وتداول الأغذية", owner_role_label: "مدير الفرع" },
  { code: "FSI", name_ar: "تعليمات سلامة الغذاء", owner_role_label: "مسؤول الجودة" },
  { code: "HRM", name_ar: "الموارد البشرية والتدريب", owner_role_label: "مدير الموارد البشرية" },
  { code: "MTM", name_ar: "الصيانة والمعايرة", owner_role_label: "مسؤول الصيانة" },
  { code: "IFA", name_ar: "البنية التحتية والمرافق", owner_role_label: "مسؤول الصيانة" },
  { code: "SDM", name_ar: "المخازن والتوريد والتوزيع", owner_role_label: "مسؤول المستودع" },
  { code: "NCC", name_ar: "حالات عدم المطابقة والإجراءات التصحيحية", owner_role_label: "مسؤول الجودة" },
  { code: "EPR", name_ar: "الاستعداد والاستجابة للطوارئ", owner_role_label: "مدير العمليات" },
];

export const ISO_MANUAL_LABEL = (code?: string | null) =>
  ISO_MANUALS.find((m) => m.code === code)?.name_ar || code || "—";

export const ISO_DOC_TYPES: { value: string; label: string }[] = [
  { value: "procedure", label: "إجراء" },
  { value: "work_instruction", label: "تعليمات عمل" },
  { value: "policy", label: "سياسة" },
];

export const ISO_DOC_TYPE_LABEL = (v?: string | null) =>
  ISO_DOC_TYPES.find((t) => t.value === v)?.label || "إجراء";

export const ISO_SCHEDULES: { value: string; label: string }[] = [
  { value: "per_event", label: "عند الحدث" },
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربعي" },
  { value: "semiannual", label: "نصف سنوي" },
  { value: "yearly", label: "سنوي" },
];