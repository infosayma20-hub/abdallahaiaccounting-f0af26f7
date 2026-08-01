// ISO 22000 — أدلة/ملفات النظام (13 مجلد فرعي)
export type IsoManualDef = {
  code: string;
  name_ar: string;
  owner_role_label?: string;
};

export const ISO_MANUALS: IsoManualDef[] = [
  { code: "FSM", name_ar: "1- إدارة نظام السلامة الغذائية", owner_role_label: "مسؤول الجودة" },
  { code: "HRM", name_ar: "2- إدارة الموارد البشرية", owner_role_label: "مدير الموارد البشرية" },
  { code: "MTM", name_ar: "3- إدارة الصيانة", owner_role_label: "مسؤول الصيانة" },
  { code: "IFA", name_ar: "4- إدارة معايرة أجهزة الفحص", owner_role_label: "مسؤول الجودة" },
  { code: "MDC", name_ar: "5- إدارة وثائق نظام السلامة", owner_role_label: "مسؤول الجودة" },
  { code: "PRP", name_ar: "6- إدارة البرامج الأساسية (PRPs)", owner_role_label: "مسؤول الجودة" },
  { code: "EPR", name_ar: "7- الاستعداد والاستجابة لحالات الطوارئ", owner_role_label: "مدير العمليات" },
  { code: "SDM", name_ar: "8- إدارة الشراء والتعاقد وتقييم الموردين", owner_role_label: "مسؤول المشتريات" },
  { code: "OPT", name_ar: "9- إدارة العمليات والتتبع", owner_role_label: "مدير العمليات" },
  { code: "FHM", name_ar: "10- إدارة المخاطر الغذائية", owner_role_label: "مسؤول الجودة" },
  { code: "NCC", name_ar: "11- إدارة حالات عدم المطابقة", owner_role_label: "مسؤول الجودة" },
  { code: "PCS", name_ar: "12- تدقيق نظام إدارة السلامة الغذائية", owner_role_label: "مسؤول الجودة" },
  { code: "FSI", name_ar: "13- تطوير نظام إدارة السلامة الغذائية", owner_role_label: "مسؤول الجودة" },
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