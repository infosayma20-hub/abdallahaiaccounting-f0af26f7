/**
 * إعدادات نموذج طلب التوظيف (Form Builder).
 *
 * كل مستخدم في الموارد البشرية يستطيع بناء نموذج التوظيف الخاص به:
 * - تفعيل/إيقاف أقسام النموذج الجاهزة (HRM-01).
 * - إضافة أسئلة مخصّصة بأنواع مختلفة.
 *
 * تُخزَّن في `job_application_links.form_config` (jsonb)، والإجابات المخصّصة
 * في `job_applications.custom_answers` (jsonb array).
 *
 * ملاحظة توافقية: الروابط القديمة (مثل رابط الملكي) قيمتها `{}` — وفي هذه
 * الحالة تُعتمد الإعدادات الافتراضية أدناه، أي كل أقسام HRM-01 مفعّلة،
 * فيبقى النموذج كما هو تماماً دون أي تغيير.
 */

export type JobFormSectionKey =
  | "education"
  | "courses"
  | "languages"
  | "experience"
  | "referees"
  | "preferences"
  | "attachment";

export const JOB_FORM_SECTIONS: { key: JobFormSectionKey; label: string; hint: string }[] = [
  { key: "education", label: "المؤهلات العلمية", hint: "درجة، تخصص، مكان الدراسة، من/إلى" },
  { key: "courses", label: "البرامج التدريبية", hint: "اسم الدورة، المؤسسة، الساعات" },
  { key: "languages", label: "اللغات", hint: "لغة + مستوى المحادثة/القراءة/الكتابة" },
  { key: "experience", label: "خبرات العمل السابقة", hint: "مكان العمل، الوظيفة، من/إلى" },
  { key: "referees", label: "المعرفون", hint: "الاسم، هاتف، محمول، بريد" },
  { key: "preferences", label: "تفضيلات العمل", hint: "الدوام، نوع الوظيفة، التدخين، الرخصة" },
  { key: "attachment", label: "المرفقات", hint: "سيرة ذاتية / فحص طبي (اختياري)" },
];

/** الحقول الشخصية الاختيارية داخل قسم البيانات الشخصية (الاسم/الهاتف/الوظيفة إجبارية دائماً). */
export type JobFormPersonalKey =
  | "national_id"
  | "gender"
  | "birth_date"
  | "birth_place"
  | "marital_status"
  | "children_count"
  | "address"
  | "email";

export const JOB_FORM_PERSONAL_FIELDS: { key: JobFormPersonalKey; label: string }[] = [
  { key: "national_id", label: "رقم الهوية" },
  { key: "gender", label: "الجنس" },
  { key: "birth_date", label: "تاريخ الميلاد" },
  { key: "birth_place", label: "مكان السكن" },
  { key: "marital_status", label: "الحالة الاجتماعية" },
  { key: "children_count", label: "عدد الأولاد" },
  { key: "address", label: "العنوان" },
  { key: "email", label: "البريد الإلكتروني" },
];

export type JobQuestionType = "text" | "textarea" | "number" | "date" | "select" | "yesno";

export const JOB_QUESTION_TYPES: { key: JobQuestionType; label: string }[] = [
  { key: "text", label: "نص قصير" },
  { key: "textarea", label: "نص طويل" },
  { key: "number", label: "رقم" },
  { key: "date", label: "تاريخ" },
  { key: "select", label: "اختيار من قائمة" },
  { key: "yesno", label: "نعم / لا" },
];

export type JobCustomQuestion = {
  id: string;
  label: string;
  type: JobQuestionType;
  required: boolean;
  /** خيارات نوع "اختيار من قائمة" فقط. */
  options?: string[];
};

export type JobFormConfig = {
  sections: Record<JobFormSectionKey, boolean>;
  personal: Record<JobFormPersonalKey, boolean>;
  questions: JobCustomQuestion[];
};

export const DEFAULT_JOB_FORM_CONFIG: JobFormConfig = {
  sections: {
    education: true,
    courses: true,
    languages: true,
    experience: true,
    referees: true,
    preferences: true,
    attachment: true,
  },
  personal: {
    national_id: true,
    gender: true,
    birth_date: true,
    birth_place: true,
    marital_status: true,
    children_count: true,
    address: true,
    email: true,
  },
  questions: [],
};

export const MAX_CUSTOM_QUESTIONS = 30;

/** تحويل قيمة jsonb المخزّنة إلى إعدادات كاملة مع القيم الافتراضية (fail-open للنموذج القديم). */
export function parseJobFormConfig(raw: unknown): JobFormConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<JobFormConfig>;
  const sections = { ...DEFAULT_JOB_FORM_CONFIG.sections };
  const personal = { ...DEFAULT_JOB_FORM_CONFIG.personal };

  if (cfg.sections && typeof cfg.sections === "object") {
    for (const s of JOB_FORM_SECTIONS) {
      const v = (cfg.sections as any)[s.key];
      if (typeof v === "boolean") sections[s.key] = v;
    }
  }
  if (cfg.personal && typeof cfg.personal === "object") {
    for (const f of JOB_FORM_PERSONAL_FIELDS) {
      const v = (cfg.personal as any)[f.key];
      if (typeof v === "boolean") personal[f.key] = v;
    }
  }

  const questions: JobCustomQuestion[] = Array.isArray(cfg.questions)
    ? (cfg.questions as any[])
        .filter((q) => q && typeof q === "object" && typeof q.label === "string" && q.label.trim())
        .slice(0, MAX_CUSTOM_QUESTIONS)
        .map((q, i) => ({
          id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
          label: String(q.label).slice(0, 200),
          type: (JOB_QUESTION_TYPES.some((t) => t.key === q.type) ? q.type : "text") as JobQuestionType,
          required: q.required === true,
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => String(o).slice(0, 120)).filter(Boolean).slice(0, 20)
            : undefined,
        }))
    : [];

  return { sections, personal, questions };
}

export const newQuestionId = () =>
  `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export type JobCustomAnswer = { id: string; label: string; value: string };

/** قراءة إجابات الأسئلة المخصّصة المخزّنة على الطلب. */
export function parseCustomAnswers(raw: unknown): JobCustomAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a: any) => ({
      id: String(a.id ?? ""),
      label: String(a.label ?? ""),
      value: String(a.value ?? ""),
    }))
    .filter((a) => a.label && a.value);
}

/* -------------------------------------------------------------------------
 * خيارات موحّدة (تُستخدم في نموذج التقديم العام وشاشة الموارد البشرية)
 * ---------------------------------------------------------------------- */

/** مواقع العمل المتاحة. `femaleAllowed=false` تعني أن الخيار لا يظهر للإناث. */
export const WORK_LOCATION_OPTIONS: {
  value: string;
  femaleAllowed: boolean;
  /** يتطلب توضيحاً نصياً من المتقدم (إدارة / أخرى). */
  needsDetail?: boolean;
}[] = [
  { value: "مطبخ", femaleAllowed: false },
  { value: "كاونتر", femaleAllowed: false },
  { value: "كاش", femaleAllowed: true },
  { value: "نظافة", femaleAllowed: false },
  { value: "صالة", femaleAllowed: true },
  { value: "خدمة عملاء", femaleAllowed: true },
  { value: "إدارة", femaleAllowed: true, needsDetail: true },
  { value: "أخرى", femaleAllowed: true, needsDetail: true },
];

export const workLocationOptionsFor = (gender: string) =>
  gender === "أنثى" ? WORK_LOCATION_OPTIONS.filter((o) => o.femaleAllowed) : WORK_LOCATION_OPTIONS;

export const workLocationNeedsDetail = (value: string) =>
  WORK_LOCATION_OPTIONS.some((o) => o.value === value && o.needsDetail);

/** الحالة الاجتماعية — مؤنّثة عند اختيار «أنثى». */
const MARITAL_MALE = ["أعزب", "خاطب", "متزوج", "مطلق", "أرمل"];
const MARITAL_FEMALE = ["عزباء", "خاطبة", "متزوجة", "مطلقة", "أرملة"];

export const maritalOptionsFor = (gender: string) =>
  gender === "أنثى" ? MARITAL_FEMALE : MARITAL_MALE;

/** عدد الأولاد يظهر ويكون إلزامياً فقط للمتزوج/المطلق/الأرمل (بصيغتَي المذكّر والمؤنّث). */
export const maritalRequiresChildren = (marital: string) =>
  ["متزوج", "متزوجة", "مطلق", "مطلقة", "أرمل", "أرملة"].includes(marital);
