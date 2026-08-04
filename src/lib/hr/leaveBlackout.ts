/**
 * أيام/فترات محظورة لطلبات الإجازات.
 * الموارد البشرية تحدد فترات (من/إلى) ممنوع على الموظف يقدّم إجازة فيها،
 * وتظهر مطفيّة في تقويم طلب الإجازة.
 */
export type LeaveBlackout = {
  id: string;
  start_date: string; // yyyy-mm-dd
  end_date: string;   // yyyy-mm-dd
  reason: string | null;
  branch_id: string | null;
  is_active: boolean;
};

/** yyyy-mm-dd بالتوقيت المحلي (بدون انزياح UTC) */
export const toISODate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const parseISODate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** هل التاريخ يقع ضمن فترة محظورة؟ يرجع الفترة المطابقة أو null */
export function findBlackout(
  date: string | Date | undefined | null,
  ranges: LeaveBlackout[],
  branchId?: string | null,
): LeaveBlackout | null {
  if (!date) return null;
  const iso = typeof date === "string" ? date : toISODate(date);
  if (!iso) return null;
  return (
    ranges.find(
      r =>
        r.is_active !== false &&
        iso >= r.start_date &&
        iso <= r.end_date &&
        (!r.branch_id || !branchId || r.branch_id === branchId),
    ) ?? null
  );
}

/** هل أي يوم ضمن المدى [from..to] محظور؟ */
export function findBlackoutInRange(
  from: string | null | undefined,
  to: string | null | undefined,
  ranges: LeaveBlackout[],
  branchId?: string | null,
): LeaveBlackout | null {
  if (!from) return null;
  const end = to && to >= from ? to : from;
  const cur = parseISODate(from);
  const stop = parseISODate(end);
  let guard = 0;
  while (cur <= stop && guard++ < 400) {
    const hit = findBlackout(toISODate(cur), ranges, branchId);
    if (hit) return hit;
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

export const formatBlackoutLabel = (r: LeaveBlackout): string =>
  r.start_date === r.end_date ? r.start_date : `${r.start_date} ← ${r.end_date}`;
