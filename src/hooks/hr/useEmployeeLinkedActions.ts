import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { decodeHRMessage, HRMessageMeta } from "@/lib/hrMessages";

export interface LinkedActionRow {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  employee_acknowledged_at: string | null;
  meta: HRMessageMeta | null;
}

/** يجلب الإجراءات العقابية والرسائل المُرسلة للموظف (من HR أو المدير). */
export function useEmployeeLinkedActions(employeeId?: string) {
  const [rows, setRows] = useState<LinkedActionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("correction_requests")
      .select("id, attendance_date, request_type, reason, status, created_at, review_notes, reviewed_at, employee_acknowledged_at")
      .eq("employee_id", employeeId)
      .in("request_type", ["penalty", "hr_message"])
      .order("created_at", { ascending: false })
      .limit(200);
    setRows(((data || []) as any[]).map((r) => ({ ...r, meta: decodeHRMessage(r.reason) })));
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return { rows, loading, refetch: fetchRows };
}

/** يربط سجل الإنذار/المخالفة الداخلي بالإجراء الذي وصل فعلياً للموظف. */
export function matchLinkedActions(record: any, rows: LinkedActionRow[]): LinkedActionRow[] {
  if (!record) return [];
  const norm = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const desc = norm(record.description);
  const action = norm(record.action_taken);
  const date = record.record_date;

  return rows.filter((r) => {
    const body = norm(r.meta?.body);
    const subject = norm(r.meta?.subject);
    const sameDate =
      r.attendance_date === date ||
      r.meta?.violation_date === date ||
      r.meta?.effective_date === date ||
      (r.created_at || "").slice(0, 10) === date;
    const textHit =
      (!!desc && (body.includes(desc) || subject.includes(desc) || desc.includes(subject))) ||
      (!!action && (body.includes(action) || subject.includes(action)));
    return sameDate || textHit;
  });
}
