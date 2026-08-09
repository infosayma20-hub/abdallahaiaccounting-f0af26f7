/**
 * النماذج المدمجة في تطبيق الموظف.
 *
 * هذه النماذج مبنية داخل التطبيق (حقولها ثابتة في الكود)، لكن الموارد البشرية
 * تستطيع تعديل: الاسم المعروض، الوصف، التفعيل/الإيقاف، رسالة الإغلاق، والترتيب.
 * تُخزَّن هذه التعديلات في جدول `builtin_form_settings` (مفتاح: form_key).
 */
export type BuiltinFormDef = {
  key: string;
  name: string;
  fields: string;
  managerOnly?: boolean;
};

export const BUILTIN_FORMS: BuiltinFormDef[] = [
  { key: "advance_request", name: "طلب سلفة", fields: "مبلغ السلفة + فرع الاستلام (إجباري)" },
  { key: "leave_request", name: "طلب إجازة", fields: "نوع الإجازة، من/إلى، السبب، مرفق" },
  { key: "loan_request", name: "طلب قرض حسن", fields: "المبلغ وعدد الأقساط" },
  { key: "correction_request", name: "طلب تصحيح بصمة", fields: "اليوم والوقت الصحيح والسبب" },
  { key: "hr_message", name: "رسالة لـ HR", fields: "نص حر" },
  { key: "employee_info", name: "تعبئة معلومات الموظف", fields: "بيانات الموظف الشخصية والوظيفية" },
  { key: "complaints", name: "شكاوى وملاحظات واقتراحات", fields: "نص حر مع إمكانية الإرفاق" },
  { key: "employee_voice", name: "صوت الموظف", fields: "اقتراح / فكرة / رأي / ملاحظة تحسين" },
  { key: "facility_quality", name: "جودة المرافق والمعدات", fields: "تقييم حالة المرافق" },
  { key: "overtime_request", name: "طلب أوفرتايم", fields: "التاريخ وعدد الساعات والسبب", managerOnly: true },
  { key: "disciplinary_action", name: "طلب إجراء عقابي", fields: "الموظف، المخالفة، الإجراء", managerOnly: true },
  { key: "equipment_fault", name: "الإبلاغ عن أعطال المعدات", fields: "الجهاز، العطل، الأولوية", managerOnly: true },
  { key: "inventory_balance", name: "رصيد الأصناف", fields: "الأصناف والكميات", managerOnly: true },
];

export type BuiltinFormSetting = {
  id?: string;
  form_key: string;
  label_override: string | null;
  description_override: string | null;
  is_enabled: boolean;
  closed_message: string | null;
  sort_order: number;
};

export const defaultBuiltinSetting = (key: string, idx = 0): BuiltinFormSetting => ({
  form_key: key,
  label_override: null,
  description_override: null,
  is_enabled: true,
  closed_message: null,
  sort_order: idx,
});
