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
  /** الموظف الذي جرى تقييمه (نص داخل النموذج). */
  evaluated: string;
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

    return {
      id: f.id,
      created_at: f.created_at,
      templateId: f.template_id || "",
      templateName: tpl?.name || f.title || "تقييم",
      evaluated: String(header.employee_name || "").trim() || "—",
      evaluatorName: emp?.full_name || "—",
      evaluatorJob: emp?.job_title || "—",
      evaluatorRole: String(header.evaluator || header.evaluator_name || "").trim() || "—",
      branch: (emp?.branch_id && branchNames.get(emp.branch_id)) || "—",
      evalType: String(header.eval_type || "").trim() || "—",
      jobTitle: String(header.job_title || header.department || "").trim() || "—",
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
