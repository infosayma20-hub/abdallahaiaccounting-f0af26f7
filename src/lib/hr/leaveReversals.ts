/**
 * استرجاع أيام الإجازة عند إثبات الدوام (Leave-day clawback)
 * ─────────────────────────────────────────────────────────────
 * القاعدة الحاكمة: لا يُعدَّل طلب الإجازة الأصلي ولا يُحذف — بل تُسجَّل
 * حركة استرجاع مضادة في `leave_day_reversals` (نفس منطق القيد العكسي
 * في المحاسبة). لذلك:
 *
 *   الأيام المستخدمة فعلياً = Σ days_count (approved) − Σ reversal_days (confirmed)
 *
 * السجلات بحالة `pending_review` لا تُخصم أبداً — لا أثر على الرصيد ولا
 * على الراتب قبل تأكيد الموارد البشرية.
 */
import { supabase } from "@/integrations/supabase/client";

export type ReversalStatus = "pending_review" | "confirmed" | "dismissed";

export interface LeaveReversalRow {
  id: string;
  user_id: string;
  employee_id: string;
  leave_id: string;
  leave_type: string;
  reversal_date: string;
  detected_hours: number;
  reversal_days: number;
  status: ReversalStatus;
  detection_source: string;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReversalBucket { annual: number; sick: number; other: number; total: number }

export const emptyBucket = (): ReversalBucket => ({ annual: 0, sick: 0, other: 0, total: 0 });

function addToBucket(b: ReversalBucket, leaveType: string, days: number) {
  const t = String(leaveType || "").trim();
  if (t === "سنوية" || t === "عادية") b.annual += days;
  else if (t === "مرضية") b.sick += days;
  else b.other += days;
  b.total += days;
}

/**
 * مجموع أيام الاسترجاع **المؤكدة** لكل موظف خلال سنة محددة.
 * يُستخدم لطرحها من الأيام المستخدمة قبل احتساب الرصيد.
 */
export async function fetchConfirmedReversals(params: {
  employeeIds?: string[];
  ownerId?: string | null;
  year?: number;
}): Promise<Map<string, ReversalBucket>> {
  const year = params.year ?? new Date().getFullYear();
  const map = new Map<string, ReversalBucket>();

  let q = supabase
    .from("leave_day_reversals")
    .select("employee_id, leave_type, reversal_days, reversal_date")
    .eq("status", "confirmed")
    .gte("reversal_date", `${year}-01-01`)
    .lte("reversal_date", `${year}-12-31`);

  if (params.employeeIds?.length) {
    if (params.employeeIds.length > 200) {
      // تجنّب روابط طويلة جداً: نجلب على مستوى المالك ونرشّح محلياً
      if (params.ownerId) q = q.eq("user_id", params.ownerId);
    } else {
      q = q.in("employee_id", params.employeeIds);
    }
  } else if (params.ownerId) {
    q = q.eq("user_id", params.ownerId);
  }

  const { data, error } = await q.limit(20000);
  if (error || !data) return map;

  const allow = params.employeeIds?.length ? new Set(params.employeeIds) : null;
  for (const r of data as any[]) {
    if (allow && !allow.has(r.employee_id)) continue;
    const b = map.get(r.employee_id) || emptyBucket();
    addToBucket(b, r.leave_type, Number(r.reversal_days || 0));
    map.set(r.employee_id, b);
  }
  return map;
}

/** الأيام المستخدمة صافيةً بعد طرح الاسترجاع المؤكد (لا تنزل تحت الصفر). */
export const netUsedDays = (rawUsed: number, reversed: number) =>
  +Math.max(0, Number(rawUsed || 0) - Number(reversed || 0)).toFixed(2);

/** سجلات التعارض التي تنتظر مراجعة الموارد البشرية. */
export async function fetchPendingReversals(params: {
  employeeId?: string;
  ownerId?: string | null;
}): Promise<LeaveReversalRow[]> {
  let q = supabase
    .from("leave_day_reversals")
    .select("*")
    .eq("status", "pending_review")
    .order("reversal_date", { ascending: false })
    .limit(500);
  if (params.employeeId) q = q.eq("employee_id", params.employeeId);
  else if (params.ownerId) q = q.eq("user_id", params.ownerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as LeaveReversalRow[];
}

/** تأكيد أو تجاهل سجل استرجاع (يمرّ عبر دالة قاعدة البيانات التي تفرض الصلاحية وأقفال الحضور). */
export async function reviewReversal(
  reversalId: string,
  action: "confirm" | "dismiss",
  reason?: string,
) {
  const { data, error } = await supabase.rpc("review_leave_day_reversal", {
    _reversal_id: reversalId,
    _action: action,
    _reason: reason || null,
  });
  if (error) throw error;
  return data as any;
}