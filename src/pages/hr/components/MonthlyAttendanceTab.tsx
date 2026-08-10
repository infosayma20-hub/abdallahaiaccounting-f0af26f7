import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay, cn } from "@/lib/utils";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { splitSickPayDays, SICK_FULL_PAY_DAYS } from "@/lib/hr-utils";
import { format } from "date-fns";
import {
  Loader2, Pencil, AlertCircle, Search, Clock,
  RefreshCw, CheckCircle2, Plus, Trash2, ArrowUpDown, FileSpreadsheet, ChevronDown,
} from "lucide-react";

/** يعرض الساعات العشرية بصيغة ساعات:دقائق (مثال 6.9 → 6:54) */
const formatHoursMinutes = (v: number | null | undefined): string => {
  const n = Number(v) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  let h = Math.floor(abs);
  let m = Math.round((abs - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
};

/** تقريب الثواني للدقيقة الأقرب: 0–29 ثانية → للأسفل، 30–59 ثانية → دقيقة كاملة. */
const roundSecondsToMinutes = (ms: number): number => Math.round(ms / 60000);

/** دقائق العمل الفعلية لليوم مع تقريب الثواني للدقيقة الأقرب. */
const rowWorkMinutes = (r: { net_work_minutes?: number | null; total_hours: number | null }): number => {
  const net = Number(r.net_work_minutes);
  if (Number.isFinite(net) && net > 0) return Math.round(net);
  return Math.round((Number(r.total_hours) || 0) * 60);
};

/** يعرض عدد دقائق كـ ساعات:دقائق (مثال 469 → 7:49). */
const formatMinutesHM = (min: number | null | undefined): string => {
  const n = Math.round(Number(min) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
};

type EmployeeLite = {
  id: string;
  full_name: string;
  branch_id: string | null;
  department: string | null;
};

type MonthRow = {
  id: string;
  employee_id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  net_work_minutes?: number | null;
  status: string;
  notes: string | null;
  is_manually_adjusted: boolean | null;
  employees?: { full_name: string };
  breaks?: BreakSummary[];
  branchList?: { id: string; name: string; count: number }[];
  /** Present only for synthetic leave rows (no attendance_days record). */
  leaveInfo?: { leave_id: string; leave_type: string | null } | null;
  /** Placeholder row for a calendar day with no punches and no leave. */
  isEmptyDay?: boolean;
};

type BreakSummary = {
  break_type: BreakDraft["break_type"];
  break_out: string | null;
  break_in: string | null;
  minutes: number;
  /** true = not stored in attendance_breaks, computed from raw punches. */
  derived?: boolean;
};

/** In-memory shape for an attendance break row while editing. */
type BreakDraft = {
  /** Existing DB id (null = new row not yet inserted). */
  id: string | null;
  break_type: "prayer" | "personal" | "meal" | "external_task" | "other";
  /** HH:mm — same day as `attendance_date`. */
  out: string;
  in: string;
  reason: string;
  /** Marks rows that were loaded from DB and later removed by the user. */
  _deleted?: boolean;
  /** true = suggested from raw punches, not stored in attendance_breaks. */
  _derived?: boolean;
};

const BREAK_TYPE_LABEL: Record<BreakDraft["break_type"], string> = {
  prayer: "خروج للصلاة",
  personal: "خروج خاص",
  meal: "استراحة طعام",
  external_task: "مهمة عمل خارجية",
  other: "أخرى",
};

type QuickFilter = "all" | "missing_checkout" | "missing_checkin" | "late" | "absent" | "present";
type BreaksFilter = "any" | "with" | "without" | "prayer" | "no_prayer";
type ViewMode = "summary" | "daily";

/**
 * حسابات وهمية مسجّلة داخل جدول الموظفين (شركات/كولسنتر خارجي مثل "شركة دايال")
 * — يجب ألا تظهر ضمن كشف الحضور الشهري.
 */
function isPseudoEmployee(name?: string | null): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  return /^شركة\b/.test(n) || /كولسنتر|كول سنتر|call\s*center/i.test(n);
}

/** Splits a big `.in()` list so the request URL stays within limits. */
function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

/** Per-employee monthly aggregation used by the payroll-oriented summary view. */
type MonthSummary = {
  employee_id: string;
  name: string;
  employeeNumber: string;
  hourlyRate: number;
  workDays: number;
  hours: number;
  overtime: number;
  lateDays: number;
  absentDays: number;
  missingPunchDays: number;
  breaksMin: number;
  annualLeave: number;
  sickLeave: number;
  otherLeave: number;
};

/** ساعات اليوم القياسية — تُستخدم لتحويل أيام الإجازة إلى ساعات. */
const STANDARD_DAY_HOURS = 8;
/** معامل الساعات الإضافية. */
const OVERTIME_MULTIPLIER = 1.5;

type SortKey =
  | "employeeNumber" | "name" | "branchName" | "departmentName" | "workDays" | "regular" | "overtime" | "overtimeWeighted"
  | "absentDays" | "missingPunchDays" | "annualHours" | "sickHours"
  | "totalHours" | "hourlyRate" | "amount";

const nf = (n: number, d = 2) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** رأس عمود قابل للفرز — يحافظ على لون الخط الأبيض في الشريط العلوي. */
function SortHead({
  label, k, sortKey, sortDir, onSort, align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "right" | "center";
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn("text-white", align === "center" ? "text-center" : "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 text-white hover:opacity-80 whitespace-nowrap"
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );
}

type LeaveBucket = { annual: number; sick: number; other: number };

function pad2(n: number) { return String(n).padStart(2, "0"); }

/** Minimum gap (minutes) between a check-out and the next check-in to be
 *  treated as a real "مغادرة" (anything shorter is punch noise). */
const MIN_DERIVED_GAP_MIN = 2;
/** Maximum gap (minutes) still considered a temporary leave. Anything longer is
 *  almost certainly the boundary between two different shifts (overnight work),
 *  not a real "مغادرة". */
const MAX_DERIVED_GAP_MIN = 300; // 5 hours

type RawPunch = { event_type: string; event_time: string; status?: string | null };

/** Derive temporary-leave gaps (check_out → next check_in) from raw punches,
 *  restricted to the actual work session window of the day so an overnight
 *  shift's early-morning check-out is never paired with the evening check-in
 *  of the same calendar date. */
function deriveGapsFromPunches(
  events: RawPunch[],
  window?: { start?: string | null; end?: string | null },
): { out: string; in: string; minutes: number }[] {
  const ws = window?.start ? new Date(window.start).getTime() : null;
  const we = window?.end ? new Date(window.end).getTime() : null;
  const sorted = [...events]
    .filter((e) => !e.status || e.status === "valid")
    .filter((e) => {
      const t = new Date(e.event_time).getTime();
      if (ws !== null && t < ws) return false;
      if (we !== null && t > we) return false;
      return true;
    })
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
  const gaps: { out: string; in: string; minutes: number }[] = [];
  let lastOut: string | null = null;
  for (const e of sorted) {
    if (e.event_type === "check_out") {
      lastOut = e.event_time;
    } else if (e.event_type === "check_in" && lastOut) {
      const min = Math.floor(
        (new Date(e.event_time).getTime() - new Date(lastOut).getTime()) / 60000,
      );
      if (min >= MIN_DERIVED_GAP_MIN && min <= MAX_DERIVED_GAP_MIN) {
        gaps.push({ out: lastOut, in: e.event_time, minutes: min });
      }
      lastOut = null;
    }
  }
  return gaps;
}

/** true when a derived gap already matches/overlaps a stored break row. */
function gapOverlapsStored(
  gap: { out: string; in: string },
  stored: { break_out: string | null; break_in: string | null }[],
): boolean {
  const gs = new Date(gap.out).getTime();
  const ge = new Date(gap.in).getTime();
  return stored.some((b) => {
    if (!b.break_out) return false;
    const bs = new Date(b.break_out).getTime();
    const be = b.break_in ? new Date(b.break_in).getTime() : bs;
    return bs < ge && be > gs;
  });
}

type GapDismissal = { attendance_day_id: string; gap_out: string; gap_in: string };

/** true when HR already dismissed this auto-derived gap (tolerance ±90s). */
function gapIsDismissed(
  gap: { out: string; in: string },
  dayId: string,
  dismissals: GapDismissal[],
): boolean {
  const gs = new Date(gap.out).getTime();
  const ge = new Date(gap.in).getTime();
  return dismissals.some(
    (d) =>
      d.attendance_day_id === dayId &&
      Math.abs(new Date(d.gap_out).getTime() - gs) <= 90000 &&
      Math.abs(new Date(d.gap_in).getTime() - ge) <= 90000,
  );
}

const AR_WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function fmtWeekday(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  // parse as local date (YYYY-MM-DD) to avoid TZ shift
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const dt = new Date(y, m - 1, d);
  return AR_WEEKDAYS[dt.getDay()] || "—";
}

function monthBounds(year: number, month1to12: number) {
  const from = `${year}-${pad2(month1to12)}-01`;
  const lastDay = new Date(year, month1to12, 0).getDate();
  const to = `${year}-${pad2(month1to12)}-${pad2(lastDay)}`;
  return { from, to };
}

const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  late: "bg-amber-100 text-amber-700 border-amber-200",
  incomplete: "bg-orange-100 text-orange-700 border-orange-200",
  absent: "bg-red-100 text-red-700 border-red-200",
  leave: "bg-sky-100 text-sky-700 border-sky-200",
  holiday: "bg-violet-100 text-violet-700 border-violet-200",
  no_record: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<string, string> = {
  present: "حاضر", late: "متأخر", incomplete: "بصمة ناقصة",
  absent: "غائب", leave: "إجازة", holiday: "عطلة",
  no_record: "بدون بصمات",
};

export default function MonthlyAttendanceTab({
  employees,
  initialView = "summary",
  hideViewToggle = false,
}: { employees: EmployeeLite[]; initialView?: ViewMode; hideViewToggle?: boolean }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const now = new Date();
  const initialYear = Number(searchParams.get("year")) || now.getFullYear();
  const initialMonth = Number(searchParams.get("month")) || (now.getMonth() + 1);
  const initialEmployee = searchParams.get("employee") || "all";
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(initialMonth);
  const [employeeId, setEmployeeId] = useState<string>(initialEmployee);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [breaksFilter, setBreaksFilter] = useState<BreaksFilter>("any");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [leaveByEmp, setLeaveByEmp] = useState<Record<string, LeaveBucket>>({});
  /** أيام الإجازة المرضية المستهلكة من بداية السنة وحتى ما قبل الشهر المعروض
   *  (تُستخدم لتطبيق قاعدة نصف الأجر بعد أول 14 يوم بالسنة). */
  const [priorSickByEmp, setPriorSickByEmp] = useState<Record<string, number>>({});
  const [summarySearch, setSummarySearch] = useState("");
  /** الرقم الوظيفي ومعدل الساعة من تعريف الموظف. */
  const [empMeta, setEmpMeta] = useState<Record<string, {
    number: string; rate: number; active: boolean; branchName: string; departmentName: string;
  }>>({});
  const [rateEdit, setRateEdit] = useState<{ id: string; name: string; value: string } | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("employeeNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const setSort = useCallback((k: SortKey) => {
    setSortKey((prev) => {
      if (prev === k) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return prev; }
      setSortDir("asc");
      return k;
    });
  }, []);

  // Edit dialog
  const [editing, setEditing] = useState<MonthRow | null>(null);
  const [form, setForm] = useState({ first_check_in: "", last_check_out: "", status: "present", notes: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [breaks, setBreaks] = useState<BreakDraft[]>([]);
  const [breaksLoading, setBreaksLoading] = useState(false);
  // Raw punches (attendance_events) for the day being edited — read-only,
  // shown so the accountant can see WHY the auto-total is off (double
  // punches, missing check-out, wrong branch) before adjusting manually.
  const [rawEvents, setRawEvents] = useState<{ id: string; event_type: string; event_time: string; branch_id: string | null; status: string | null; notes: string | null }[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { from, to } = monthBounds(year, month);
      // 🚀 Kick off the (independent) leaves query immediately so it runs in
      //    parallel with the attendance queries instead of after them.
      const leavesPromise = fetchAllRows<any>((f, t) => {
        let lq = supabase
          .from("employee_leaves")
          .select("id, employee_id, leave_type, start_date, end_date, status, employees!inner(full_name)")
          .eq("status", "approved")
          .lte("start_date", to)
          .gte("end_date", from)
          .order("id", { ascending: true })
          .range(f, t);
        if (employeeId !== "all") lq = lq.eq("employee_id", employeeId);
        return lq;
      });
      // 🩺 أيام المرضية المستهلكة سابقاً من نفس السنة (قبل بداية الشهر) —
      //    لازمة لتحديد أي أيام هذا الشهر تقع فوق سقف الـ14 يوم (نصف أجر).
      const yearStart = `${year}-01-01`;
      const priorEnd = from;   // نحسب حتى ما قبل أول الشهر
      const priorSickPromise = from <= yearStart
        ? Promise.resolve([] as any[])
        : fetchAllRows<any>((f, t) => {
            let pq = supabase
              .from("employee_leaves")
              .select("employee_id, leave_type, start_date, end_date, status")
              .eq("status", "approved")
              .eq("leave_type", "مرضية")
              .lt("start_date", priorEnd)
              .gte("end_date", yearStart)
              .order("id", { ascending: true })
              .range(f, t);
            if (employeeId !== "all") pq = pq.eq("employee_id", employeeId);
            return pq;
          });
      const data = await fetchAllRows<any>((f, t) => {
        let q = supabase
          .from("attendance_days")
          .select("id, employee_id, attendance_date, first_check_in, last_check_out, total_hours, overtime_hours, net_work_minutes, status, notes, is_manually_adjusted, employees!inner(full_name)")
          .gte("attendance_date", from)
          .lte("attendance_date", to)
          .order("attendance_date", { ascending: false })
          .order("first_check_in", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(f, t);
        if (employeeId !== "all") q = q.eq("employee_id", employeeId);
        return q;
      });
      const days = (data || []) as MonthRow[];
      // The payroll summary only needs attendance_days totals (already net of
      // breaks) and approved leaves. Raw punches, branches and derived gaps are
      // daily-audit details and used to block the whole summary unnecessarily.
      // Load those larger datasets only when the user opens the daily view.
      const dayIds = days.map((d) => d.id);
      if (viewMode === "daily" && dayIds.length > 0) {
        const empIds = Array.from(new Set(days.map((d) => d.employee_id)));
        const dates = days.map((d) => d.attendance_date).sort();
        const rangeFrom = `${dates[0]}T00:00:00`;
        const lastDay = new Date(dates[dates.length - 1] + "T00:00:00");
        lastDay.setDate(lastDay.getDate() + 2);
        // 🚀 All three secondary datasets (breaks / punches / dismissals) are
        //    independent → fetch every chunk of all three concurrently.
        const [bksChunks, evsChunks, disChunks] = await Promise.all([
          Promise.all(
            chunk(dayIds, 300).map((ids) =>
              fetchAllRows<any>((f, t) =>
                supabase
                  .from("attendance_breaks")
                  .select("attendance_day_id, break_type, break_out, break_in")
                  .in("attendance_day_id", ids)
                  .order("attendance_day_id", { ascending: true })
                  .range(f, t),
              ),
            ),
          ),
          Promise.all(
            chunk(empIds, 60).map((ids) =>
              fetchAllRows<any>((f, t) =>
                supabase
                  .from("attendance_events")
                  .select("employee_id, event_type, event_time, branch_id, status")
                  .in("employee_id", ids)
                  .gte("event_time", rangeFrom)
                  .lt("event_time", lastDay.toISOString())
                  .order("event_time", { ascending: true })
                  .range(f, t),
              ),
            ),
          ),
          Promise.all(
            chunk(dayIds, 300).map((ids) =>
              fetchAllRows<any>((f, t) =>
                supabase
                  .from("attendance_derived_gap_dismissals")
                  .select("attendance_day_id, gap_out, gap_in")
                  .in("attendance_day_id", ids)
                  .order("attendance_day_id", { ascending: true })
                  .range(f, t),
              ),
            ),
          ),
        ]);
        const bks: any[] = bksChunks.flat();
        const evs: any[] = evsChunks.flat();
        const dis: any[] = disChunks.flat();
        const byDay: Record<string, BreakSummary[]> = {};
        ((bks as any[]) || []).forEach((b) => {
          const min =
            b.break_out && b.break_in
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date(b.break_in).getTime() -
                      new Date(b.break_out).getTime()) /
                      60000,
                  ),
                )
              : 0;
          (byDay[b.attendance_day_id] ||= []).push({
            break_type: (b.break_type as BreakDraft["break_type"]) || "other",
            break_out: b.break_out,
            break_in: b.break_in,
            minutes: min,
          });
        });
        days.forEach((d) => { d.breaks = byDay[d.id] || []; });

        // Raw punches tell us WHICH branch each day was stamped from (a day can
        // span multiple branches). Grouped by employee_id + date.
        const branchIds = Array.from(
          new Set(((evs as any[]) || []).map((e) => e.branch_id).filter(Boolean)),
        ) as string[];
        const bMap: Record<string, string> = {};
        if (branchIds.length > 0) {
          const { data: bs } = await supabase
            .from("branches")
            .select("id, name")
            .in("id", branchIds);
          (bs || []).forEach((b: any) => { bMap[b.id] = b.name; });
        }
        // Group by employee_id|YYYY-MM-DD → branch counts
        const byKey: Record<string, Record<string, number>> = {};
        ((evs as any[]) || []).forEach((e) => {
          if (!e.branch_id) return;
          const d = new Date(e.event_time);
          const key = `${e.employee_id}|${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          (byKey[key] ||= {});
          byKey[key][e.branch_id] = (byKey[key][e.branch_id] || 0) + 1;
        });
        days.forEach((d) => {
          const key = `${d.employee_id}|${d.attendance_date}`;
          const counts = byKey[key] || {};
          d.branchList = Object.entries(counts)
            .map(([id, count]) => ({ id, name: bMap[id] || "—", count }))
            .sort((a, b) => b.count - a.count);
        });

        // 🕒 Derive "مغادرات" automatically from the raw punches (check_out →
        //    next check_in on the same day) so the column reflects reality even
        //    when no attendance_breaks row was recorded.
        //    Punches are indexed per EMPLOYEE (not per calendar date) because an
        //    overnight shift ends on the next calendar day; the real session
        //    window (first_check_in → last_check_out) does the slicing.
        const punchesByEmp: Record<string, RawPunch[]> = {};
        ((evs as any[]) || []).forEach((e) => {
          (punchesByEmp[e.employee_id] ||= []).push(e as RawPunch);
        });
        // Gaps that HR explicitly removed must never come back.
        const dismissed = ((dis as any[]) || []) as GapDismissal[];
        days.forEach((d) => {
          if (!d.first_check_in || !d.last_check_out) return; // open day → no reliable window
          const gaps = deriveGapsFromPunches(punchesByEmp[d.employee_id] || [], {
            start: d.first_check_in,
            end: d.last_check_out,
          });
          const stored = d.breaks || [];
          const extra: BreakSummary[] = gaps
            .filter((g) => !gapOverlapsStored(g, stored))
            .filter((g) => !gapIsDismissed(g, d.id, dismissed))
            .map((g) => ({
              break_type: "other" as const,
              break_out: g.out,
              break_in: g.in,
              minutes: g.minutes,
              derived: true,
            }));
          if (extra.length) d.breaks = [...stored, ...extra];
        });
      }

      // 🌴 Merge approved leaves into the table as synthetic rows so HR can
      //    see that a day is officially "إجازة" even when there are no
      //    attendance punches. One synthetic row per (employee, date) that
      //    doesn't already have an attendance_days row.
      const leavesData = await leavesPromise;
      const existingKeys = new Set(days.map((d) => `${d.employee_id}|${d.attendance_date}`));
      const synthetic: MonthRow[] = [];
      const leaveTally: Record<string, LeaveBucket> = {};
      ((leavesData as any[]) || []).forEach((lv) => {
        const s = lv.start_date < from ? from : lv.start_date;
        const e = lv.end_date > to ? to : lv.end_date;
        // Iterate day-by-day (string arithmetic on YYYY-MM-DD is safe here).
        const [sy, sm, sd] = s.split("-").map(Number);
        const [ey, em, ed] = e.split("-").map(Number);
        const start = new Date(sy, sm - 1, sd);
        const stop = new Date(ey, em - 1, ed);
        for (let dt = new Date(start); dt <= stop; dt.setDate(dt.getDate() + 1)) {
          const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
          const key = `${lv.employee_id}|${iso}`;
          // Count the leave day for the monthly summary even when an
          // attendance_days row already exists for that date.
          const bucket = (leaveTally[lv.employee_id] ||= { annual: 0, sick: 0, other: 0 });
          if (lv.leave_type === "سنوية") bucket.annual += 1;
          else if (lv.leave_type === "مرضية") bucket.sick += 1;
          else bucket.other += 1;
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          synthetic.push({
            id: `leave-${lv.id}-${iso}`,
            employee_id: lv.employee_id,
            attendance_date: iso,
            first_check_in: null,
            last_check_out: null,
            total_hours: 0,
            overtime_hours: 0,
            net_work_minutes: 0,
            status: "leave",
            notes: lv.leave_type ? `إجازة (${lv.leave_type})` : "إجازة",
            is_manually_adjusted: false,
            employees: { full_name: lv.employees?.full_name || "—" },
            breaks: [],
            branchList: [],
            leaveInfo: { leave_id: lv.id, leave_type: lv.leave_type },
          });
        }
      });
      setLeaveByEmp(leaveTally);
      // احتساب أيام المرضية السابقة داخل نفس السنة (قبل أول الشهر المعروض)
      const priorTally: Record<string, number> = {};
      ((await priorSickPromise) as any[] || []).forEach((lv) => {
        const s = lv.start_date < yearStart ? yearStart : lv.start_date;
        const rawEnd = lv.end_date < priorEnd ? lv.end_date : priorEnd;
        if (rawEnd < s) return;
        const [sy, sm, sd] = s.split("-").map(Number);
        const [ey, em, ed] = rawEnd.split("-").map(Number);
        for (let dt = new Date(sy, sm - 1, sd); dt < new Date(ey, em - 1, ed + 1); dt.setDate(dt.getDate() + 1)) {
          const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
          if (iso >= priorEnd) break; // لا نحسب أيام الشهر الحالي هنا
          priorTally[lv.employee_id] = (priorTally[lv.employee_id] || 0) + 1;
        }
      });
      setPriorSickByEmp(priorTally);
      // 📅 تسلسل التاريخ في العرض اليومي: الأيام التي لا يوجد فيها أي بصمة
      //    ولا إجازة تظهر كصف صفري حتى لا تنقطع سلسلة الأيام أمام الموارد
      //    البشرية. يُطبَّق فقط عند اختيار موظف محدد (وإلا انفجر عدد الصفوف).
      const zeroDays: MonthRow[] = [];
      if (viewMode === "daily" && employeeId !== "all") {
        const empName =
          days[0]?.employees?.full_name ||
          synthetic[0]?.employees?.full_name ||
          employees.find((e) => e.id === employeeId)?.full_name ||
          "—";
        const todayIso = (() => {
          const n = new Date();
          return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
        })();
        const stop = to > todayIso ? todayIso : to;
        const [fy, fm, fd] = from.split("-").map(Number);
        const [ty, tm, td] = stop.split("-").map(Number);
        for (
          let dt = new Date(fy, fm - 1, fd);
          dt <= new Date(ty, tm - 1, td);
          dt.setDate(dt.getDate() + 1)
        ) {
          const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
          const key = `${employeeId}|${iso}`;
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          zeroDays.push({
            id: `empty-${employeeId}-${iso}`,
            employee_id: employeeId,
            attendance_date: iso,
            first_check_in: null,
            last_check_out: null,
            total_hours: 0,
            overtime_hours: 0,
            net_work_minutes: 0,
            status: "no_record",
            notes: null,
            is_manually_adjusted: false,
            employees: { full_name: empName },
            breaks: [],
            branchList: [],
            isEmptyDay: true,
          });
        }
      }
      const merged = [...days, ...synthetic, ...zeroDays].sort((a, b) =>
        a.attendance_date < b.attendance_date ? 1 : a.attendance_date > b.attendance_date ? -1 : 0,
      );
      setRows(merged);
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ في التحميل", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, year, month, employeeId, viewMode]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === "missing_checkout") return r.first_check_in && !r.last_check_out;
      if (filter === "missing_checkin") return !r.first_check_in && r.status !== "absent" && !r.isEmptyDay;
      if (filter === "late") return r.status === "late";
      if (filter === "absent") return r.status === "absent";
      if (filter === "present") return r.status === "present";
      return true;
    });
  }, [rows, filter]).filter((r) => {
    const bks = r.breaks || [];
    if (breaksFilter === "with") return bks.length > 0;
    if (breaksFilter === "without")
      return bks.length === 0 && !!r.first_check_in && r.status !== "absent";
    if (breaksFilter === "prayer")
      return bks.some((b) => b.break_type === "prayer");
    if (breaksFilter === "no_prayer")
      return !bks.some((b) => b.break_type === "prayer") &&
        !!r.first_check_in &&
        r.status !== "absent";
    return true;
  });

  const counts = useMemo(() => ({
    total: rows.length,
    missing_checkout: rows.filter(r => r.first_check_in && !r.last_check_out).length,
    missing_checkin: rows.filter(r => !r.first_check_in && r.status !== "absent" && !r.isEmptyDay).length,
    late: rows.filter(r => r.status === "late").length,
    absent: rows.filter(r => r.status === "absent").length,
    present: rows.filter(r => r.status === "present").length,
    with_breaks: rows.filter(r => (r.breaks?.length || 0) > 0).length,
    without_breaks: rows.filter(r => (r.breaks?.length || 0) === 0 && !!r.first_check_in && r.status !== "absent").length,
    prayer: rows.filter(r => (r.breaks || []).some(b => b.break_type === "prayer")).length,
    no_prayer: rows.filter(r => !(r.breaks || []).some(b => b.break_type === "prayer") && !!r.first_check_in && r.status !== "absent").length,
  }), [rows]);

  /** ── Monthly aggregation (payroll source of truth) ──────────────────────
   *  One row per employee for the selected month:
   *  • أيام الدوام  = days with a real check-in (or recorded hours), excluding
   *    leave-only rows so a leave day is never double-counted as work.
   *  • الساعات/الإضافي = sums of attendance_days totals (post-break net).
   *  • الإجازات = approved leave days that fall inside the selected month. */
  const summary = useMemo<MonthSummary[]>(() => {
    const byEmp: Record<string, MonthSummary> = {};
    const ensure = (id: string, name: string) =>
      (byEmp[id] ||= {
        employee_id: id, name,
        employeeNumber: empMeta[id]?.number || "—",
        hourlyRate: Number(empMeta[id]?.rate) || 0,
        workDays: 0, hours: 0, overtime: 0, lateDays: 0, absentDays: 0,
        missingPunchDays: 0, breaksMin: 0, annualLeave: 0, sickLeave: 0, otherLeave: 0,
      });

    // seed كل الموظفين (حتى الصفريين بدون بصمات) ليظهروا للتدقيق
    // مع استثناء الحسابات الوهمية (شركات/كولسنتر) لأنها ليست موظفين فعليين
    employees
      .filter((e) => employeeId === "all" || e.id === employeeId)
      .filter((e) => !isPseudoEmployee(e.full_name))
      .forEach((e) => ensure(e.id, e.full_name));

    rows.forEach((r) => {
      const s = ensure(r.employee_id, r.employees?.full_name || "—");
      if (r.leaveInfo) return; // leave-only synthetic row → counted from leaveByEmp
      const worked = !!r.first_check_in || (Number(r.total_hours) || 0) > 0;
      if (worked) s.workDays += 1;
      s.hours += rowWorkMinutes(r) / 60;
      s.overtime += Number(r.overtime_hours) || 0;
      if (r.status === "late") s.lateDays += 1;
      if (r.status === "absent") s.absentDays += 1;
      if ((!r.first_check_in && r.status !== "absent") || (r.first_check_in && !r.last_check_out)) {
        s.missingPunchDays += 1;
      }
      s.breaksMin += (r.breaks || []).reduce((a, b) => a + (b.minutes || 0), 0);
    });

    Object.entries(leaveByEmp).forEach(([id, b]) => {
      const emp = employees.find((e) => e.id === id);
      const s = ensure(id, emp?.full_name || byEmp[id]?.name || "—");
      s.annualLeave = b.annual;
      s.sickLeave = b.sick;
      s.otherLeave = b.other;
    });

    return Object.values(byEmp).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows, leaveByEmp, employees, empMeta, employeeId]);

  /** صفوف الملخص بعد اشتقاق أعمدة الرواتب (ساعات عادية / إضافي بالنسبة / إجمالي). */
  type SummaryRow = MonthSummary & {
    regular: number;
    overtimeWeighted: number;
    annualHours: number;
    sickHours: number;
    sickFullDays: number;
    sickHalfDays: number;
    totalHours: number;
    amount: number;
    branchName: string;
    departmentName: string;
  };
  const derivedSummary = useMemo<SummaryRow[]>(() =>
    summary
      // إخفاء الموظفين المنتهية خدمتهم/الموقوفين من كشف الحضور الشهري
      // (لا نُخفي شيئاً قبل تحميل بيانات الموظفين تفادياً لجدول فارغ)
      .filter((r) => empMeta[r.employee_id] ? empMeta[r.employee_id].active : true)
      .map((r) => {
      // total_hours في قاعدة البيانات يشمل الإضافي → الساعات العادية = الإجمالي − الإضافي
      const regular = Math.max(0, (r.hours || 0) - (r.overtime || 0));
      const overtimeWeighted = (r.overtime || 0) * OVERTIME_MULTIPLIER;
      const annualHours = (r.annualLeave || 0) * STANDARD_DAY_HOURS;
      // ⚖️ قانون العمل: أول 14 يوم مرضي بالسنة بأجر كامل، وما زاد عنها بنصف أجر.
      const sickSplit = splitSickPayDays(priorSickByEmp[r.employee_id] || 0, r.sickLeave || 0);
      const sickHours = sickSplit.paidEquivalentDays * STANDARD_DAY_HOURS;
      const totalHours = regular + overtimeWeighted + annualHours + sickHours;
      return {
        ...r,
        employeeNumber: empMeta[r.employee_id]?.number || r.employeeNumber || "—",
        hourlyRate: Number(empMeta[r.employee_id]?.rate ?? r.hourlyRate) || 0,
        branchName: empMeta[r.employee_id]?.branchName || "—",
        departmentName: empMeta[r.employee_id]?.departmentName || "—",
        regular, overtimeWeighted, annualHours, sickHours,
        sickFullDays: sickSplit.fullDays,
        sickHalfDays: sickSplit.halfDays,
        totalHours,
        amount: totalHours * (Number(empMeta[r.employee_id]?.rate ?? r.hourlyRate) || 0),
      };
    }), [summary, empMeta, priorSickByEmp]);

  const filteredSummary = useMemo(() => {
    const s = summarySearch.trim().toLowerCase();
    const base = !s
      ? derivedSummary
      : derivedSummary.filter((r) =>
          r.name.toLowerCase().includes(s) || String(r.employeeNumber).toLowerCase().includes(s) ||
          (r.branchName || "").toLowerCase().includes(s) || (r.departmentName || "").toLowerCase().includes(s));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av: any = (a as any)[sortKey];
      const bv: any = (b as any)[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "ar", { numeric: true }) * dir;
    });
  }, [derivedSummary, summarySearch, sortKey, sortDir]);

  const summaryTotals = useMemo(() => filteredSummary.reduce((acc, r) => ({
    workDays: acc.workDays + r.workDays,
    hours: acc.hours + r.hours,
    overtime: acc.overtime + r.overtime,
    lateDays: acc.lateDays + r.lateDays,
    absentDays: acc.absentDays + r.absentDays,
    missingPunchDays: acc.missingPunchDays + r.missingPunchDays,
    breaksMin: acc.breaksMin + r.breaksMin,
    annualLeave: acc.annualLeave + r.annualLeave,
    sickLeave: acc.sickLeave + r.sickLeave,
    regular: acc.regular + r.regular,
    overtimeWeighted: acc.overtimeWeighted + r.overtimeWeighted,
    annualHours: acc.annualHours + r.annualHours,
    sickHours: acc.sickHours + r.sickHours,
    totalHours: acc.totalHours + r.totalHours,
    amount: acc.amount + r.amount,
  }), {
    workDays: 0, hours: 0, overtime: 0, lateDays: 0, absentDays: 0, missingPunchDays: 0,
    breaksMin: 0, annualLeave: 0, sickLeave: 0, regular: 0, overtimeWeighted: 0,
    annualHours: 0, sickHours: 0, totalHours: 0, amount: 0,
  }), [filteredSummary]);

  // الرقم الوظيفي ومعدل الساعة (من تعريف الموظف)
  const loadEmpMeta = useCallback(async () => {
    const ids = employees.map((e) => e.id);
    if (!ids.length) return;
    const out: Record<string, { number: string; rate: number; active: boolean; branchName: string; departmentName: string }> = {};
    const { data: brs } = await supabase.from("branches").select("id, name");
    const brMap: Record<string, string> = {};
    (brs || []).forEach((b: any) => { brMap[b.id] = b.name; });
    const { data: deps } = await supabase.from("departments").select("id, name");
    const depMap: Record<string, string> = {};
    (deps || []).forEach((d: any) => { depMap[d.id] = d.name; });
    for (const part of chunk(ids, 200)) {
      const { data } = await supabase
        .from("employees")
        .select("id, employee_number, hourly_rate, is_active, is_terminated, job_title, position, branch_id, department, department_id")
        .in("id", part);
      (data || []).forEach((e: any) => {
        out[e.id] = {
          number: e.employee_number || "—",
          rate: Number(e.hourly_rate) || 0,
          active: e.is_active !== false && e.is_terminated !== true,
          branchName: (e.branch_id && brMap[e.branch_id]) || "—",
          departmentName: e.department || (e.department_id && depMap[e.department_id]) || "—",
        };
      });
    }
    setEmpMeta(out);
  }, [employees]);

  /** 📊 تصدير Excel — يصدّر الملخص الشهري أو التفصيل اليومي حسب العرض الحالي. */
  const exportExcel = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const monthLabel = `${year}-${pad2(month)}`;
      let sheetRows: any[] = [];
      let sheetName = "الملخص الشهري";
      if (viewMode === "summary") {
        sheetRows = filteredSummary.map((r) => ({
          "الرقم الوظيفي": r.employeeNumber,
          "الموظف": r.name,
          "الفرع": r.branchName,
          "القسم": r.departmentName,
          "أيام الدوام": r.workDays,
          "إجمالي الساعات": Number(r.regular.toFixed(2)),
          "ساعات إضافية": Number(r.overtime.toFixed(2)),
          "الإضافي مع النسبة": Number(r.overtimeWeighted.toFixed(2)),
          "أيام غياب": r.absentDays,
          "إجازة سنوية (ساعة)": Number(r.annualHours.toFixed(2)),
          "إجازة مرضية (ساعة)": Number(r.sickHours.toFixed(2)),
          "مجموع الساعات": Number(r.totalHours.toFixed(2)),
          "معدل الساعة": Number((r.hourlyRate || 0).toFixed(2)),
          "راتب البصمة (المبلغ)": Number(r.amount.toFixed(2)),
        }));
        sheetRows.push({
          "الرقم الوظيفي": "",
          "الموظف": "الإجمالي",
          "الفرع": "",
          "القسم": "",
          "أيام الدوام": summaryTotals.workDays,
          "إجمالي الساعات": Number(summaryTotals.regular.toFixed(2)),
          "ساعات إضافية": Number(summaryTotals.overtime.toFixed(2)),
          "الإضافي مع النسبة": Number(summaryTotals.overtimeWeighted.toFixed(2)),
          "أيام غياب": summaryTotals.absentDays,
          "إجازة سنوية (ساعة)": Number(summaryTotals.annualHours.toFixed(2)),
          "إجازة مرضية (ساعة)": Number(summaryTotals.sickHours.toFixed(2)),
          "مجموع الساعات": Number(summaryTotals.totalHours.toFixed(2)),
          "معدل الساعة": "",
          "راتب البصمة (المبلغ)": Number(summaryTotals.amount.toFixed(2)),
        });
      } else {
        sheetName = "تفصيل يومي";
        sheetRows = filtered.map((r) => ({
          "التاريخ": r.attendance_date,
          "اليوم": fmtWeekday(r.attendance_date),
          "الموظف": r.employees?.full_name || "—",
          "الحضور": r.first_check_in ? format(new Date(r.first_check_in), "HH:mm") : "—",
          "الانصراف": r.last_check_out ? format(new Date(r.last_check_out), "HH:mm") : "—",
          "ساعات العمل": Number((rowWorkMinutes(r) / 60).toFixed(2)),
          "إضافي": Number((Number(r.overtime_hours) || 0).toFixed(2)),
          "المغادرات (دقيقة)": (r.breaks || []).reduce((a, b) => a + (b.minutes || 0), 0),
          "الفرع": (r.branchList || []).map((b) => b.name).join(" / ") || "—",
          "الحالة": STATUS_LABEL[r.status || ""] || r.status || "—",
          "ملاحظات": r.notes || "",
        }));
      }
      if (!sheetRows.length) {
        toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" });
        return;
      }
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws["!cols"] = Object.keys(sheetRows[0]).map(() => ({ wch: 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `الحضور_${sheetName}_${monthLabel}.xlsx`);
      toast({ title: "تم تصدير ملف Excel" });
    } catch (e: any) {
      toast({ title: "تعذّر التصدير", description: e?.message, variant: "destructive" });
    }
  }, [viewMode, filteredSummary, summaryTotals, filtered, year, month]);

  useEffect(() => { loadEmpMeta(); }, [loadEmpMeta]);

  const saveHourlyRate = async () => {
    if (!rateEdit) return;
    const val = Number(rateEdit.value);
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "قيمة غير صحيحة", variant: "destructive" });
      return;
    }
    setSavingRate(true);
    try {
      const { error } = await supabase.from("employees").update({ hourly_rate: val }).eq("id", rateEdit.id);
      if (error) throw error;
      setEmpMeta((m) => ({
        ...m,
        [rateEdit.id]: {
          number: m[rateEdit.id]?.number || "—",
          rate: val,
          active: m[rateEdit.id]?.active ?? true,
          branchName: m[rateEdit.id]?.branchName || "—",
          departmentName: m[rateEdit.id]?.departmentName || "—",
        },
      }));
      toast({ title: "تم تحديث معدل الساعة" });
      setRateEdit(null);
    } catch (e: any) {
      toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSavingRate(false);
    }
  };

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];

  const openEdit = (r: MonthRow) => {
    setEditing(r);
    setForm({
      first_check_in: r.first_check_in ? format(new Date(r.first_check_in), "HH:mm") : "",
      last_check_out: r.last_check_out ? format(new Date(r.last_check_out), "HH:mm") : "",
      status: r.status || "present",
      notes: r.notes || "",
      reason: "",
    });
    setBreaks([]);
    setBreaksLoading(true);
    setRawEvents([]);
    setRawLoading(true);
    // Load raw punches for the day ONLY (same calendar day — لا نظهر بصمات
    // اليوم التالي حتى لا يظهر مثلاً دخول الأحد ضمن يوم السبت).
    (async () => {
      try {
        const dayStart = `${r.attendance_date}T00:00:00`;
        const next = new Date(r.attendance_date + "T00:00:00");
        next.setDate(next.getDate() + 1);
        const { data } = await supabase
          .from("attendance_events")
          .select("id, event_type, event_time, branch_id, status, notes")
          .eq("employee_id", r.employee_id)
          .gte("event_time", dayStart)
          .lt("event_time", next.toISOString())
          .order("event_time", { ascending: true });
        const evs = (data as any[]) || [];
        setRawEvents(evs);
        // Auto-derived gaps that HR already dismissed for this day.
        const { data: dis } = await supabase
          .from("attendance_derived_gap_dismissals")
          .select("attendance_day_id, gap_out, gap_in")
          .eq("attendance_day_id", r.id);
        const dismissed = ((dis as any[]) || []) as GapDismissal[];
        // Suggest sessions derived from the punches for any gap that has no
        // stored attendance_breaks row yet (unsaved drafts — HR just saves).
        const gaps = deriveGapsFromPunches(evs as RawPunch[]).filter(
          (g) => !gapIsDismissed(g, r.id, dismissed),
        );
        if (gaps.length) {
          setBreaks((prev) => {
            const stored = prev.map((b) => ({
              break_out: b.out ? `${r.attendance_date}T${b.out}:00` : null,
              break_in: b.in ? `${r.attendance_date}T${b.in}:00` : null,
            }));
            const extra: BreakDraft[] = gaps
              .filter((g) => !gapOverlapsStored(g, stored))
              .map((g) => ({
                id: null,
                break_type: "other" as const,
                out: format(new Date(g.out), "HH:mm"),
                in: format(new Date(g.in), "HH:mm"),
                reason: "محسوبة تلقائياً من البصمات",
                _derived: true,
              }));
            return extra.length ? [...prev, ...extra] : prev;
          });
        }
        const branchIds = Array.from(new Set(evs.map((e) => e.branch_id).filter(Boolean))) as string[];
        if (branchIds.length) {
          const { data: bs } = await supabase
            .from("branches")
            .select("id, name")
            .in("id", branchIds);
          const map: Record<string, string> = {};
          (bs || []).forEach((b: any) => { map[b.id] = b.name; });
          setBranchNames(map);
        } else {
          setBranchNames({});
        }
      } finally {
        setRawLoading(false);
      }
    })();
    supabase
      .from("attendance_breaks")
      .select("id, break_type, break_out, break_in, reason")
      .eq("attendance_day_id", r.id)
      .order("break_out", { ascending: true })
      .then(({ data }) => {
        const rows = (data as any[]) || [];
        const stored: BreakDraft[] = rows.map((b) => ({
          id: b.id,
          break_type: (b.break_type as BreakDraft["break_type"]) || "other",
          out: b.break_out ? format(new Date(b.break_out), "HH:mm") : "",
          in: b.break_in ? format(new Date(b.break_in), "HH:mm") : "",
          reason: b.reason || "",
        }));
        const storedRanges = rows.map((b) => ({ break_out: b.break_out, break_in: b.break_in }));
        // Keep auto-derived drafts (id === null) that don't overlap a stored row.
        setBreaks((prev) => {
          const drafts = prev
            .filter((d) => !d.id && d.out && d.in)
            .filter((d) =>
              !gapOverlapsStored(
                { out: `${r.attendance_date}T${d.out}:00`, in: `${r.attendance_date}T${d.in}:00` },
                storedRanges,
              ),
            );
          return [...stored, ...drafts];
        });
        setBreaksLoading(false);
      });
  };

  /** Combine an attendance_date (YYYY-MM-DD) with HH:mm into a Date.
   *  Overnight-shift aware: when `anchor` is provided and the resulting time
   *  falls before it, roll forward one calendar day so a 04:49 PM check-in
   *  + 01:04 AM check-out is treated as ~8h15m (not a negative span). */
  const combineDT = useCallback((dateStr: string, hhmm: string, anchor?: Date | null): Date | null => {
    if (!hhmm) return null;
    const [y, mo, d] = dateStr.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    if (!y || !mo || !d) return null;
    const dt = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
    if (anchor && dt.getTime() < anchor.getTime()) {
      dt.setDate(dt.getDate() + 1);
    }
    return dt;
  }, []);

  /** Live totals for the dialog: gross span − sum(closed sessions). */
  const liveTotals = useMemo(() => {
    if (!editing) return { gross: 0, breakMin: 0, net: 0 };
    const ci = combineDT(editing.attendance_date, form.first_check_in);
    const co = combineDT(editing.attendance_date, form.last_check_out, ci);
    let gross = 0;
    if (ci && co && co.getTime() > ci.getTime()) {
      gross = roundSecondsToMinutes(co.getTime() - ci.getTime());
    }
    let breakMin = 0;
    for (const b of breaks) {
      if (b._deleted) continue;
      const bo = combineDT(editing.attendance_date, b.out, ci);
      const bi = combineDT(editing.attendance_date, b.in, bo || ci);
      if (bo && bi && bi.getTime() > bo.getTime()) {
        breakMin += roundSecondsToMinutes(bi.getTime() - bo.getTime());
      }
    }
    return { gross, breakMin, net: Math.max(0, gross - breakMin) };
  }, [editing, form.first_check_in, form.last_check_out, breaks, combineDT]);

  const fmtHM = (min: number) => `${Math.floor(min / 60)} س ${min % 60} د`;

  /** Sessions-based total from the raw punches (matches the value stored in
   *  attendance_days.total_hours). Shown next to the "span" and "net" so HR
   *  can see WHY the row's hours differ from a naive last−first calculation
   *  (multi-session days, missed check-outs, etc). */
  const actualFromPunchesMin = useMemo(() => {
    if (!rawEvents || rawEvents.length === 0) return 0;
    const sorted = [...rawEvents].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime(),
    );
    let total = 0;
    let openIn: number | null = null;
    for (const e of sorted) {
      if (e.status && e.status !== "valid") continue;
      const t = new Date(e.event_time).getTime();
      if (e.event_type === "check_in") {
        openIn = t;
      } else if (e.event_type === "check_out" && openIn != null) {
        if (t > openIn) total += roundSecondsToMinutes(t - openIn);
        openIn = null;
      }
    }
    return total;
  }, [rawEvents]);

  const netDiffersFromPunches =
    actualFromPunchesMin > 0 && Math.abs(liveTotals.net - actualFromPunchesMin) >= 5;

  /** Validate that every session sits inside the day span and doesn't overlap another. */
  const validateBreaks = (): string | null => {
    if (!editing) return null;
    const ci = combineDT(editing.attendance_date, form.first_check_in);
    const co = combineDT(editing.attendance_date, form.last_check_out, ci);
    const rows = breaks
      .filter((b) => !b._deleted && (b.out || b.in))
      .map((b) => {
        const bo = combineDT(editing.attendance_date, b.out, ci);
        const bi = combineDT(editing.attendance_date, b.in, bo || ci);
        return { out: bo, in: bi, label: BREAK_TYPE_LABEL[b.break_type] };
      });
    for (const r of rows) {
      if (!r.out || !r.in) return `الجلسة "${r.label}": يجب تعبئة وقت الخروج والعودة معاً`;
      if (r.in.getTime() <= r.out.getTime()) return `الجلسة "${r.label}": وقت العودة يجب أن يكون بعد الخروج`;
      if (ci && r.out.getTime() < ci.getTime()) return `الجلسة "${r.label}": خارج نطاق يوم العمل (قبل الدخول)`;
      if (co && r.in.getTime() > co.getTime()) return `الجلسة "${r.label}": خارج نطاق يوم العمل (بعد الخروج)`;
    }
    const sorted = [...rows].sort((a, b) => (a.out!.getTime() - b.out!.getTime()));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].out!.getTime() < sorted[i - 1].in!.getTime()) {
        return "يوجد تداخل زمني بين الجلسات — راجع الأوقات";
      }
    }
    return null;
  };

  const saveEdit = async () => {
    if (!editing || !user) return;
    if (!form.reason.trim()) {
      toast({ title: "سبب التعديل إلزامي", variant: "destructive" });
      return;
    }
    const vErr = validateBreaks();
    if (vErr) {
      toast({ title: "خطأ في الجلسات", description: vErr, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ciDate = combineDT(editing.attendance_date, form.first_check_in);
      const coDate = combineDT(editing.attendance_date, form.last_check_out, ciDate);
      const ci = ciDate ? ciDate.toISOString() : null;
      const co = coDate ? coDate.toISOString() : null;
      // 1) Update the day header (times/status/notes) — totals will be
      //    recomputed by the DB trigger after breaks sync.
      const { error: dayErr } = await supabase.from("attendance_days").update({
        first_check_in: ci,
        last_check_out: co,
        status: form.status,
        notes: form.notes || null,
        is_manually_adjusted: true,
        updated_at: new Date().toISOString(),
      }).eq("id", editing.id);
      if (dayErr) throw dayErr;

      // 2) Sync breaks: delete removed, upsert current.
      const toDelete = breaks.filter((b) => b._deleted && b.id).map((b) => b.id as string);
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("attendance_breaks")
          .delete()
          .in("id", toDelete);
        if (delErr) throw delErr;
      }
      const active = breaks.filter((b) => !b._deleted);

      // 2.b) Auto-derived gaps the user removed → persist a dismissal so the
      //      punch-based suggestion never comes back for this day.
      const dismissedDrafts = breaks.filter((b) => b._deleted && !b.id && b._derived);
      if (dismissedDrafts.length > 0) {
        const rowsToInsert = dismissedDrafts
          .map((b) => {
            const boDate = combineDT(editing.attendance_date, b.out, ciDate);
            const biDate = combineDT(editing.attendance_date, b.in, boDate || ciDate);
            if (!boDate || !biDate) return null;
            return {
              attendance_day_id: editing.id,
              employee_id: editing.employee_id,
              gap_out: boDate.toISOString(),
              gap_in: biDate.toISOString(),
              reason: form.reason,
              dismissed_by: user.id,
            };
          })
          .filter(Boolean) as any[];
        if (rowsToInsert.length > 0) {
          const { error: disErr } = await supabase
            .from("attendance_derived_gap_dismissals")
            .insert(rowsToInsert);
          if (disErr) throw disErr;
        }
      }
      for (const b of active) {
        const boDate = combineDT(editing.attendance_date, b.out, ciDate);
        const biDate = combineDT(editing.attendance_date, b.in, boDate || ciDate);
        const bo = boDate ? boDate.toISOString() : null;
        const bi = biDate ? biDate.toISOString() : null;
        if (!bo || !bi) continue;
        if (b.id) {
          const { error: uErr } = await supabase
            .from("attendance_breaks")
            .update({
              break_type: b.break_type,
              break_out: bo,
              break_in: bi,
              reason: b.reason || BREAK_TYPE_LABEL[b.break_type],
            })
            .eq("id", b.id);
          if (uErr) throw uErr;
        } else {
          const { error: iErr } = await supabase.from("attendance_breaks").insert({
            attendance_day_id: editing.id,
            employee_id: editing.employee_id,
            auth_user_id: user.id,
            break_type: b.break_type,
            break_out: bo,
            break_in: bi,
            reason: b.reason || BREAK_TYPE_LABEL[b.break_type],
          } as any);
          if (iErr) throw iErr;
        }
      }

      // 3) Final safety net: explicitly recompute totals (the trigger already
      //    did this on each break write, but a header-only edit needs it too).
      await supabase.rpc("recompute_attendance_day_totals" as any, { p_day_id: editing.id } as any);

      await supabase.from("attendance_audit_logs").insert({
        table_name: "attendance_days",
        record_id: editing.id,
        action: "update",
        new_values: { ...form, sessions: breaks.filter(b => !b._deleted) } as any,
        changed_by: user.id,
        reason: form.reason,
      });
      toast({ title: "تم حفظ التعديل" });
      setEditing(null);
      fetchRows();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmtTime = (ts: string | null) => ts ? format(new Date(ts), "hh:mm a") : "—";

  return (
    <div className="space-y-3" dir="rtl">
      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">الموظف</label>
            <Popover open={empPickerOpen} onOpenChange={setEmpPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  <span className="truncate">
                    {employeeId === "all" ? "كل الموظفين" : (employees.find(e => e.id === employeeId)?.full_name || "كل الموظفين")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start" dir="rtl">
                <Command>
                  <CommandInput placeholder="ابحث باسم الموظف..." className="text-right" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>لا يوجد موظف مطابق</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="كل الموظفين" onSelect={() => { setEmployeeId("all"); setEmpPickerOpen(false); }}>
                        كل الموظفين
                      </CommandItem>
                      {employees.map(e => (
                        <CommandItem key={e.id} value={e.full_name} onSelect={() => { setEmployeeId(e.id); setEmpPickerOpen(false); }}>
                          {e.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="outline" size="sm" onClick={fetchRows} className="gap-1">
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
        </div>
      </Card>

      {/* View switch: monthly summary (payroll) vs day-by-day detail */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className={cn("inline-flex rounded-lg border bg-muted/40 p-0.5", hideViewToggle && "hidden")}>
          <button
            onClick={() => setViewMode("summary")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition",
              viewMode === "summary" ? "bg-[#0D1B2E] text-white" : "text-muted-foreground hover:bg-background")}
          >
            ملخص شهري (للرواتب)
          </button>
          <button
            onClick={() => setViewMode("daily")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition",
              viewMode === "daily" ? "bg-[#0D1B2E] text-white" : "text-muted-foreground hover:bg-background")}
          >
            تفصيل يومي
          </button>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {viewMode === "summary" && (
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                placeholder="بحث باسم الموظف..."
                className="h-8 pr-7 text-xs"
              />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs whitespace-nowrap"
            onClick={exportExcel}
            disabled={loading}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> تصدير Excel
          </Button>
        </div>
      </div>

      {viewMode === "summary" ? (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> جاري التحميل...
            </div>
          ) : filteredSummary.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">لا توجد بيانات لهذا الشهر</div>
          ) : (
            <div className="w-full max-w-full overflow-auto max-h-[70vh] [&>div]:overflow-visible [scrollbar-width:auto] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-muted/40">
              <table className="min-w-[1600px]" style={{ width: "max-content", borderCollapse: "collapse", direction: "rtl" }}>
                <TableHeader>
                  <TableRow className="bg-[#0D1B2E] hover:bg-[#0D1B2E]">
                    <SortHead label="الرقم الوظيفي" k="employeeNumber" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="الموظف" k="name" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="الفرع" k="branchName" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="القسم" k="departmentName" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="أيام الدوام" k="workDays" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="إجمالي الساعات" k="regular" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="ساعات إضافية" k="overtime" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="الإضافي مع النسبة" k="overtimeWeighted" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="أيام غياب" k="absentDays" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="إجازة سنوية (ساعة)" k="annualHours" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="إجازة مرضية (ساعة)" k="sickHours" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="مجموع الساعات" k="totalHours" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="معدل الساعة" k="hourlyRate" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                    <SortHead label="راتب البصمة (المبلغ)" k="amount" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummary.map((r) => (
                    <TableRow key={r.employee_id} className="hover:bg-muted/40">
                      <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">{r.employeeNumber}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.branchName}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.departmentName}</TableCell>
                      <TableCell className="tabular-nums font-semibold">{r.workDays}</TableCell>
                      <TableCell className="tabular-nums">{nf(r.regular)}</TableCell>
                      <TableCell className="tabular-nums">{nf(r.overtime)}</TableCell>
                      <TableCell className="tabular-nums text-amber-700">{nf(r.overtimeWeighted)}</TableCell>
                      <TableCell className={cn("tabular-nums", r.absentDays > 0 && "text-red-600 font-medium")}>{r.absentDays}</TableCell>
                      <TableCell className="tabular-nums text-sky-700">{nf(r.annualHours)}</TableCell>
                      <TableCell className="tabular-nums text-violet-700">{nf(r.sickHours)}</TableCell>
                      <TableCell className="tabular-nums font-semibold">{nf(r.totalHours)}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {nf(r.hourlyRate)}
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setRateEdit({ id: r.employee_id, name: r.name, value: String(r.hourlyRate || "") })}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums font-bold text-emerald-700 whitespace-nowrap bg-emerald-50/60">{nf(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                    <TableCell />
                    <TableCell className="text-right">الإجمالي ({filteredSummary.length} موظف)</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="tabular-nums">{summaryTotals.workDays}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.regular)}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.overtime)}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.overtimeWeighted)}</TableCell>
                    <TableCell className="tabular-nums">{summaryTotals.absentDays}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.annualHours)}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.sickHours)}</TableCell>
                    <TableCell className="tabular-nums">{nf(summaryTotals.totalHours)}</TableCell>
                    <TableCell />
                    <TableCell className="tabular-nums font-bold text-emerald-700 bg-emerald-50/60">{nf(summaryTotals.amount)}</TableCell>
                  </TableRow>
                </TableFooter>
              </table>
            </div>
          )}
          <Dialog open={!!rateEdit} onOpenChange={(o) => !o && setRateEdit(null)}>
            <DialogContent className="sm:max-w-sm" dir="rtl">
              <DialogHeader>
                <DialogTitle>تعديل معدل الساعة — {rateEdit?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  type="number"
                  step="0.01"
                  value={rateEdit?.value ?? ""}
                  onChange={(e) => setRateEdit((s) => (s ? { ...s, value: e.target.value } : s))}
                  placeholder="مثال: 9.60"
                />
                <p className="text-[11px] text-muted-foreground">يُحفظ في تعريف الموظف (معدل الساعة).</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRateEdit(null)}>إلغاء</Button>
                <Button onClick={saveHourlyRate} disabled={savingRate}>
                  {savingRate && <Loader2 className="h-4 w-4 animate-spin ml-1" />} حفظ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      ) : (
      <>
      {/* Quick filters */}
      <div className="flex gap-1 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="الكل" count={counts.total} />
        <FilterChip active={filter === "missing_checkout"} onClick={() => setFilter("missing_checkout")} label="بدون خروج" count={counts.missing_checkout} tone="orange" />
        <FilterChip active={filter === "missing_checkin"} onClick={() => setFilter("missing_checkin")} label="بدون دخول" count={counts.missing_checkin} tone="orange" />
        <FilterChip active={filter === "late"} onClick={() => setFilter("late")} label="متأخر" count={counts.late} tone="amber" />
        <FilterChip active={filter === "absent"} onClick={() => setFilter("absent")} label="غياب" count={counts.absent} tone="red" />
        <FilterChip active={filter === "present"} onClick={() => setFilter("present")} label="حضور كامل" count={counts.present} tone="emerald" />
      </div>

      {/* Breaks / departures filter */}
      <div className="flex gap-1 flex-wrap items-center">
        <span className="text-[11px] text-muted-foreground ml-1">المغادرات:</span>
        <FilterChip active={breaksFilter === "any"} onClick={() => setBreaksFilter("any")} label="الكل" count={counts.total} />
        <FilterChip active={breaksFilter === "with"} onClick={() => setBreaksFilter("with")} label="فيه مغادرات" count={counts.with_breaks} tone="amber" />
        <FilterChip active={breaksFilter === "without"} onClick={() => setBreaksFilter("without")} label="بدون مغادرات" count={counts.without_breaks} tone="emerald" />
        <FilterChip active={breaksFilter === "prayer"} onClick={() => setBreaksFilter("prayer")} label="ختم للصلاة" count={counts.prayer} tone="emerald" />
        <FilterChip active={breaksFilter === "no_prayer"} onClick={() => setBreaksFilter("no_prayer")} label="ما ختم للصلاة" count={counts.no_prayer} tone="red" />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> جاري التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            لا توجد سجلات للفلتر المختار
          </div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto [&>div]:overflow-visible [scrollbar-width:auto] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-muted/40">
          <table className="w-full" style={{ minWidth: 1400, borderCollapse: "collapse", direction: "rtl" }}>
            <TableHeader>
              <TableRow className="bg-[#0D1B2E] hover:bg-[#0D1B2E]">
                <TableHead className="text-white text-right">الموظف</TableHead>
                <TableHead className="text-white text-right">التاريخ</TableHead>
                <TableHead className="text-white text-right">اليوم</TableHead>
                <TableHead className="text-white text-right">دخول</TableHead>
                <TableHead className="text-white text-right">خروج</TableHead>
                <TableHead className="text-white text-right">الفرع</TableHead>
                <TableHead className="text-white text-right">ساعات</TableHead>
                <TableHead className="text-white text-right">إضافي</TableHead>
                <TableHead className="text-white text-right">المغادرات</TableHead>
                <TableHead className="text-white text-right">الحالة</TableHead>
                <TableHead className="text-white text-right">المشكلة</TableHead>
                <TableHead className="text-white text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const isLeaveRow = !!r.leaveInfo;
                const issue = isLeaveRow || r.isEmptyDay ? "—"
                  : !r.first_check_in && r.status !== "absent" ? "بدون دخول"
                  : r.first_check_in && !r.last_check_out ? "بدون خروج"
                  : r.status === "late" ? "تأخير"
                  : r.status === "absent" ? "غياب"
                  : "—";
                return (
                  <TableRow key={r.id} className={cn("hover:bg-muted/40", isLeaveRow && "bg-sky-50/40", r.isEmptyDay && "opacity-70")}>
                    <TableCell className="font-medium">{r.employees?.full_name || "—"}</TableCell>
                    <TableCell className="tabular-nums">{fmtDateDisplay(r.attendance_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtWeekday(r.attendance_date)}</TableCell>
                    <TableCell className="tabular-nums">{isLeaveRow ? <span className="text-sky-700">—</span> : fmtTime(r.first_check_in)}</TableCell>
                    <TableCell className="tabular-nums">{isLeaveRow ? <span className="text-sky-700">—</span> : fmtTime(r.last_check_out)}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        if (isLeaveRow) return <span className="text-sky-700">إجازة{r.leaveInfo?.leave_type ? ` — ${r.leaveInfo.leave_type}` : ""}</span>;
                        const bl = r.branchList || [];
                        if (bl.length === 0) return <span className="text-muted-foreground">—</span>;
                        if (bl.length === 1) {
                          return <span className="text-foreground">{bl[0].name}</span>;
                        }
                        return (
                          <div className="flex flex-col gap-0.5" title={bl.map(b => `${b.name} (${b.count})`).join(" • ")}>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200 w-fit">
                              {bl.length} فروع
                            </Badge>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              {bl.map(b => b.name).join(" • ")}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMinutesHM(rowWorkMinutes(r))}</TableCell>
                    <TableCell className="tabular-nums">{(r.overtime_hours ?? 0).toFixed(1)}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const bks = r.breaks || [];
                        if (bks.length === 0) {
                          return <span className="text-muted-foreground">—</span>;
                        }
                        const totalMin = bks.reduce((s, b) => s + b.minutes, 0);
                        const byType: Record<string, number> = {};
                        bks.forEach((b) => {
                          const k = b.derived ? "__derived" : b.break_type;
                          byType[k] = (byType[k] || 0) + b.minutes;
                        });
                        const parts = Object.entries(byType).map(([t, m]) => {
                          const label =
                            t === "__derived"
                              ? "مغادرة (من البصمات)"
                              : BREAK_TYPE_LABEL[t as BreakDraft["break_type"]] || t;
                          return `${label} ${m}د`;
                        });
                        const hasPrayer = !!byType["prayer"];
                        return (
                          <div className="flex flex-col gap-0.5" title={parts.join(" • ")}>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 h-4",
                                  hasPrayer
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200",
                                )}
                              >
                                {bks.length} × {totalMin}د
                              </Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                              {parts.join(" • ")}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", STATUS_TONE[r.status] || "bg-muted")}>
                        {STATUS_LABEL[r.status] || r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {issue !== "—" ? <span className="text-red-600 font-medium">{issue}</span> : "—"}
                      {r.is_manually_adjusted && <Badge variant="outline" className="ml-1 text-[10px] bg-blue-50 text-blue-700 border-blue-200">معدّل</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      {isLeaveRow || r.isEmptyDay ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)} className="h-7 gap-1">
                          <Pencil className="h-3.5 w-3.5" /> تعديل
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                <TableCell colSpan={6} className="text-right">
                  الإجمالي ({filtered.length} سجل)
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMinutesHM(filtered.reduce((s, r) => s + rowWorkMinutes(r), 0))}
                </TableCell>
                <TableCell className="tabular-nums">
                  {filtered.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0).toFixed(1)}
                </TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableFooter>
          </table>
          </div>
        )}
      </Card>
      </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-4xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0 space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Pencil className="h-4 w-4 text-primary" />
              <span>تعديل يدوي</span>
              <span className="text-muted-foreground font-normal">
                {editing?.employees?.full_name} · {editing && fmtDateDisplay(editing.attendance_date)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
           <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الدخول</label>
                <Input type="time" value={form.first_check_in} onChange={e => setForm(p => ({ ...p, first_check_in: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الخروج</label>
                <Input type="time" value={form.last_check_out} onChange={e => setForm(p => ({ ...p, last_check_out: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
              <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">حاضر</SelectItem>
                  <SelectItem value="late">متأخر</SelectItem>
                  <SelectItem value="incomplete">بصمة ناقصة</SelectItem>
                  <SelectItem value="absent">غائب</SelectItem>
                  <SelectItem value="leave">إجازة</SelectItem>
                  <SelectItem value="holiday">عطلة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
           </div>
            {/* Raw punches (read-only) — shows every check-in/out the employee
                did that day so the accountant can see WHY the auto-total
                looks off (double punch, missing check-out, wrong branch)
                before overriding the times above. */}
            <div className="border rounded-md p-2 bg-muted/30 space-y-1.5 max-h-[260px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold flex items-center gap-1.5 text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  بصمات الموظف الأصلية (من الفروع)
                </div>
                {rawEvents.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{rawEvents.length} بصمة</span>
                )}
              </div>
              {rawLoading ? (
                <div className="text-[11px] text-muted-foreground py-2 text-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> جاري تحميل البصمات...
                </div>
              ) : rawEvents.length === 0 ? (
                <div className="text-[11px] text-muted-foreground py-1">— لا توجد بصمات مسجلة لهذا اليوم —</div>
              ) : (
                <div className="space-y-1">
                  {rawEvents.map((e, i) => {
                    const prev = i > 0 ? rawEvents[i - 1] : null;
                    const gapMin = prev ? Math.round((new Date(e.event_time).getTime() - new Date(prev.event_time).getTime()) / 60000) : null;
                    // Flag likely duplicate: same event type within 2 min of previous
                    const isDup = prev && prev.event_type === e.event_type && (gapMin ?? 999) <= 2;
                    const isIn = e.event_type === "check_in";
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "flex items-center justify-between gap-2 text-[11px] rounded px-2 py-1 border",
                          isDup ? "bg-red-50 border-red-200" : "bg-white border-slate-200",
                        )}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold",
                            isIn ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                          )}>
                            {isIn ? "د" : "خ"}
                          </span>
                          <span className={isIn ? "text-emerald-700" : "text-rose-700"}>
                            {isIn ? "دخول" : "خروج"}
                          </span>
                        </div>
                        <span className="tabular-nums text-foreground">
                          {format(new Date(e.event_time), "hh:mm:ss a")}
                        </span>
                        <span className="flex-1 text-muted-foreground truncate text-left">
                          {e.branch_id ? (branchNames[e.branch_id] || "—") : "—"}
                        </span>
                        {isDup && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-red-300 text-red-700 bg-red-50">
                            تكرار {gapMin}د
                          </Badge>
                        )}
                        {e.status && e.status !== "valid" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                            {e.status}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {(() => {
                    // Detect obvious anomaly (odd number of stamps = missing punch)
                    const dupCount = rawEvents.filter((e, i) => {
                      const p = i > 0 ? rawEvents[i - 1] : null;
                      if (!p) return false;
                      const g = Math.round((new Date(e.event_time).getTime() - new Date(p.event_time).getTime()) / 60000);
                      return p.event_type === e.event_type && g <= 2;
                    }).length;
                    const odd = rawEvents.length % 2 !== 0;
                    if (!dupCount && !odd) return null;
                    return (
                      <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-start gap-1.5">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {dupCount > 0 && `يوجد ${dupCount} بصمة مكررة (ضغط أكثر من مرة). `}
                          {odd && `عدد البصمات فردي — يوجد دخول بلا خروج أو العكس.`}
                          {" "}عدّل الدخول/الخروج يدوياً لتصحيح الساعات.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            {/* Sessions (multi-break) editor */}
            <div className="border rounded-md p-2 bg-muted/20 space-y-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  الجلسات خلال اليوم (خروج/عودة)
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={() =>
                    setBreaks((prev) => [
                      ...prev,
                      { id: null, break_type: "prayer", out: "", in: "", reason: "" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> إضافة جلسة
                </Button>
              </div>
              {breaksLoading ? (
                <div className="text-[11px] text-muted-foreground py-2 text-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> جاري تحميل الجلسات...
                </div>
              ) : breaks.filter((b) => !b._deleted).length === 0 ? (
                <div className="text-[11px] text-muted-foreground py-1">لا توجد جلسات — اضغط "إضافة جلسة" لتسجيل خروج مؤقت (صلاة/خاص/طعام/مهمة).</div>
              ) : (
                <div className="space-y-1.5">
                  {breaks.map((b, idx) =>
                    b._deleted ? null : (
                      <div
                        key={b.id ?? `new-${idx}`}
                        className="grid grid-cols-12 gap-1.5 items-end bg-background border rounded px-2 py-1.5"
                      >
                        <div className="col-span-4">
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">نوع الجلسة</label>
                          <Select
                            value={b.break_type}
                            onValueChange={(v) =>
                              setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, break_type: v as BreakDraft["break_type"] } : x)))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(BREAK_TYPE_LABEL) as BreakDraft["break_type"][]).map((k) => (
                                <SelectItem key={k} value={k}>{BREAK_TYPE_LABEL[k]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">خروج</label>
                          <Input
                            type="time"
                            value={b.out}
                            onChange={(e) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, out: e.target.value } : x)))}
                            dir="ltr"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">عودة</label>
                          <Input
                            type="time"
                            value={b.in}
                            onChange={(e) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, in: e.target.value } : x)))}
                            dir="ltr"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50"
                            onClick={() =>
                              setBreaks((prev) =>
                                prev
                                  .map((x, i) => (i === idx ? { ...x, _deleted: true } : x))
                                  // Drop unsaved manual rows entirely, but KEEP
                                  // deleted auto-derived rows so the save step
                                  // can record a permanent dismissal for them.
                                  .filter((x) => !(x._deleted && !x.id && !x._derived)),
                              )
                            }
                            aria-label="حذف الجلسة"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
              {/* Live totals */}
              <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t">
                <div className="rounded bg-muted/40 px-2 py-1 text-center">
                  <div className="text-[10px] text-muted-foreground">إجمالي الفترة</div>
                  <div className="text-xs font-bold tabular-nums">{fmtHM(liveTotals.gross)}</div>
                </div>
                <div className="rounded bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 text-center">
                  <div className="text-[10px]">مجموع الجلسات</div>
                  <div className="text-xs font-bold tabular-nums">{fmtHM(liveTotals.breakMin)}</div>
                </div>
                <div className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 text-center">
                  <div className="text-[10px]">صافي العمل</div>
                  <div className="text-xs font-bold tabular-nums">{fmtHM(liveTotals.net)}</div>
                </div>
                <div className="rounded bg-sky-50 text-sky-800 border border-sky-200 px-2 py-1 text-center">
                  <div className="text-[10px]">الفعلي من البصمات</div>
                  <div className="text-xs font-bold tabular-nums">{fmtHM(actualFromPunchesMin)}</div>
                </div>
              </div>
              {netDiffersFromPunches && (
                <div className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    الرقم بالسجل ({fmtHM(actualFromPunchesMin)}) محسوب من مجموع جلسات البصمات الفعلية.
                    قيمة "صافي العمل" الحالية ({fmtHM(liveTotals.net)}) هي ما سيُخزَّن بعد الحفظ.
                  </span>
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs text-destructive mb-1 block">سبب التعديل (إلزامي) *</label>
              <Textarea rows={2} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="اكتب سبب التعديل هنا..." />
              <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> سيتم وسم السجل كمعدّل يدوياً وحفظ السبب في سجل التدقيق.
              </p>
            </div>
          </div>
          <DialogFooter className="px-4 py-3 border-t shrink-0 sm:justify-start gap-2">
            <Button onClick={saveEdit} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ التعديل
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: "amber" | "red" | "orange" | "emerald" }) {
  const toneActive: Record<string, string> = {
    amber: "bg-amber-500 text-white",
    red: "bg-red-500 text-white",
    orange: "bg-orange-500 text-white",
    emerald: "bg-emerald-500 text-white",
  };
  const activeCls = tone ? toneActive[tone] : "bg-[#0D1B2E] text-white";
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition",
        active ? activeCls : "bg-background hover:bg-muted border-border"
      )}
    >
      {label} <span className="opacity-80">({count})</span>
    </button>
  );
}