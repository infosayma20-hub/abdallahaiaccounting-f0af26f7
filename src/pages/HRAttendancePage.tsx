import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay, cn } from "@/lib/utils";
import {
  Users, Building2, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, FileText, Download, Loader2, Eye, Check, X, MapPin,
  QrCode, RefreshCw, Copy, MoreVertical, Pencil, Trash2, Printer,
  Search, Filter, MessageSquare, History, Calculator, Send, AlertCircle,
  Lock, Unlock, CheckSquare,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { format } from "date-fns";
import { setNextExportBranding } from "@/lib/excel-export";
import SendHRMessageDialog, { SendTarget } from "@/components/hr/SendHRMessageDialog";
import { Shield } from "lucide-react";
import { tAttendanceStatus, tRequestType, tFormStatus } from "@/lib/hrLabels";
import MonthlyAttendanceTab from "@/pages/hr/components/MonthlyAttendanceTab";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
};

type EmployeeLite = {
  id: string;
  full_name: string;
  branch_id: string | null;
  department: string | null;
  job_title: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_id?: string | null;
  shift?: { id: string; name: string; start_time: string; end_time: string; late_tolerance_minutes: number | null; overtime_after_minutes: number | null; crosses_midnight?: boolean | null } | null;
  is_active: boolean;
  is_terminated: boolean | null;
  work_days_per_week: number | null;
  start_date: string | null;
};

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  overtime_hours: number;
  status: string;
  branch_id: string | null;
  notes: string | null;
  is_manually_adjusted: boolean | null;
  employees?: {
    full_name: string;
    branch_id: string | null;
    department: string | null;
    job_title: string | null;
    shift_start: string | null;
    shift_end: string | null;
    shift_id?: string | null;
    shift?: { id: string; name: string; start_time: string; end_time: string; late_tolerance_minutes: number | null; overtime_after_minutes: number | null; crosses_midnight?: boolean | null } | null;
  };
};

type CorrectionReq = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  employees?: { full_name: string };
};

type LeaveRow = { employee_id: string; start_date: string; end_date: string; leave_type: string };
type HolidayRow = { holiday_date: string | null; name: string; is_recurring: boolean | null; recurring_month: number | null; recurring_day: number | null };

// Day type for a given date for a given employee
type DayType = "working" | "weekly_off" | "holiday" | "leave";

// Determine if employee works on a given JS day-of-week (0=Sun..6=Sat)
// Source of truth: hr_work_week_config.weekly_off_days (DB-driven, per company)
// Fallback to Friday-only if config is missing.
function isWorkingDay(dow: number, weeklyOffDays: number[] | null | undefined): boolean {
  const off = weeklyOffDays && weeklyOffDays.length > 0 ? weeklyOffDays : [5];
  return !off.includes(dow);
}

function getDayType(
  date: string,
  emp: { id: string; start_date: string | null },
  holidays: HolidayRow[],
  leaves: LeaveRow[],
  weeklyOffDays: number[] | null,
): DayType {
  const d = new Date(date + "T00:00:00");
  // Holiday?
  const m = d.getMonth() + 1, day = d.getDate();
  const isHoliday = holidays.some(h =>
    (h.holiday_date && h.holiday_date === date) ||
    (h.is_recurring && h.recurring_month === m && h.recurring_day === day)
  );
  if (isHoliday) return "holiday";
  // Leave?
  const onLeave = leaves.some(l => l.employee_id === emp.id && date >= l.start_date && date <= l.end_date);
  if (onLeave) return "leave";
  // Weekly off?
  if (!isWorkingDay(d.getDay(), weeklyOffDays)) return "weekly_off";
  return "working";
}

type RowFilter = "all" | "issues" | "present" | "late" | "absent" | "incomplete" | "missing_checkin" | "missing_checkout";

const statusBadgeClass = (s: string) => {
  switch (s) {
    case "present": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "late": return "bg-amber-50 text-amber-700 border-amber-200";
    case "absent": return "bg-red-50 text-red-700 border-red-200";
    case "incomplete": return "bg-orange-50 text-orange-700 border-orange-200";
    case "leave": return "bg-blue-50 text-blue-700 border-blue-200";
    case "holiday": return "bg-purple-50 text-purple-700 border-purple-200";
    default: return "bg-muted text-muted-foreground";
  }
};

const rowAccentClass = (s: string) => {
  switch (s) {
    case "present": return "border-r-4 border-r-emerald-500";
    case "late": return "border-r-4 border-r-amber-500";
    case "absent": return "border-r-4 border-r-red-500 bg-red-50/30";
    case "incomplete": return "border-r-4 border-r-orange-500 bg-orange-50/30";
    case "leave": return "border-r-4 border-r-blue-400";
    default: return "";
  }
};

// Resolve the effective shift times for an employee.
// Source of truth: employees.shift (FK to work_shifts). Fallback: legacy shift_start/end.
function resolveShift(emp: AttendanceRecord["employees"]): {
  start: string | null;
  end: string | null;
  graceMin: number;
  overtimeAfterMin: number;
  crossesMidnight: boolean;
} {
  const sh = emp?.shift;
  if (sh?.start_time && sh?.end_time) {
    return {
      start: sh.start_time.slice(0, 5),
      end: sh.end_time.slice(0, 5),
      graceMin: sh.late_tolerance_minutes ?? 0,
      overtimeAfterMin: sh.overtime_after_minutes ?? 0,
      crossesMidnight: !!sh.crosses_midnight,
    };
  }
  return {
    start: emp?.shift_start || null,
    end: emp?.shift_end || null,
    graceMin: 0,
    overtimeAfterMin: 0,
    crossesMidnight: false,
  };
}

const fmtMin = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
};

// Compute issue text + late/early/overtime minutes — Day-type AND shift aware
function computeIssue(
  r: AttendanceRecord,
  dayType: DayType = "working",
): { text: string; severity: "ok" | "warn" | "err"; lateMin: number; earlyLeaveMin?: number; overtimeMin?: number } {
  const sh = resolveShift(r.employees);

  // Build expected shift start/end timestamps anchored on the day of check-in.
  // For overnight shifts (crosses_midnight), the expected END is the next day.
  let expectedStart: Date | null = null;
  let expectedEnd: Date | null = null;
  const anchor = r.first_check_in ? new Date(r.first_check_in) : (r.last_check_out ? new Date(r.last_check_out) : null);
  if (anchor && sh.start) {
    const [sh1, sm1] = sh.start.split(":").map(Number);
    expectedStart = new Date(anchor);
    expectedStart.setHours(sh1 || 0, sm1 || 0, 0, 0);
  }
  if (anchor && sh.end) {
    const [eh, em] = sh.end.split(":").map(Number);
    expectedEnd = new Date(anchor);
    expectedEnd.setHours(eh || 0, em || 0, 0, 0);
    if (sh.crossesMidnight) {
      // End is the next calendar day relative to check-in
      expectedEnd.setDate(expectedEnd.getDate() + 1);
    }
  }

  // Late minutes (vs shift start)
  let lateMin = 0;
  if (r.first_check_in && expectedStart) {
    const ci = new Date(r.first_check_in);
    lateMin = Math.max(0, Math.round((ci.getTime() - expectedStart.getTime()) / 60000));
    // Apply grace
    if (lateMin <= sh.graceMin) lateMin = 0;
  }

  // Early leave minutes (vs shift end)
  let earlyLeaveMin = 0;
  if (r.last_check_out && expectedEnd) {
    const co = new Date(r.last_check_out);
    earlyLeaveMin = Math.max(0, Math.round((expectedEnd.getTime() - co.getTime()) / 60000));
  }

  // Overtime minutes (vs shift end + threshold)
  let overtimeMin = 0;
  if (r.last_check_out && expectedEnd) {
    const co = new Date(r.last_check_out);
    const extra = Math.max(0, Math.round((co.getTime() - expectedEnd.getTime()) / 60000));
    if (extra >= sh.overtimeAfterMin) overtimeMin = extra;
  }

  // Non-working days never count as issues
  if (dayType === "holiday") return { text: "عطلة رسمية", severity: "ok", lateMin: 0 };
  if (dayType === "leave") return { text: "إجازة معتمدة", severity: "ok", lateMin: 0 };
  if (dayType === "weekly_off") return { text: "يوم عطلة أسبوعية", severity: "ok", lateMin: 0 };

  if (r.status === "absent") return { text: "غياب كامل", severity: "err", lateMin: 0 };
  if (!r.first_check_in) return { text: "لم يسجل دخول", severity: "err", lateMin: 0 };
  if (!r.last_check_out) return { text: "لم يسجل خروج", severity: "err", lateMin, earlyLeaveMin, overtimeMin };

  // Order of precedence in summary text: late > early_leave > overtime > ok
  if (lateMin > 0) {
    return { text: `تأخير ${fmtMin(lateMin)}`, severity: "warn", lateMin, earlyLeaveMin, overtimeMin };
  }
  if (earlyLeaveMin >= 5) {
    return { text: `انصراف مبكر ${fmtMin(earlyLeaveMin)}`, severity: "warn", lateMin: 0, earlyLeaveMin, overtimeMin };
  }
  if (overtimeMin > 0) {
    return { text: `إضافي ${fmtMin(overtimeMin)}`, severity: "ok", lateMin: 0, earlyLeaveMin, overtimeMin };
  }
  return { text: "—", severity: "ok", lateMin: 0, earlyLeaveMin, overtimeMin };
}

export default function HRAttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings: companySettings, updateSettings: updateCompanySettings } = useCompanySettings();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<CorrectionReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [activeTab, setActiveTab] = useState<"live" | "monthly" | "corrections" | "reports">("live");

  // Branch dialogs
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedBranchForQR, setSelectedBranchForQR] = useState<Branch | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [branchForm, setBranchForm] = useState({ name: "", address: "", latitude: "", longitude: "", radius_meters: "100" });
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", latitude: "", longitude: "", radius_meters: "" });
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Correction review
  const [reviewDialog, setReviewDialog] = useState<CorrectionReq | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Row action dialogs
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [editRecordForm, setEditRecordForm] = useState({ first_check_in: "", last_check_out: "", status: "present", notes: "" });
  const [noteRecord, setNoteRecord] = useState<AttendanceRecord | null>(null);
  const [noteText, setNoteText] = useState("");
  const [historyRecord, setHistoryRecord] = useState<AttendanceRecord | null>(null);
  const [historyEvents, setHistoryEvents] = useState<any[]>([]);

  // Day-type sources
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([5]); // default Friday

  // Indicator
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");

  // Bulk inquiry
  const [bulkInquiryOpen, setBulkInquiryOpen] = useState(false);
  const [bulkInquiryMessage, setBulkInquiryMessage] = useState("");
  const [bulkInquiryTargets, setBulkInquiryTargets] = useState<{ employee_id: string; employee_name?: string; attendance_date: string; issueText: string }[]>([]);
  const [bulkInquirySending, setBulkInquirySending] = useState(false);

  // HR Message / Penalty
  const [hrMsgOpen, setHrMsgOpen] = useState(false);
  const [hrMsgTargets, setHrMsgTargets] = useState<SendTarget[]>([]);
  const [hrMsgDefaultType, setHrMsgDefaultType] = useState<"info" | "penalty" | "warning" | "inquiry">("info");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const canIssuePenalty = userRoles.includes("admin") || userRoles.includes("hr_manager");

  // Day lock — DB-backed via hr_attendance_locks (B2.2.1)
  type DayLock = {
    id: string;
    attendance_date: string;
    status: "locked" | "unlocked";
    locked_by: string;
    locked_at: string;
    reason: string | null;
    unlocked_by: string | null;
    unlocked_at: string | null;
    unlock_reason: string | null;
  };
  const [dayLock, setDayLock] = useState<DayLock | null>(null);
  const isLocked = !!dayLock && dayLock.status === "locked";
  const canManageLock = userRoles.includes("admin") || userRoles.includes("hr_manager");
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockDialogMode, setLockDialogMode] = useState<"lock" | "unlock">("lock");
  const [lockReasonInput, setLockReasonInput] = useState("");
  const [lockBusy, setLockBusy] = useState(false);
  const [lockAcknowledged, setLockAcknowledged] = useState(false);

  const fetchDayLock = useCallback(async () => {
    if (!user || !selectedDate) { setDayLock(null); return; }
    const { data } = await supabase
      .from("hr_attendance_locks")
      .select("id, attendance_date, status, locked_by, locked_at, reason, unlocked_by, unlocked_at, unlock_reason")
      .eq("attendance_date", selectedDate)
      .order("locked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setDayLock((data as any) || null);
  }, [user, selectedDate]);

  useEffect(() => { fetchDayLock(); }, [fetchDayLock]);

  // Realtime: any lock change for current date refreshes UI from any device
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`hr-locks-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hr_attendance_locks" }, (payload: any) => {
        const row = payload.new || payload.old;
        if (row?.attendance_date === selectedDate) fetchDayLock();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, selectedDate, fetchDayLock]);

  const openLockDialog = () => {
    if (!canManageLock) {
      toast({ title: "غير مصرح", description: "إغلاق/فتح اليوم متاح فقط لمدير الموارد البشرية أو الأدمن.", variant: "destructive" });
      return;
    }
    setLockDialogMode(isLocked ? "unlock" : "lock");
    setLockReasonInput("");
    setLockAcknowledged(false);
    setLockDialogOpen(true);
  };

  const submitLockAction = async () => {
    if (!user) return;
    if (lockDialogMode === "unlock" && !lockReasonInput.trim()) {
      toast({ title: "السبب مطلوب", description: "الرجاء كتابة سبب فتح اليوم.", variant: "destructive" });
      return;
    }
    // Premature lock guard: today or future
    const todayStr = new Date().toISOString().split("T")[0];
    const isPremature = lockDialogMode === "lock" && selectedDate >= todayStr;
    if (isPremature && !lockAcknowledged) {
      toast({ title: "يرجى تأكيد الإقرار", description: "اليوم لم ينتهِ بعد. أكّد الإقرار قبل المتابعة.", variant: "destructive" });
      return;
    }
    setLockBusy(true);
    try {
      if (lockDialogMode === "lock") {
        // Upsert: if a previously-unlocked row exists, flip it back to locked; else insert new
        if (dayLock) {
          const { error } = await supabase.from("hr_attendance_locks").update({
            status: "locked", locked_by: user.id, locked_at: new Date().toISOString(),
            reason: lockReasonInput.trim() || null,
            unlocked_by: null, unlocked_at: null, unlock_reason: null,
          }).eq("id", dayLock.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("hr_attendance_locks").insert({
            auth_user_id: user.id,
            attendance_date: selectedDate,
            status: "locked",
            locked_by: user.id,
            reason: lockReasonInput.trim() || null,
          } as any);
          if (error) throw error;
        }
        toast({ title: "تم إغلاق اليوم", description: "لا يمكن تعديل بصمات أو طلبات لهذا اليوم حتى يتم فتحه." });
      } else {
        if (!dayLock) return;
        const { error } = await supabase.from("hr_attendance_locks").update({
          status: "unlocked",
          unlocked_by: user.id,
          unlocked_at: new Date().toISOString(),
          unlock_reason: lockReasonInput.trim(),
        }).eq("id", dayLock.id);
        if (error) throw error;
        toast({ title: "تم فتح اليوم", description: "يمكن الآن تعديل بصمات وطلبات هذا اليوم." });
      }
      setLockDialogOpen(false);
      await fetchDayLock();
    } catch (e: any) {
      toast({ title: "تعذّر التنفيذ", description: e.message || String(e), variant: "destructive" });
    } finally {
      setLockBusy(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // branches with employees
      const { data: br } = await supabase.from("branches_safe").select("*").eq("user_id", user.id);
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, department, job_title, shift_start, shift_end, shift_id, is_active, is_terminated, work_days_per_week, start_date, shift:work_shifts(id,name,start_time,end_time,late_tolerance_minutes,overtime_after_minutes,crosses_midnight)")
        .eq("user_id", user.id);
      setEmployees((emps as EmployeeLite[]) || []);
      const usedBranchIds = new Set((emps || []).map(e => e.branch_id).filter(Boolean));
      setBranches((br || []).filter(b => usedBranchIds.has(b.id)));

      const { data: att } = await supabase
        .from("attendance_days")
        .select("*, employees!inner(full_name, branch_id, department, job_title, shift_start, shift_end, shift_id, shift:work_shifts(id,name,start_time,end_time,late_tolerance_minutes,overtime_after_minutes,crosses_midnight))")
        .eq("attendance_date", selectedDate)
        .order("first_check_in", { ascending: true, nullsFirst: false });
      let filtered = (att as any) || [];
      if (selectedBranch !== "all") filtered = filtered.filter((r: any) => r.branch_id === selectedBranch);
      setRecords(filtered);

      const { data: corr } = await supabase
        .from("correction_requests")
        .select("*, employees!inner(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setCorrections((corr as any) || []);

      // Holidays + approved leaves covering selectedDate
      const { data: hol } = await supabase
        .from("official_holidays")
        .select("holiday_date, name, is_recurring, recurring_month, recurring_day, is_active")
        .eq("user_id", user.id);
      // Respect is_active when present; fallback to "treat as active" if column missing/null
      const activeHol = (hol || []).filter((h: any) => h.is_active !== false);
      setHolidays(activeHol as HolidayRow[]);
      const { data: lv } = await supabase
        .from("employee_leaves")
        .select("employee_id, start_date, end_date, leave_type")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate);
      setLeaves((lv as LeaveRow[]) || []);

      // Work week config (per-company weekly off days)
      const { data: ww } = await supabase
        .from("hr_work_week_config")
        .select("weekly_off_days")
        .eq("user_id", user.id)
        .maybeSingle();
      if (ww?.weekly_off_days && Array.isArray(ww.weekly_off_days) && ww.weekly_off_days.length > 0) {
        setWeeklyOffDays(ww.weekly_off_days as number[]);
      } else {
        setWeeklyOffDays([5]); // fallback: Friday
      }

      setLastRefreshAt(new Date());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user, selectedDate, selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch user roles for permission gating
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setUserRoles((data || []).map((r: any) => r.role));
    });
  }, [user]);

  const openHRMessageFor = (r: AttendanceRecord, type: "info" | "penalty" | "warning" | "inquiry" = "info") => {
    setHrMsgTargets([{
      employee_id: r.employee_id,
      employee_name: r.employees?.full_name,
      attendance_date: r.attendance_date,
    }]);
    setHrMsgDefaultType(type);
    setHrMsgOpen(true);
  };

  const openBulkPenalty = () => {
    const ids = Array.from(selected);
    const all = enriched.filter(x => ids.includes(x.row.id));
    if (all.length === 0) { toast({ title: "لم يتم اختيار موظفين" }); return; }
    if (!canIssuePenalty) {
      toast({ title: "غير مسموح", description: "صلاحية الإجراء العقابي لـ admin / hr_manager فقط", variant: "destructive" });
      return;
    }
    setHrMsgTargets(all.map(x => ({
      employee_id: x.row.employee_id,
      employee_name: x.row.employees?.full_name,
      attendance_date: x.row.attendance_date,
      default_subject: x.issue.text !== "—" ? x.issue.text : undefined,
    })));
    setHrMsgDefaultType("penalty");
    setHrMsgOpen(true);
  };

  // Synthesize "absent/off rows" for active employees with no record on this date.
  // Employees on leave / holiday / weekly off get a synthetic row with the right status (NOT absent).
  const allRows = useMemo(() => {
    const byEmp = new Map(records.map(r => [r.employee_id, r]));
    const activeEmps = employees.filter(e =>
      e.is_active && !e.is_terminated &&
      (selectedBranch === "all" || e.branch_id === selectedBranch) &&
      (!e.start_date || e.start_date <= selectedDate)
    );
    const synthetic: AttendanceRecord[] = activeEmps
      .filter(e => !byEmp.has(e.id))
      .map(e => {
        const dt = getDayType(selectedDate, e, holidays, leaves, weeklyOffDays);
        const status = dt === "holiday" ? "holiday" : dt === "leave" ? "leave" : dt === "weekly_off" ? "leave" : "absent";
        return {
        id: `synthetic-${e.id}`,
        employee_id: e.id,
        attendance_date: selectedDate,
        first_check_in: null,
        last_check_out: null,
        total_hours: 0,
        overtime_hours: 0,
        status,
        branch_id: e.branch_id,
        notes: null,
        is_manually_adjusted: false,
        employees: { full_name: e.full_name, branch_id: e.branch_id, department: e.department, job_title: e.job_title, shift_start: e.shift_start, shift_end: e.shift_end, shift_id: (e as any).shift_id ?? null, shift: (e as any).shift ?? null },
        };
      });
    return [...records, ...synthetic];
  }, [records, employees, selectedBranch, selectedDate, holidays, leaves]);

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const enriched = useMemo(() => allRows.map(r => {
    const emp = empById.get(r.employee_id);
    const dt = emp ? getDayType(r.attendance_date, emp, holidays, leaves, weeklyOffDays) : "working";
    return { row: r, issue: computeIssue(r, dt), dayType: dt };
  }), [allRows, empById, holidays, leaves]);

  // KPIs
  const kpis = useMemo(() => {
    // Only working days count toward issue KPIs
    const working = enriched.filter(x => x.dayType === "working");
    const present = working.filter(x => x.row.status === "present").length;
    const late = working.filter(x => x.row.status === "late" || x.issue.lateMin >= 5).length;
    const absent = working.filter(x => x.row.status === "absent").length;
    const incomplete = working.filter(x => x.row.first_check_in && !x.row.last_check_out).length
      + working.filter(x => !x.row.first_check_in && x.row.status !== "absent").length;
    const issues = working.filter(x => x.issue.severity !== "ok").length;
    const onLeaveOrOff = enriched.filter(x => x.dayType !== "working").length;
    return { present, late, absent, incomplete, issues, pendingCorrections: corrections.length, onLeaveOrOff };
  }, [enriched, corrections]);

  // Filtered + searched table rows
  const visibleRows = useMemo(() => {
    let rows = enriched;
    if (filter === "issues") rows = rows.filter(x => x.issue.severity !== "ok");
    else if (filter === "present") rows = rows.filter(x => x.row.status === "present");
    else if (filter === "late") rows = rows.filter(x => x.row.status === "late" || x.issue.lateMin >= 5);
    else if (filter === "absent") rows = rows.filter(x => x.row.status === "absent");
    else if (filter === "incomplete") rows = rows.filter(x => (x.row.first_check_in && !x.row.last_check_out) || (!x.row.first_check_in && x.row.status !== "absent"));
    else if (filter === "missing_checkin") rows = rows.filter(x => !x.row.first_check_in && x.row.status !== "absent");
    else if (filter === "missing_checkout") rows = rows.filter(x => x.row.first_check_in && !x.row.last_check_out);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(x =>
        (x.row.employees?.full_name || "").toLowerCase().includes(q) ||
        (x.row.employees?.department || "").toLowerCase().includes(q) ||
        (x.row.employees?.job_title || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [enriched, filter, search]);

  // ------------------ Branch CRUD (kept) ------------------
  const createBranch = async () => {
    if (!branchForm.name || !branchForm.latitude || !branchForm.longitude) {
      toast({ title: "خطأ", description: "الاسم والإحداثيات مطلوبة", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("branches").insert({
      user_id: user!.id, name: branchForm.name, address: branchForm.address || null,
      latitude: parseFloat(branchForm.latitude), longitude: parseFloat(branchForm.longitude),
      radius_meters: parseInt(branchForm.radius_meters) || 100,
    });
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else {
      toast({ title: "تم إنشاء الفرع بنجاح" });
      setShowBranchDialog(false);
      setBranchForm({ name: "", address: "", latitude: "", longitude: "", radius_meters: "100" });
      fetchData();
    }
  };

  const generateQRToken = async (branch: Branch) => {
    setSelectedBranchForQR(branch);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/branch-qr?action=generate&branch_id=${branch.id}`,
        { headers: { Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await response.json();
      if (!response.ok) { toast({ title: "خطأ", description: data.error || "حدث خطأ", variant: "destructive" }); return; }
      setQrToken(data.qr_payload); setShowQRDialog(true);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const openDisplayPage = (branchId: string) => window.open(`/branch-display/${branchId}`, "_blank");

  const printQRCode = (branchName: string, qrPayload: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrPayload)}&format=svg&margin=2`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>QR - ${branchName}</title>
<style>@page{size:A4;margin:0}body{width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;font-family:'Tajawal',sans-serif}
.c{text-align:center}.t{font-size:32pt;font-weight:800;color:#1B3A5C;margin-bottom:8mm}.f{display:inline-block;padding:10mm;border:3px solid #1B3A5C;border-radius:8mm;margin:8mm}.f img{width:100mm;height:100mm}</style></head>
<body><div class="c"><div class="t">${branchName}</div><div class="f"><img src="${qrUrl}"/></div><div>📱 امسح الرمز لتسجيل الحضور</div></div></body></html>`);
    printWindow.document.close();
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setEditForm({ name: b.name, address: b.address || "", latitude: String(b.latitude), longitude: String(b.longitude), radius_meters: String(b.radius_meters) });
  };

  const updateBranch = async () => {
    if (!editingBranch || !editForm.name || !editForm.latitude || !editForm.longitude) return;
    const { error } = await supabase.from("branches").update({
      name: editForm.name, address: editForm.address || null,
      latitude: parseFloat(editForm.latitude), longitude: parseFloat(editForm.longitude),
      radius_meters: parseInt(editForm.radius_meters) || 100,
    }).eq("id", editingBranch.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تم التحديث" }); setEditingBranch(null); fetchData(); }
  };

  const deleteBranch = async () => {
    if (!deletingBranch || deleteConfirmName !== deletingBranch.name) return;
    const { error } = await supabase.from("branches").update({ is_active: false }).eq("id", deletingBranch.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تم حذف الفرع" }); setDeletingBranch(null); setDeleteConfirmName(""); fetchData(); }
  };

  // ------------------ Correction handling ------------------
  const handleCorrection = async (id: string, action: "approved" | "rejected") => {
    const { error } = await supabase.from("correction_requests").update({
      status: action, reviewed_by: user!.id, review_notes: reviewNotes || null, reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await supabase.from("attendance_audit_logs").insert({
      table_name: "correction_requests", record_id: id,
      action: action === "approved" ? "approve" : "reject",
      new_values: { status: action, review_notes: reviewNotes },
      changed_by: user!.id, reason: reviewNotes || undefined,
    });
    toast({ title: action === "approved" ? "تم القبول" : "تم الرفض" });
    setReviewDialog(null); setReviewNotes(""); fetchData();
  };

  // ------------------ Row Actions ------------------
  const openEditRecord = (r: AttendanceRecord) => {
    if (isLocked) { toast({ title: "اليوم مغلق", description: "افتح اليوم لإجراء التعديلات", variant: "destructive" }); return; }
    if (r.id.startsWith("synthetic-")) {
      toast({ title: "لا يوجد سجل بعد", description: "هذا الموظف لم يبصم اليوم. استخدم 'تعديل يدوي' لإنشاء سجل عبر طلب تعديل من الموظف.", variant: "destructive" });
      return;
    }
    setEditRecord(r);
    setEditRecordForm({
      first_check_in: r.first_check_in ? format(new Date(r.first_check_in), "HH:mm") : "",
      last_check_out: r.last_check_out ? format(new Date(r.last_check_out), "HH:mm") : "",
      status: r.status,
      notes: r.notes || "",
    });
  };

  const saveEditRecord = async () => {
    if (!editRecord) return;
    const buildTs = (hhmm: string) => {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(editRecord.attendance_date);
      d.setHours(h || 0, m || 0, 0, 0);
      return d.toISOString();
    };
    const ci = buildTs(editRecordForm.first_check_in);
    const co = buildTs(editRecordForm.last_check_out);
    let total = 0;
    if (ci && co) total = Math.max(0, (new Date(co).getTime() - new Date(ci).getTime()) / 3600000);
    const { error } = await supabase.from("attendance_days").update({
      first_check_in: ci,
      last_check_out: co,
      total_hours: Number(total.toFixed(2)),
      status: editRecordForm.status,
      notes: editRecordForm.notes || null,
      is_manually_adjusted: true,
      updated_at: new Date().toISOString(),
    }).eq("id", editRecord.id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await supabase.from("attendance_audit_logs").insert({
      table_name: "attendance_days", record_id: editRecord.id, action: "update",
      new_values: { ...editRecordForm }, changed_by: user!.id, reason: "تعديل يدوي من HR",
    });
    toast({ title: "تم التحديث" });
    setEditRecord(null); fetchData();
  };

  const recalcRecord = async (r: AttendanceRecord) => {
    if (isLocked) { toast({ title: "اليوم مغلق", variant: "destructive" }); return; }
    if (r.id.startsWith("synthetic-")) return;
    if (!r.first_check_in || !r.last_check_out) {
      toast({ title: "لا يمكن إعادة الحساب", description: "ينقص الدخول أو الخروج", variant: "destructive" });
      return;
    }
    const total = Math.max(0, (new Date(r.last_check_out).getTime() - new Date(r.first_check_in).getTime()) / 3600000);
    const { error } = await supabase.from("attendance_days").update({
      total_hours: Number(total.toFixed(2)), updated_at: new Date().toISOString(),
    }).eq("id", r.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تمت إعادة الحساب" }); fetchData(); }
  };

  const openNote = (r: AttendanceRecord) => {
    if (isLocked) { toast({ title: "اليوم مغلق", variant: "destructive" }); return; }
    if (r.id.startsWith("synthetic-")) {
      toast({ title: "لا يوجد سجل لإضافة ملاحظة عليه", variant: "destructive" }); return;
    }
    setNoteRecord(r); setNoteText(r.notes || "");
  };
  const saveNote = async () => {
    if (!noteRecord) return;
    const { error } = await supabase.from("attendance_days").update({ notes: noteText || null }).eq("id", noteRecord.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تم حفظ الملاحظة" }); setNoteRecord(null); fetchData(); }
  };

  const openHistory = async (r: AttendanceRecord) => {
    setHistoryRecord(r); setHistoryEvents([]);
    const { data } = await supabase
      .from("attendance_events")
      .select("event_type, event_time, branch_id, notes, status")
      .eq("employee_id", r.employee_id)
      .gte("event_time", `${r.attendance_date}T00:00:00`)
      .lte("event_time", `${r.attendance_date}T23:59:59`)
      .order("event_time", { ascending: true });
    setHistoryEvents(data || []);
  };

  const sendRequestToEmployee = async (r: AttendanceRecord) => {
    const issue = computeIssue(r);
    if (issue.severity === "ok" || !issue.text || issue.text === "—") {
      toast({ title: "لا توجد مشكلة على هذا السجل", description: "لم يتم إرسال أي استفسار." });
      return;
    }
    // Dedup check: same employee + date + same issue text + pending
    const { data: existing } = await supabase
      .from("correction_requests")
      .select("id, reason")
      .eq("employee_id", r.employee_id)
      .eq("attendance_date", r.attendance_date)
      .eq("status", "pending")
      .eq("request_type", "hr_message");
    const dup = (existing || []).some((x: any) => (x.reason || "").includes(issue.text));
    if (dup) {
      toast({ title: "يوجد طلب قائم مسبقاً", description: "لنفس الموظف ونفس التاريخ ونفس المشكلة." });
      return;
    }
    const { error } = await supabase.from("correction_requests").insert({
      employee_id: r.employee_id,
      auth_user_id: user!.id,
      attendance_date: r.attendance_date,
      request_type: "hr_message",
      reason: `المشكلة: ${issue.text}\nرسالة HR: يرجى توضيح السبب أو تقديم طلب تصحيح بصمة.`,
      status: "pending",
    });
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else toast({ title: "تم إرسال الطلب للموظف" });
  };

  // ------------------ Bulk Actions ------------------
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleSelectAllVisible = () => {
    const visibleIds = visibleRows.map(x => x.row.id).filter(id => !id.startsWith("synthetic-"));
    if (visibleIds.every(id => selected.has(id)) && visibleIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };
  const clearSelection = () => setSelected(new Set());

  const bulkRecalc = async () => {
    if (isLocked) { toast({ title: "اليوم مغلق", variant: "destructive" }); return; }
    const ids = Array.from(selected);
    const targets = enriched.filter(x => ids.includes(x.row.id) && x.row.first_check_in && x.row.last_check_out);
    if (targets.length === 0) { toast({ title: "لا يوجد سجلات صالحة لإعادة الحساب" }); return; }
    let ok = 0;
    for (const x of targets) {
      const total = (new Date(x.row.last_check_out!).getTime() - new Date(x.row.first_check_in!).getTime()) / 3600000;
      const { error } = await supabase.from("attendance_days").update({
        total_hours: Number(total.toFixed(2)), updated_at: new Date().toISOString(),
      }).eq("id", x.row.id);
      if (!error) ok++;
    }
    toast({ title: `تمت إعادة حساب ${ok} سجل` });
    clearSelection(); fetchData();
  };

  const bulkAddNote = async () => {
    if (isLocked) { toast({ title: "اليوم مغلق", variant: "destructive" }); return; }
    if (!bulkNote.trim()) return;
    const ids = Array.from(selected);
    let ok = 0;
    for (const id of ids) {
      const { error } = await supabase.from("attendance_days").update({ notes: bulkNote }).eq("id", id);
      if (!error) ok++;
    }
    toast({ title: `تم تحديث ملاحظة ${ok} سجل` });
    setBulkNoteOpen(false); setBulkNote(""); clearSelection(); fetchData();
  };

  const openBulkInquiry = () => {
    const ids = Array.from(selected);
    const all = enriched.filter(x => ids.includes(x.row.id));
    const valid = all.filter(x => x.issue.severity !== "ok" && x.issue.text && x.issue.text !== "—");
    const excluded = all.length - valid.length;
    if (valid.length === 0) {
      toast({
        title: "لا يوجد سجلات تحتوي مشاكل",
        description: "تم استبعاد الموظفين الذين لا توجد لديهم مشكلة.",
        variant: "destructive",
      });
      return;
    }
    if (excluded > 0) {
      toast({ title: `تم استبعاد ${excluded} موظف بدون مشكلة` });
    }
    setBulkInquiryTargets(valid.map(x => ({
      employee_id: x.row.employee_id,
      employee_name: x.row.employees?.full_name,
      attendance_date: x.row.attendance_date,
      issueText: x.issue.text,
    })));
    setBulkInquiryMessage("يرجى توضيح السبب أو تقديم طلب تصحيح بصمة.");
    setBulkInquiryOpen(true);
  };

  const submitBulkInquiry = async () => {
    if (bulkInquiryTargets.length === 0) return;
    const msg = bulkInquiryMessage.trim() || "يرجى توضيح السبب أو تقديم طلب تصحيح بصمة.";
    setBulkInquirySending(true);
    // Fetch existing pending requests for these employees in one query for dedup
    const empIds = Array.from(new Set(bulkInquiryTargets.map(t => t.employee_id)));
    const dates = Array.from(new Set(bulkInquiryTargets.map(t => t.attendance_date)));
    const { data: existing } = await supabase
      .from("correction_requests")
      .select("employee_id, attendance_date, reason")
      .in("employee_id", empIds)
      .in("attendance_date", dates)
      .eq("status", "pending")
      .eq("request_type", "hr_message");
    const existingSet = new Set((existing || []).map((x: any) => `${x.employee_id}|${x.attendance_date}|${x.reason || ""}`));
    let ok = 0, dup = 0, fail = 0;
    for (const t of bulkInquiryTargets) {
      const reason = `المشكلة: ${t.issueText}\nرسالة HR: ${msg}`;
      const isDup = (existing || []).some((x: any) =>
        x.employee_id === t.employee_id &&
        x.attendance_date === t.attendance_date &&
        (x.reason || "").includes(t.issueText)
      );
      if (isDup) { dup++; continue; }
      const { error } = await supabase.from("correction_requests").insert({
        employee_id: t.employee_id,
        auth_user_id: user!.id,
        attendance_date: t.attendance_date,
        request_type: "hr_message",
        reason,
        status: "pending",
      });
      if (!error) ok++; else fail++;
    }
    setBulkInquirySending(false);
    setBulkInquiryOpen(false);
    setBulkInquiryTargets([]);
    setBulkInquiryMessage("");
    clearSelection();
    const parts = [`تم إرسال ${ok} استفسار`];
    if (dup > 0) parts.push(`${dup} مكرر`);
    if (fail > 0) parts.push(`${fail} فشل`);
    toast({ title: parts.join(" • ") });
  };

  // ------------------ Exports ------------------
  // Reports filters
  const [reportFromDate, setReportFromDate] = useState(selectedDate);
  const [reportToDate, setReportToDate] = useState(selectedDate);
  const [reportBranch, setReportBranch] = useState<string>("all");
  const [reportDepartment, setReportDepartment] = useState<string>("all");

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.department) set.add(e.department); });
    return Array.from(set).sort();
  }, [employees]);

  const exportExcel = async (kind: "daily" | "late" | "absent" | "incomplete" = "daily", useReportFilters = false) => {
    let workingRows: { row: AttendanceRecord; issue: { text: string; severity: string; lateMin: number }; dayType: DayType }[] = [];
    if (useReportFilters) {
      // Fetch range from DB
      const { data: att } = await supabase
        .from("attendance_days")
        .select("*, employees!inner(full_name, branch_id, department, job_title, shift_start, shift_end, shift_id, shift:work_shifts(id,name,start_time,end_time,late_tolerance_minutes,overtime_after_minutes,crosses_midnight))")
        .gte("attendance_date", reportFromDate)
        .lte("attendance_date", reportToDate)
        .order("attendance_date", { ascending: true });
      let rows = (att as any[]) || [];
      if (reportBranch !== "all") rows = rows.filter(r => r.branch_id === reportBranch);
      if (reportDepartment !== "all") rows = rows.filter(r => r.employees?.department === reportDepartment);
      workingRows = rows.map((r: AttendanceRecord) => {
        const emp = empById.get(r.employee_id);
        const dt = emp ? getDayType(r.attendance_date, emp, holidays, leaves, weeklyOffDays) : "working";
        return { row: r, issue: computeIssue(r, dt), dayType: dt };
      });
    } else {
      workingRows = enriched as any;
    }
    const rows = workingRows.filter(x => {
      if (kind === "late") return x.row.status === "late" || x.issue.lateMin >= 5;
      if (kind === "absent") return x.row.status === "absent";
      if (kind === "incomplete") return (x.row.first_check_in && !x.row.last_check_out) || (!x.row.first_check_in && x.row.status !== "absent");
      return true;
    });
    if (rows.length === 0) { toast({ title: "لا توجد بيانات للتصدير" }); return; }
    import("xlsx").then(XLSX => {
      const data = rows.map(({ row: r, issue }) => ({
        "الموظف": r.employees?.full_name || "—",
        "القسم": r.employees?.department || "—",
        "المسمى": r.employees?.job_title || "—",
        "الفرع": branches.find(b => b.id === r.branch_id)?.name || "—",
        "التاريخ": r.attendance_date,
        "الدخول": r.first_check_in ? format(new Date(r.first_check_in), "hh:mm a") : "—",
        "الخروج": r.last_check_out ? format(new Date(r.last_check_out), "hh:mm a") : "—",
        "الساعات": r.total_hours || 0,
        "إضافي": r.overtime_hours || 0,
        "تأخير (دقيقة)": issue.lateMin,
        "المشكلة": issue.text,
        "الحالة": tAttendanceStatus(r.status),
        "ملاحظات": r.notes || "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 30 }];
      const sheetName = { daily: "الحضور اليومي", late: "متأخرون", absent: "غائبون", incomplete: "بصمات ناقصة" }[kind];
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      setNextExportBranding({ title: sheetName });
      const fname = useReportFilters ? `${sheetName}_${reportFromDate}_${reportToDate}.xlsx` : `${sheetName}_${selectedDate}.xlsx`;
      XLSX.writeFile(wb, fname);
    });
  };

  return (
    <div className="space-y-4 p-3 md:p-5 w-full max-w-none hr-themed" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              لوحة إدارة الحضور
              {isLocked && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><Lock className="h-3 w-3" /> مغلق</Badge>}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              مركز التشغيل اليومي — متابعة فورية للبصمات والمشاكل
              {lastRefreshAt && (
                <span className="text-xs flex items-center gap-1 text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  آخر تحديث: {format(lastRefreshAt, "hh:mm a")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" dir="ltr" />
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1"><RefreshCw className="h-4 w-4" /> تحديث</Button>
          <Button
            variant={isLocked ? "destructive" : "outline"}
            size="sm"
            onClick={openLockDialog}
            disabled={!canManageLock}
            title={!canManageLock ? "متاح فقط لمدير الموارد البشرية أو الأدمن" : (isLocked ? `مقفل: ${dayLock?.reason || "—"}` : "إغلاق اليوم لمنع التعديلات")}
            className="gap-1"
          >
            {isLocked ? <><Unlock className="h-4 w-4" /> فتح اليوم</> : <><Lock className="h-4 w-4" /> إغلاق اليوم</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBranchDialog(true)} className="gap-1"><Building2 className="h-4 w-4" /> إضافة فرع</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" /> تصدير</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportExcel("daily")}>📊 التقرير اليومي الشامل</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExcel("late")}>تقرير المتأخرين</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExcel("absent")}>تقرير الغياب</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExcel("incomplete")}>تقرير البصمات الناقصة</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Action banner */}
      {isLocked && (
        <Card className="p-3 border-red-300 bg-red-50/50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-red-800">
            <Lock className="h-4 w-4" />
            <span className="font-semibold">اليوم مغلق:</span>
            <span>{dayLock?.reason || "بدون سبب مذكور"}</span>
            <span className="text-xs text-red-700/80">
              · {dayLock?.locked_at ? format(new Date(dayLock.locked_at), "yyyy-MM-dd hh:mm a") : ""}
            </span>
          </div>
          {canManageLock && (
            <Button size="sm" variant="outline" onClick={openLockDialog} className="gap-1">
              <Unlock className="h-3.5 w-3.5" /> فتح اليوم
            </Button>
          )}
        </Card>
      )}
      {kpis.issues > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50/50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="font-semibold text-amber-900">يحتاج متابعة الآن</div>
              <div className="text-sm text-amber-800/80 flex items-center gap-3 flex-wrap">
                {kpis.incomplete > 0 && <span>بصمات غير مكتملة: <b>{kpis.incomplete}</b></span>}
                {kpis.late > 0 && <span>متأخرون: <b>{kpis.late}</b></span>}
                {kpis.absent > 0 && <span>غياب: <b>{kpis.absent}</b></span>}
                {kpis.pendingCorrections > 0 && <span>⏳ طلبات تعديل: <b>{kpis.pendingCorrections}</b></span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setActiveTab("live"); setFilter("issues"); }}>عرض المشاكل</Button>
            {kpis.pendingCorrections > 0 && (
              <Button size="sm" onClick={() => setActiveTab("corrections")}>مراجعة الطلبات ({kpis.pendingCorrections})</Button>
            )}
          </div>
        </Card>
      )}

      {/* KPIs (clickable) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard active={filter === "present"} onClick={() => { setActiveTab("live"); setFilter("present"); }} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} value={kpis.present} label="حضور كامل" tone="emerald" />
        <KpiCard active={filter === "late"} onClick={() => { setActiveTab("live"); setFilter("late"); }} icon={<Clock className="h-5 w-5 text-amber-600" />} value={kpis.late} label="متأخرون" tone="amber" />
        <KpiCard active={filter === "incomplete"} onClick={() => { setActiveTab("live"); setFilter("incomplete"); }} icon={<AlertTriangle className="h-5 w-5 text-orange-600" />} value={kpis.incomplete} label="بصمات غير مكتملة" tone="orange" />
        <KpiCard active={filter === "absent"} onClick={() => { setActiveTab("live"); setFilter("absent"); }} icon={<XCircle className="h-5 w-5 text-red-600" />} value={kpis.absent} label="غياب" tone="red" />
        <KpiCard active={activeTab === "corrections"} onClick={() => setActiveTab("corrections")} icon={<FileText className="h-5 w-5 text-blue-600" />} value={kpis.pendingCorrections} label="طلبات تعديل معلقة" tone="blue" />
      </div>

      {/* Branches strip */}
      {branches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {branches.map(b => {
            const empCount = employees.filter(e => e.branch_id === b.id && e.is_active && !e.is_terminated).length;
            const qrOn = !!companySettings?.hr_require_qr;
            const gpsOn = !!companySettings?.hr_require_gps;
            return (
            <Card key={b.id} className="min-w-[250px] p-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{b.name}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditBranch(b)} className="gap-2"><Pencil className="h-3.5 w-3.5" /> إعدادات الحضور</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings?tab=branches')} className="gap-2"><Building2 className="h-3.5 w-3.5" /> تعديل بيانات الفرع</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeletingBranch(b)} className="gap-2 text-destructive"><Trash2 className="h-3.5 w-3.5" /> حذف</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap gap-1 text-[11px] mb-2">
                <Badge variant={qrOn ? "default" : "outline"} className="gap-1 px-1.5"><QrCode className="h-3 w-3" /> QR {qrOn ? "فعال" : "معطل"}</Badge>
                <Badge variant={gpsOn ? "default" : "outline"} className="gap-1 px-1.5"><MapPin className="h-3 w-3" /> GPS {gpsOn ? "مطلوب" : "غير مطلوب"}</Badge>
                <Badge variant="secondary" className="gap-1 px-1.5"><Users className="h-3 w-3" /> {empCount}</Badge>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" onClick={() => generateQRToken(b)}><QrCode className="h-3 w-3" /> عرض QR</Button>
                <Button size="sm" variant="ghost" className="gap-1 text-xs flex-1" onClick={() => openDisplayPage(b.id)}><Eye className="h-3 w-3" /> شاشة</Button>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="live" className="gap-1"><Eye className="h-3.5 w-3.5" /> العرض المباشر</TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1"><Calendar className="h-3.5 w-3.5" /> العرض الشهري</TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1 relative">
            <FileText className="h-3.5 w-3.5" /> طلبات التعديل
            {kpis.pendingCorrections > 0 && (
              <span className="absolute -top-1 -left-1 h-4 w-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center">{kpis.pendingCorrections}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><Calendar className="h-3.5 w-3.5" /> التقارير</TabsTrigger>
        </TabsList>

        {/* LIVE */}
        <TabsContent value="live" className="mt-4 space-y-3">
          {/* Filter chips + search */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="الكل" count={enriched.length} />
              <FilterChip active={filter === "issues"} onClick={() => setFilter("issues")} label="مشاكل فقط" count={kpis.issues} tone="amber" />
              <FilterChip active={filter === "present"} onClick={() => setFilter("present")} label="حضور كامل" count={kpis.present} tone="emerald" />
              <FilterChip active={filter === "late"} onClick={() => setFilter("late")} label="متأخرون" count={kpis.late} tone="amber" />
              <FilterChip active={filter === "missing_checkin"} onClick={() => setFilter("missing_checkin")} label="بدون دخول" count={enriched.filter(x => !x.row.first_check_in && x.row.status !== "absent").length} tone="orange" />
              <FilterChip active={filter === "missing_checkout"} onClick={() => setFilter("missing_checkout")} label="بدون خروج" count={enriched.filter(x => x.row.first_check_in && !x.row.last_check_out).length} tone="orange" />
              <FilterChip active={filter === "absent"} onClick={() => setFilter("absent")} label="غائبون" count={kpis.absent} tone="red" />
            </div>
            <div className="relative ms-auto">
              <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الموظف، القسم، المسمى..." className="ps-2 pe-8 w-[280px]" />
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border bg-primary/5 border-primary/20">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{selected.size} محدد</span>
              <div className="ms-auto flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="gap-1" onClick={bulkRecalc} disabled={isLocked}><Calculator className="h-3.5 w-3.5" /> إعادة حساب</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkNoteOpen(true)} disabled={isLocked}><MessageSquare className="h-3.5 w-3.5" /> ملاحظة جماعية</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={openBulkInquiry}><Send className="h-3.5 w-3.5" /> استفسار جماعي</Button>
                {canIssuePenalty && (
                  <Button size="sm" variant="destructive" className="gap-1" onClick={openBulkPenalty}>
                    <Shield className="h-3.5 w-3.5" /> إجراء عقابي جماعي
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={clearSelection}><X className="h-3.5 w-3.5" /> إلغاء</Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : visibleRows.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              لا يوجد موظفون يطابقون الفلتر الحالي
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse" dir="rtl">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-3 text-right text-xs font-semibold w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 align-middle"
                          checked={visibleRows.length > 0 && visibleRows.filter(x => !x.row.id.startsWith("synthetic-")).every(x => selected.has(x.row.id))}
                          onChange={toggleSelectAllVisible}
                        />
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-semibold min-w-[200px] whitespace-nowrap">الموظف</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">الفرع</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">القسم</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">المسمى</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">الدخول</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">الخروج</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">الساعات</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">التأخير</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">إضافي</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">المشكلة</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">الحالة</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">ملاحظات</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(({ row: r, issue }) => {
                      const branchName = branches.find(b => b.id === r.branch_id)?.name || "—";
                      const isSynthetic = r.id.startsWith("synthetic-");
                      return (
                        <tr key={r.id} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors", rowAccentClass(r.status))}>
                          <td className="px-3 py-3 align-middle">
                            {!isSynthetic && (
                              <input type="checkbox" className="h-4 w-4" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                            )}
                          </td>
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                                {(r.employees?.full_name || "?").slice(0, 1)}
                              </div>
                              <span>{r.employees?.full_name || "—"}</span>
                              {r.is_manually_adjusted && <Badge variant="outline" className="text-[10px] h-4 px-1">معدّل يدوياً</Badge>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm">{branchName}</td>
                          <td className="px-3 py-3 text-sm">{r.employees?.department || "—"}</td>
                          <td className="px-3 py-3 text-sm">{r.employees?.job_title || "—"}</td>
                          <td className="px-3 py-3 tabular-nums whitespace-nowrap">{r.first_check_in ? format(new Date(r.first_check_in), "hh:mm a") : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-3 tabular-nums whitespace-nowrap">{r.last_check_out ? format(new Date(r.last_check_out), "hh:mm a") : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-3 tabular-nums">{r.total_hours?.toFixed(1) || "0"}</td>
                          <td className={cn("px-3 py-3 tabular-nums", issue.lateMin > 0 && "text-amber-700 font-semibold")}>
                            {issue.lateMin > 0 ? `${issue.lateMin} د` : "—"}
                          </td>
                          <td className="px-3 py-3 tabular-nums">{r.overtime_hours?.toFixed(1) || "0"}</td>
                          <td className="px-3 py-3">
                            <span className={cn("text-xs",
                              issue.severity === "err" && "text-red-600 font-medium",
                              issue.severity === "warn" && "text-amber-700 font-medium",
                              issue.severity === "ok" && "text-muted-foreground"
                            )}>{issue.text}</span>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={cn("text-xs", statusBadgeClass(r.status))}>
                              {tAttendanceStatus(r.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground max-w-[180px] truncate" title={r.notes || ""}>{r.notes || "—"}</td>
                          <td className="px-3 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 px-2"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditRecord(r)} className="gap-2"><Pencil className="h-3.5 w-3.5" /> تعديل يدوي</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => recalcRecord(r)} className="gap-2"><Calculator className="h-3.5 w-3.5" /> إعادة حساب الساعات</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openNote(r)} className="gap-2"><MessageSquare className="h-3.5 w-3.5" /> إضافة/تعديل ملاحظة</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openHistory(r)} className="gap-2"><History className="h-3.5 w-3.5" /> سجل بصمات اليوم</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => sendRequestToEmployee(r)} className="gap-2"><Send className="h-3.5 w-3.5" /> إرسال استفسار للموظف</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openHRMessageFor(r, "info")} className="gap-2"><MessageSquare className="h-3.5 w-3.5" /> إرسال رسالة HR</DropdownMenuItem>
                                {canIssuePenalty && (
                                  <DropdownMenuItem
                                    onClick={() => openHRMessageFor(r, "penalty")}
                                    className="gap-2 text-red-600 focus:text-red-700"
                                  >
                                    <Shield className="h-3.5 w-3.5" /> إصدار إجراء عقابي
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* MONTHLY VIEW */}
        <TabsContent value="monthly" className="mt-4">
          <MonthlyAttendanceTab employees={employees} />
        </TabsContent>

        {/* CORRECTIONS */}
        <TabsContent value="corrections" className="mt-4 space-y-2">
          {corrections.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500/50" />
              لا يوجد طلبات تعديل معلقة
            </Card>
          ) : (
            corrections.map(req => (
              <Card key={req.id} className="p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <span className="font-medium">{(req as any).employees?.full_name}</span>
                    <span className="text-xs text-muted-foreground mr-2">• {fmtDateDisplay(req.attendance_date)}</span>
                  </div>
                  <Badge variant="outline">{tRequestType(req.request_type)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{req.reason}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1" onClick={() => { setReviewDialog(req); setReviewNotes(""); }}>
                    <Eye className="h-3 w-3" /> مراجعة
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">فلاتر التقرير</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
                <Input type="date" value={reportFromDate} onChange={e => setReportFromDate(e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
                <Input type="date" value={reportToDate} onChange={e => setReportToDate(e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
                <Select value={reportBranch} onValueChange={setReportBranch}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">القسم</label>
                <Select value={reportDepartment} onValueChange={setReportDepartment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأقسام</SelectItem>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ReportCard icon={<FileText className="h-5 w-5" />} title="التقرير الشامل (مفلتر)" desc="فترة + فرع + قسم — كل التفاصيل" onClick={() => exportExcel("daily", true)} />
            <ReportCard icon={<Clock className="h-5 w-5 text-amber-600" />} title="تقرير المتأخرين" desc="ضمن الفترة والفلاتر المختارة" onClick={() => exportExcel("late", true)} />
            <ReportCard icon={<XCircle className="h-5 w-5 text-red-600" />} title="تقرير الغياب" desc="ضمن الفترة والفلاتر المختارة" onClick={() => exportExcel("absent", true)} />
            <ReportCard icon={<AlertTriangle className="h-5 w-5 text-orange-600" />} title="تقرير البصمات الناقصة" desc="ضمن الفترة والفلاتر المختارة" onClick={() => exportExcel("incomplete", true)} />
          </div>
          <div className="text-xs text-muted-foreground border-t pt-3">
            💡 لتقرير اليوم الحالي فقط: استخدم زر "تصدير" بأعلى الصفحة.
          </div>
        </TabsContent>
      </Tabs>

      {/* ============== Dialogs ============== */}

      {/* Add Branch */}
      <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> إضافة فرع جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground mb-1 block">اسم الفرع *</label><Input value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">العنوان</label><Input value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground mb-1 block">Latitude *</label><Input type="number" step="any" value={branchForm.latitude} onChange={e => setBranchForm(p => ({ ...p, latitude: e.target.value }))} dir="ltr" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Longitude *</label><Input type="number" step="any" value={branchForm.longitude} onChange={e => setBranchForm(p => ({ ...p, longitude: e.target.value }))} dir="ltr" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground mb-1 block">النطاق (متر)</label><Input type="number" value={branchForm.radius_meters} onChange={e => setBranchForm(p => ({ ...p, radius_meters: e.target.value }))} dir="ltr" /></div>
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(pos => {
                setBranchForm(p => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
                toast({ title: "تم تحديد الموقع" });
              }, () => toast({ title: "تعذر تحديد الموقع", variant: "destructive" }), { enableHighAccuracy: true, timeout: 15000 });
            }}><MapPin className="h-3.5 w-3.5" /> استخدام موقعي</Button>
          </div>
          <DialogFooter><Button onClick={createBranch} className="w-full">إنشاء الفرع</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /> رمز QR</DialogTitle></DialogHeader>
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium">{selectedBranchForQR?.name}</p>
            <div className="bg-white rounded-xl p-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrToken)}&format=svg`} alt="QR" className="w-[250px] h-[250px] mx-auto" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => { navigator.clipboard.writeText(qrToken); toast({ title: "تم النسخ" }); }}><Copy className="h-3.5 w-3.5" /> نسخ</Button>
              <Button variant="outline" className="flex-1 gap-1" onClick={() => selectedBranchForQR && openDisplayPage(selectedBranchForQR.id)}><Eye className="h-3.5 w-3.5" /> شاشة</Button>
            </div>
            <Button className="w-full gap-1" onClick={() => selectedBranchForQR && qrToken && printQRCode(selectedBranchForQR.name, qrToken)}><Printer className="h-3.5 w-3.5" /> طباعة A4</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>مراجعة طلب التعديل</DialogTitle></DialogHeader>
          {reviewDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">الموظف</p><p className="font-medium">{(reviewDialog as any).employees?.full_name}</p></div>
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">التاريخ</p><p className="font-medium">{fmtDateDisplay(reviewDialog.attendance_date)}</p></div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">السبب</p><p className="text-sm">{reviewDialog.reason}</p></div>
              <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="ملاحظات HR..." rows={2} />
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="gap-1 flex-1 text-red-600 border-red-200" onClick={() => reviewDialog && handleCorrection(reviewDialog.id, "rejected")}><X className="h-4 w-4" /> رفض</Button>
            <Button className="gap-1 flex-1" onClick={() => reviewDialog && handleCorrection(reviewDialog.id, "approved")}><Check className="h-4 w-4" /> قبول</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit record */}
      <Dialog open={!!editRecord} onOpenChange={(o) => !o && setEditRecord(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> تعديل سجل {editRecord?.employees?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground mb-1 block">الدخول</label><Input type="time" value={editRecordForm.first_check_in} onChange={e => setEditRecordForm(p => ({ ...p, first_check_in: e.target.value }))} dir="ltr" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">الخروج</label><Input type="time" value={editRecordForm.last_check_out} onChange={e => setEditRecordForm(p => ({ ...p, last_check_out: e.target.value }))} dir="ltr" /></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
              <Select value={editRecordForm.status} onValueChange={(v) => setEditRecordForm(p => ({ ...p, status: v }))}>
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
            <div><label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label><Textarea rows={2} value={editRecordForm.notes} onChange={e => setEditRecordForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> سيتم وسم السجل كمُعدَّل يدوياً وحفظ تغيير في سجل التدقيق.
            </div>
          </div>
          <DialogFooter><Button onClick={saveEditRecord} className="w-full">حفظ التعديل</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note */}
      <Dialog open={!!noteRecord} onOpenChange={(o) => !o && setNoteRecord(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> ملاحظة على سجل {noteRecord?.employees?.full_name}</DialogTitle></DialogHeader>
          <Textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="اكتب الملاحظة هنا..." />
          <DialogFooter><Button onClick={saveNote} className="w-full">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyRecord} onOpenChange={(o) => !o && setHistoryRecord(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> سجل بصمات {historyRecord?.employees?.full_name} - {historyRecord && fmtDateDisplay(historyRecord.attendance_date)}</DialogTitle></DialogHeader>
          {historyEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا توجد بصمات مسجلة لهذا اليوم</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {historyEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={e.event_type === "check_in" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>
                      {e.event_type === "check_in" ? "دخول" : "خروج"}
                    </Badge>
                    <span className="font-mono text-sm">{format(new Date(e.event_time), "hh:mm:ss a")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{e.notes || e.status || ""}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Branch */}
      <Dialog open={!!editingBranch} onOpenChange={(o) => !o && setEditingBranch(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /> إعدادات الحضور – {editingBranch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {editingBranch?.address || "بدون عنوان"}</div>
              <button type="button" onClick={() => navigate('/settings?tab=branches')} className="text-primary hover:underline">تعديل اسم الفرع والإحداثيات من إدارة الفروع ←</button>
            </div>

            <div className="text-xs text-muted-foreground -mb-1">إعدادات البصمة (تطبق على كل الفروع):</div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-2"><QrCode className="h-4 w-4" /> تفعيل QR للبصمة</div>
                <div className="text-[11px] text-muted-foreground">يتطلب مسح رمز معلّق في الفرع</div>
              </div>
              <Switch checked={!!companySettings?.hr_require_qr} onCheckedChange={(v) => updateCompanySettings({ hr_require_qr: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> تفعيل GPS للبصمة</div>
                <div className="text-[11px] text-muted-foreground">يتحقق من وجود الموظف داخل نطاق الفرع</div>
              </div>
              <Switch checked={!!companySettings?.hr_require_gps} onCheckedChange={(v) => updateCompanySettings({ hr_require_gps: v })} />
            </div>

            <div className={cn("rounded-lg border p-3 space-y-1", !companySettings?.hr_require_gps && "opacity-60")}>
              <label className="text-xs text-muted-foreground">نطاق الفرع (متر) – خاص بهذا الفرع</label>
              <Input
                type="number"
                value={editForm.radius_meters}
                onChange={e => setEditForm(p => ({ ...p, radius_meters: e.target.value }))}
                dir="ltr"
                placeholder="مثل 150"
                disabled={!companySettings?.hr_require_gps}
              />
              <p className="text-[11px] text-muted-foreground">يستخدم فقط عند تفعيل GPS</p>
            </div>
          </div>
          <DialogFooter><Button onClick={updateBranch} className="w-full">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch */}
      <Dialog open={!!deletingBranch} onOpenChange={(o) => { if (!o) { setDeletingBranch(null); setDeleteConfirmName(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> حذف {deletingBranch?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-destructive/10 rounded-lg p-3 text-sm">⚠️ سيتم تعطيل الفرع. السجلات السابقة لن تُحذف.</div>
            <div><label className="text-xs text-muted-foreground mb-1 block">اكتب: <strong>{deletingBranch?.name}</strong></label><Input value={deleteConfirmName} onChange={e => setDeleteConfirmName(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="destructive" onClick={deleteBranch} disabled={deleteConfirmName !== deletingBranch?.name} className="w-full gap-1"><Trash2 className="h-4 w-4" /> حذف</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Note */}
      <Dialog open={bulkNoteOpen} onOpenChange={setBulkNoteOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> ملاحظة جماعية على {selected.size} سجل</DialogTitle></DialogHeader>
          <Textarea rows={4} value={bulkNote} onChange={e => setBulkNote(e.target.value)} placeholder="اكتب الملاحظة المشتركة..." />
          <DialogFooter><Button onClick={bulkAddNote} className="w-full" disabled={!bulkNote.trim()}>تطبيق على الكل</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HR Message / Penalty Dialog */}
      <SendHRMessageDialog
        open={hrMsgOpen}
        onOpenChange={setHrMsgOpen}
        authUserId={user?.id || ""}
        targets={hrMsgTargets}
        defaultType={hrMsgDefaultType}
        canIssuePenalty={canIssuePenalty}
        onSent={() => { fetchData(); clearSelection(); }}
      />

      {/* Bulk Inquiry */}
      <Dialog open={bulkInquiryOpen} onOpenChange={(o) => { if (!bulkInquirySending) setBulkInquiryOpen(o); }}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              إرسال استفسار جماعي ({bulkInquiryTargets.length} موظف)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-xs">
                  <tr>
                    <th className="text-right p-2">الموظف</th>
                    <th className="text-right p-2">التاريخ</th>
                    <th className="text-right p-2">المشكلة المكتشفة</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkInquiryTargets.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{t.employee_name || "—"}</td>
                      <td className="p-2 tabular-nums">{t.attendance_date}</td>
                      <td className="p-2 text-red-700">{t.issueText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">رسالة HR (اختياري)</label>
              <Textarea
                rows={3}
                value={bulkInquiryMessage}
                onChange={e => setBulkInquiryMessage(e.target.value)}
                placeholder="يرجى توضيح السبب أو تقديم طلب تصحيح بصمة."
              />
              <p className="text-xs text-muted-foreground mt-1">
                الرسالة النهائية للموظف ستكون: «المشكلة: [نص المشكلة] — رسالة HR: [نصك]»
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkInquiryOpen(false)} disabled={bulkInquirySending}>إلغاء</Button>
            <Button onClick={submitBulkInquiry} disabled={bulkInquirySending || bulkInquiryTargets.length === 0} className="gap-1">
              <Send className="h-4 w-4" />
              {bulkInquirySending ? "جاري الإرسال..." : "إرسال الاستفسارات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Lock / Unlock Dialog */}
      <Dialog open={lockDialogOpen} onOpenChange={(o) => !lockBusy && setLockDialogOpen(o)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lockDialogMode === "lock" ? <><Lock className="h-4 w-4" /> إغلاق يوم الحضور</> : <><Unlock className="h-4 w-4" /> فتح يوم الحضور</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-muted/40 rounded p-2">
              <div>التاريخ: <span className="font-semibold">{selectedDate}</span></div>
              {lockDialogMode === "unlock" && dayLock && (
                <div className="text-xs text-muted-foreground mt-1">
                  أُغلق في: {format(new Date(dayLock.locked_at), "yyyy-MM-dd hh:mm a")}
                  {dayLock.reason && <> — السبب: {dayLock.reason}</>}
                </div>
              )}
            </div>
            {lockDialogMode === "lock" && selectedDate >= new Date().toISOString().split("T")[0] && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  تنبيه: اليوم {selectedDate === new Date().toISOString().split("T")[0] ? "الحالي" : "مستقبلي"}!
                </div>
                <p className="text-amber-800 text-xs leading-relaxed">
                  إذا أغلقت هذا اليوم الآن:
                  <br />• <strong>الموظفون لن يستطيعوا تسجيل البصمة</strong> من تطبيق الموظف.
                  <br />• <strong>أجهزة ZKTeco لن تستطيع إرسال بصمات</strong> لهذا اليوم.
                  <br />• لن يستطيعوا إنشاء طلبات تصحيح.
                  <br /><br />
                  يُفضّل قفل اليوم <strong>بعد انتهاء الدوام فقط</strong>.
                </p>
                <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer pt-1 border-t border-amber-300">
                  <input
                    type="checkbox"
                    checked={lockAcknowledged}
                    onChange={(e) => setLockAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>أُقرّ بأنني فهمت أن الموظفين لن يتمكنوا من البصمة، وأن الدوام انتهى فعلاً.</span>
                </label>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">
                {lockDialogMode === "lock" ? "سبب الإغلاق (اختياري)" : "سبب الفتح (إلزامي)"}
              </label>
              <Textarea
                value={lockReasonInput}
                onChange={(e) => setLockReasonInput(e.target.value)}
                placeholder={lockDialogMode === "lock" ? "مثال: نهاية شهر — اعتماد الحضور للراتب" : "مثال: تصحيح بصمة منسية للموظف..."}
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {lockDialogMode === "lock"
                ? "بعد الإغلاق سيتم منع تعديل/إنشاء بصمات وطلبات تصحيح لهذا اليوم على مستوى قاعدة البيانات."
                : "سيتم تسجيل هويتك ووقت الفتح والسبب في سجل التدقيق."}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLockDialogOpen(false)} disabled={lockBusy}>إلغاء</Button>
            <Button
              variant={lockDialogMode === "lock" ? "destructive" : "default"}
              onClick={submitLockAction}
              disabled={
                lockBusy ||
                (lockDialogMode === "unlock" && !lockReasonInput.trim()) ||
                (lockDialogMode === "lock" && selectedDate >= new Date().toISOString().split("T")[0] && !lockAcknowledged)
              }
              className="gap-1"
            >
              {lockBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (lockDialogMode === "lock" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />)}
              {lockDialogMode === "lock" ? "إغلاق اليوم" : "فتح اليوم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Subcomponents ----------------

function KpiCard({ icon, value, label, onClick, active, tone }: { icon: React.ReactNode; value: number; label: string; onClick: () => void; active?: boolean; tone: "emerald" | "amber" | "orange" | "red" | "blue" }) {
  const toneRing = {
    emerald: "ring-emerald-400",
    amber: "ring-amber-400",
    orange: "ring-orange-400",
    red: "ring-red-400",
    blue: "ring-blue-400",
  }[tone];
  return (
    <button onClick={onClick} className={cn(
      "text-right rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5",
      active && `ring-2 ${toneRing}`
    )}>
      <div className="flex items-center justify-between mb-1">
        {icon}
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

function FilterChip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: "emerald" | "amber" | "orange" | "red" }) {
  const toneClass = active ? {
    emerald: "bg-emerald-600 text-white border-emerald-600",
    amber: "bg-amber-600 text-white border-amber-600",
    orange: "bg-orange-600 text-white border-orange-600",
    red: "bg-red-600 text-white border-red-600",
  }[tone || "emerald"] : "";
  return (
    <button onClick={onClick} className={cn(
      "px-3 py-1.5 rounded-full text-xs border transition-colors",
      active ? (tone ? toneClass : "bg-primary text-primary-foreground border-primary") : "bg-muted/50 hover:bg-muted text-foreground border-border"
    )}>
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function ReportCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <Card className="p-4 hover:shadow-md transition-all cursor-pointer" onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">{icon}</div>
        <div className="flex-1">
          <div className="font-semibold mb-0.5">{title}</div>
          <div className="text-xs text-muted-foreground mb-2">{desc}</div>
          <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> تصدير</Button>
        </div>
      </div>
    </Card>
  );
}
