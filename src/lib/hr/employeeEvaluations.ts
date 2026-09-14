/**
 * منطق تجميع تقييمات الموظفين (HRM-05 / HRM-06 وأي قالب تقييم مشابه).
 * منفصل عن الواجهة ليكون قابلاً للاختبار وبلا أي أثر على البيانات.
 */

export type EvalFieldDef = { key: string; label: string; type?: string; options?: string[] };
export type EvalSectionDef = { key: string; title?: string; fields?: EvalFieldDef[] };
export type EvalTemplateRow = { id: string; name: string; schema: { sections?: EvalSectionDef[] } | null };

export type EvalFormRow = {
  id: string;
  employee_id: string | null;
  /** الموظف المقيَّم المرتبط بملفه (يُملأ عند الاختيار من القائمة المنسدلة). */
  subject_employee_id?: string | null;
  template_id: string | null;
  title: string | null;
  form_data: Record<string, any> | null;
  status: string | null;
  workflow_status: string | null;
  created_at: string;
  submitted_at: string | null;
  hr_hidden_at: string | null;
  employee_acknowledged_at: string | null;
};

export type EvalEmployeeLite = { id: string; full_name: string; job_title: string | null; branch_id: string | null };

export type EvalRow = {
  id: string;
  created_at: string;
  templateId: string;
  templateName: string;
  /** الموظف الذي جرى تقييمه (نص داخل النموذج، أو اسم الموظف المرتبط). */
  evaluated: string;
  /** معرّف الموظف المقيَّم إن كان التقييم مربوطاً بملفه. */
  subjectEmployeeId: string | null;
  /** المدير الذي عبّأ التقييم (صاحب السجل في employee_forms). */
  evaluatorName: string;
  evaluatorJob: string;
  /** صفة المقيِّم كما اختارها في النموذج (مدير فرع / موارد بشرية ...). */
  evaluatorRole: string;
  branch: string;
  evalType: string;
  jobTitle: string;
  year: string;
  evalDate: string;
  /** المجموع كما كُتب في النموذج (إن وُجد). */
  total: number | null;
  /** معدل المعايير المعبّأة من 10. */
  average: number | null;
  criteriaFilled: number;
  criteriaCount: number;
  acknowledged: boolean;
  status: string;
  raw: EvalFormRow;
};

/** قالب تقييم = فيه قسم معايير + اسم الموظف المقيَّم في الترويسة. */
export const isEvaluationTemplate = (t: EvalTemplateRow): boolean => {
  const secs = t.schema?.sections || [];
  const hasCriteria = secs.some((s) => s.key === "criteria" && (s.fields?.length || 0) > 0);
  const hasEmployee = secs.some((s) => (s.fields || []).some((f) => f.key === "employee_name"));
  return hasCriteria && hasEmployee;
};

export const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** توحيد الاسم العربي للمقارنة فقط، دون تغيير الاسم المحفوظ أو المعروض. */
export const normalizeArabicName = (value: string): string => String(value || "")
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[إأآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ؤ/g, "و")
  .replace(/ئ/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * يطابق الاسم النصي القديم مع موظف واحد فقط.
 * يقبل الاسم الثنائي إذا كانت كلماته مرتبة داخل الاسم الرباعي، ويرفض أي تطابق ملتبس.
 */
export function resolveLegacySubjectId(typedName: string, employees: EvalEmployeeLite[]): string | null {
  const wanted = normalizeArabicName(typedName).split(" ").filter(Boolean);
  if (wanted.length < 2) return null;
  const candidates = employees.filter((employee) => {
    const full = normalizeArabicName(employee.full_name).split(" ").filter(Boolean);
    let cursor = 0;
    for (const token of full) {
      if (token === wanted[cursor]) cursor += 1;
      if (cursor === wanted.length) return true;
    }
    return false;
  });
  return candidates.length === 1 ? candidates[0].id : null;
}

export const scoreLabel = (avg: number | null) => {
  if (avg === null) return "غير مكتمل";
  if (avg >= 8) return "ممتاز";
  if (avg >= 6) return "جيد";
  return "يحتاج متابعة";
};

/** يحوّل سجلات النماذج الخام إلى صفوف جاهزة للعرض دون أي تعديل على البيانات. */
export function buildEvalRows(
  forms: EvalFormRow[],
  templates: EvalTemplateRow[],
  employees: EvalEmployeeLite[],
  branchNames: Map<string, string>,
): EvalRow[] {
  const tplById = new Map(templates.map((t) => [t.id, t]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  return forms.map((f) => {
    const tpl = f.template_id ? tplById.get(f.template_id) : undefined;
    const header = (f.form_data?.header || {}) as Record<string, any>;
    const criteria = (f.form_data?.criteria || {}) as Record<string, any>;
    const criteriaFields = (tpl?.schema?.sections || []).find((s) => s.key === "criteria")?.fields || [];
    const scored = criteriaFields.filter((c) => c.key !== "total");
    const values = scored.map((c) => numOrNull(criteria[c.key])).filter((n): n is number => n !== null);
    const emp = f.employee_id ? empMap.get(f.employee_id) : undefined;
    const subject = f.subject_employee_id ? empMap.get(f.subject_employee_id) : undefined;

    return {
      id: f.id,
      created_at: f.created_at,
      templateId: f.template_id || "",
      templateName: tpl?.name || f.title || "تقييم",
      evaluated: subject?.full_name || String(header.employee_name || "").trim() || "—",
      subjectEmployeeId: f.subject_employee_id || null,
      evaluatorName: emp?.full_name || "—",
      evaluatorJob: emp?.job_title || "—",
      evaluatorRole: String(header.evaluator || header.evaluator_name || "").trim() || "—",
      branch: (subject?.branch_id && branchNames.get(subject.branch_id))
        || (emp?.branch_id && branchNames.get(emp.branch_id)) || "—",
      evalType: String(header.eval_type || "").trim() || "—",
      jobTitle: subject?.job_title || String(header.job_title || header.department || "").trim() || "—",
      year: String(header.year || "").trim() || (f.created_at || "").slice(0, 4),
      evalDate: String(header.eval_date || header.probation_start || "").trim() || "",
      total: numOrNull(criteria.total),
      average: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
      criteriaFilled: values.length,
      criteriaCount: scored.length,
      acknowledged: !!(f.employee_acknowledged_at || (f.form_data?.followup || {}).employee_ack),
      status: f.workflow_status || "draft",
      raw: f,
    };
  });
}

/* ------------------------------------------------------------------ */
/* تغطية التقييم: مين تقيّم ومين لسا                                    */
/* ------------------------------------------------------------------ */

export const EVALUATION_CYCLE_DAYS = 90;

export type CoverageRow = {
  employeeId: string;
  name: string;
  jobTitle: string;
  branch: string;
  lastEvalAt: string | null;
  lastEvalId: string | null;
  daysSince: number | null;
  /** never = لم يُقيَّم أبداً، due = تجاوز الدورة، ok = ضمن الدورة. */
  state: "never" | "due" | "ok";
  evalCount: number;
};

/**
 * يبني قائمة تغطية التقييم لكل موظف نشط اعتماداً على التقييمات المربوطة بملفه فقط
 * (التقييمات القديمة غير المربوطة لا تُحتسب — تُربط يدوياً من تفاصيل التقييم).
 */
export function buildCoverageRows(
  employees: EvalEmployeeLite[],
  rows: EvalRow[],
  branchNames: Map<string, string>,
  now: Date = new Date(),
): CoverageRow[] {
  const byEmp = new Map<string, EvalRow[]>();
  for (const r of rows) {
    const resolvedId = r.subjectEmployeeId || resolveLegacySubjectId(r.evaluated, employees);
    if (!resolvedId) continue;
    const arr = byEmp.get(resolvedId) || [];
    arr.push(r);
    byEmp.set(resolvedId, arr);
  }

  return employees.map((e) => {
    const list = (byEmp.get(e.id) || []).slice().sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    const last = list[0] || null;
    const daysSince = last
      ? Math.floor((now.getTime() - Date.parse(last.created_at)) / 86400000)
      : null;
    return {
      employeeId: e.id,
      name: e.full_name,
      jobTitle: e.job_title || "—",
      branch: (e.branch_id && branchNames.get(e.branch_id)) || "—",
      lastEvalAt: last?.created_at || null,
      lastEvalId: last?.id || null,
      daysSince,
      state: (!last ? "never" : (daysSince as number) >= EVALUATION_CYCLE_DAYS ? "due" : "ok") as CoverageRow["state"],
      evalCount: list.length,
    };
  }).sort((a: CoverageRow, b: CoverageRow) => {
    const rank = { never: 0, due: 1, ok: 2 } as const;
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return (b.daysSince ?? 99999) - (a.daysSince ?? 99999);
  });
}
