import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { decodeHRMessage, HRMessageMeta } from "@/lib/hrMessages";

export interface ManagerReport {
  id: string;
  employee_id: string;
  form_type: string;
  status: string;
  workflow_status: string | null;
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  title: string | null;
  form_data: any;
  /** توصية الموارد البشرية قبل قرار الإدارة */
  hr_recommendation: string | null;
  hr_recommendation_notes: string | null;
  /** قرار الإدارة النهائي (كتاب التوصية) */
  final_decided_at: string | null;
  final_decision_notes: string | null;
}

export interface HRAction {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  employee_acknowledged_at: string | null;
  hr_recommendation: string | null;
  hr_recommendation_notes: string | null;
  final_decision: string | null;
  final_decided_at: string | null;
  final_decision_notes: string | null;
  meta: HRMessageMeta | null;
}


export interface InternalRecord {
  id: string;
  record_type: string;
  record_date: string;
  title: string | null;
  description: string | null;
  action_taken: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface DisciplinaryCase {
  key: string;
  /** أول حدث في السلسلة (تاريخ الفتح) */
  openedAt: string;
  report: ManagerReport | null;
  actions: HRAction[];
  records: InternalRecord[];
}

const dayOf = (iso?: string | null) => (iso || "").slice(0, 10);

/**
 * يجمع أحداث المخالفة الواحدة في سجل واحد:
 * كتاب المدير (employee_forms) ← إجراء الموارد للموظف (correction_requests)
 * ← السجل الداخلي (employee_hr_records) ← اطّلاع/ردّ الموظف.
 */
export function useDisciplinaryCases(employeeId?: string, ownerUserId?: string) {
  const [cases, setCases] = useState<DisciplinaryCase[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const [formsRes, actionsRes, recordsRes] = await Promise.all([
      supabase
        .from("employee_forms")
        .select("id, employee_id, form_type, status, workflow_status, created_at, review_notes, reviewed_at, title, form_data, hr_recommendation, hr_recommendation_notes, final_decided_at, final_decision_notes")
        .eq("employee_id", employeeId)
        .in("form_type", ["disciplinary_action", "complaints"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("correction_requests")
        .select("id, attendance_date, request_type, reason, status, created_at, review_notes, reviewed_at, employee_acknowledged_at, hr_recommendation, hr_recommendation_notes, final_decision, final_decided_at, final_decision_notes")
        .eq("employee_id", employeeId)
        .in("request_type", ["penalty", "hr_message"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("employee_hr_records")
        .select("id, record_type, record_date, title, description, action_taken, cancelled_at, cancel_reason")
        .eq("employee_id", employeeId)
        .eq("record_type", "warning")
        .order("record_date", { ascending: false })
        .limit(200),
    ]);

    const reports = (formsRes.data || []) as ManagerReport[];
    const actions = ((actionsRes.data || []) as any[]).map((r) => ({ ...r, meta: decodeHRMessage(r.reason) })) as HRAction[];
    const records = (recordsRes.data || []) as InternalRecord[];

    const byKey = new Map<string, DisciplinaryCase>();
    const ensure = (key: string, openedAt: string, report: ManagerReport | null): DisciplinaryCase => {
      const existing = byKey.get(key);
      if (existing) {
        if (report && !existing.report) existing.report = report;
        if (openedAt < existing.openedAt) existing.openedAt = openedAt;
        return existing;
      }
      const created: DisciplinaryCase = { key, openedAt, report, actions: [], records: [] };
      byKey.set(key, created);
      return created;
    };

    reports.forEach((f) => ensure(`form:${f.id}`, f.created_at, f));

    const usedRecords = new Set<string>();

    actions.forEach((a) => {
      const linkedFormId = a.meta?.source_form_id;
      let key: string | null = null;
      if (linkedFormId && reports.some((f) => f.id === linkedFormId)) {
        key = `form:${linkedFormId}`;
      } else {
        // fallback: نفس الموظف ونفس تاريخ المخالفة/الحدث
        const day = a.meta?.violation_date || a.attendance_date || dayOf(a.created_at);
        const match = reports.find((f) => dayOf(f.created_at) === day || dayOf(f.created_at) === dayOf(a.created_at));
        key = match ? `form:${match.id}` : `action:${a.id}`;
      }
      const c = ensure(key, a.created_at, null);
      c.actions.push(a);
      if (a.created_at < c.openedAt) c.openedAt = a.created_at;
    });

    // اربط السجلات الداخلية بالمخالفة الأقرب (نفس تاريخ الإجراء/الكتاب)
    byKey.forEach((c) => {
      const days = new Set<string>([
        ...(c.report ? [dayOf(c.report.created_at)] : []),
        ...c.actions.flatMap((a) => [a.attendance_date, a.meta?.violation_date || "", a.meta?.effective_date || "", dayOf(a.created_at)]),
      ].filter(Boolean) as string[]);
      records.forEach((r) => {
        if (usedRecords.has(r.id)) return;
        if (days.has(r.record_date)) {
          c.records.push(r);
          usedRecords.add(r.id);
        }
      });
    });

    records.forEach((r) => {
      if (usedRecords.has(r.id)) return;
      const c = ensure(`record:${r.id}`, r.record_date, null);
      c.records.push(r);
    });

    const list = Array.from(byKey.values()).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
    setCases(list);
    setLoading(false);
  }, [employeeId, ownerUserId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { cases, loading, refetch: fetchAll };
}

export function caseTitle(c: DisciplinaryCase): string {
  return (
    c.actions[0]?.meta?.subject ||
    c.report?.title ||
    c.report?.form_data?.description?.toString().slice(0, 60) ||
    c.records[0]?.title ||
    "مخالفة"
  );
}

export type CaseStage = "manager_only" | "hr_issued" | "acknowledged" | "responded" | "closed";

export function caseStage(c: DisciplinaryCase): CaseStage {
  if (c.actions.length === 0) return "manager_only";
  const a = c.actions[0];
  if (a.status === "closed" || a.status === "cancelled") return "closed";
  if (a.meta?.employee_response) return "responded";
  if (a.employee_acknowledged_at || a.meta?.employee_acknowledged_at) return "acknowledged";
  return "hr_issued";
}

export const STAGE_LABELS: Record<CaseStage, string> = {
  manager_only: "بانتظار إجراء الموارد",
  hr_issued: "أُرسل للموظف",
  acknowledged: "اطّلع الموظف",
  responded: "ردّ الموظف",
  closed: "مغلق",
};

export const STAGE_TONE: Record<CaseStage, string> = {
  manager_only: "bg-amber-100 text-amber-800 border-amber-200",
  hr_issued: "bg-blue-100 text-blue-800 border-blue-200",
  acknowledged: "bg-emerald-100 text-emerald-800 border-emerald-200",
  responded: "bg-indigo-100 text-indigo-800 border-indigo-200",
  closed: "bg-muted text-muted-foreground border-border",
};
