import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay, cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Loader2, Pencil, AlertCircle, Search, Calendar, Clock, XCircle,
  AlertTriangle, RefreshCw, CheckCircle2, Plus, Trash2,
} from "lucide-react";

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
  status: string;
  notes: string | null;
  is_manually_adjusted: boolean | null;
  employees?: { full_name: string };
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
};

const BREAK_TYPE_LABEL: Record<BreakDraft["break_type"], string> = {
  prayer: "خروج للصلاة",
  personal: "خروج خاص",
  meal: "استراحة طعام",
  external_task: "مهمة عمل خارجية",
  other: "أخرى",
};

type QuickFilter = "all" | "missing_checkout" | "missing_checkin" | "late" | "absent" | "present";

function pad2(n: number) { return String(n).padStart(2, "0"); }

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
};
const STATUS_LABEL: Record<string, string> = {
  present: "حاضر", late: "متأخر", incomplete: "بصمة ناقصة",
  absent: "غائب", leave: "إجازة", holiday: "عطلة",
};

export default function MonthlyAttendanceTab({ employees }: { employees: EmployeeLite[] }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const now = new Date();
  const initialYear = Number(searchParams.get("year")) || now.getFullYear();
  const initialMonth = Number(searchParams.get("month")) || (now.getMonth() + 1);
  const initialEmployee = searchParams.get("employee") || "all";
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(initialMonth);
  const [employeeId, setEmployeeId] = useState<string>(initialEmployee);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit dialog
  const [editing, setEditing] = useState<MonthRow | null>(null);
  const [form, setForm] = useState({ first_check_in: "", last_check_out: "", status: "present", notes: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [breaks, setBreaks] = useState<BreakDraft[]>([]);
  const [breaksLoading, setBreaksLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { from, to } = monthBounds(year, month);
      let q = supabase
        .from("attendance_days")
        .select("id, employee_id, attendance_date, first_check_in, last_check_out, total_hours, overtime_hours, status, notes, is_manually_adjusted, employees!inner(full_name)")
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .order("attendance_date", { ascending: false })
        .order("first_check_in", { ascending: true, nullsFirst: false });
      if (employeeId !== "all") q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ في التحميل", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, year, month, employeeId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === "missing_checkout") return r.first_check_in && !r.last_check_out;
      if (filter === "missing_checkin") return !r.first_check_in && r.status !== "absent";
      if (filter === "late") return r.status === "late";
      if (filter === "absent") return r.status === "absent";
      if (filter === "present") return r.status === "present";
      return true;
    });
  }, [rows, filter]);

  const counts = useMemo(() => ({
    total: rows.length,
    missing_checkout: rows.filter(r => r.first_check_in && !r.last_check_out).length,
    missing_checkin: rows.filter(r => !r.first_check_in && r.status !== "absent").length,
    late: rows.filter(r => r.status === "late").length,
    absent: rows.filter(r => r.status === "absent").length,
    present: rows.filter(r => r.status === "present").length,
  }), [rows]);

  const filteredEmployees = useMemo(() => {
    const s = employeeSearch.trim();
    if (!s) return employees;
    return employees.filter(e => e.full_name.toLowerCase().includes(s.toLowerCase()));
  }, [employees, employeeSearch]);

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
    supabase
      .from("attendance_breaks")
      .select("id, break_type, break_out, break_in, reason")
      .eq("attendance_day_id", r.id)
      .order("break_out", { ascending: true })
      .then(({ data }) => {
        setBreaks(
          ((data as any[]) || []).map((b) => ({
            id: b.id,
            break_type: (b.break_type as BreakDraft["break_type"]) || "other",
            out: b.break_out ? format(new Date(b.break_out), "HH:mm") : "",
            in: b.break_in ? format(new Date(b.break_in), "HH:mm") : "",
            reason: b.reason || "",
          })),
        );
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
      gross = Math.floor((co.getTime() - ci.getTime()) / 60000);
    }
    let breakMin = 0;
    for (const b of breaks) {
      if (b._deleted) continue;
      const bo = combineDT(editing.attendance_date, b.out, ci);
      const bi = combineDT(editing.attendance_date, b.in, bo || ci);
      if (bo && bi && bi.getTime() > bo.getTime()) {
        breakMin += Math.floor((bi.getTime() - bo.getTime()) / 60000);
      }
    }
    return { gross, breakMin, net: Math.max(0, gross - breakMin) };
  }, [editing, form.first_check_in, form.last_check_out, breaks, combineDT]);

  const fmtHM = (min: number) => `${Math.floor(min / 60)} س ${min % 60} د`;

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
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">الموظف</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <div className="p-2 sticky top-0 bg-popover z-10">
                  <Input
                    placeholder="ابحث باسم الموظف..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {filteredEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
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

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <CounterCard label="إجمالي السجلات" value={counts.total} icon={<Calendar className="h-4 w-4" />} tone="navy" />
        <CounterCard label="بدون خروج" value={counts.missing_checkout} icon={<AlertTriangle className="h-4 w-4" />} tone="orange" />
        <CounterCard label="بدون دخول" value={counts.missing_checkin} icon={<AlertTriangle className="h-4 w-4" />} tone="orange" />
        <CounterCard label="تأخير" value={counts.late} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <CounterCard label="غياب" value={counts.absent} icon={<XCircle className="h-4 w-4" />} tone="red" />
      </div>

      {/* Quick filters */}
      <div className="flex gap-1 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="الكل" count={counts.total} />
        <FilterChip active={filter === "missing_checkout"} onClick={() => setFilter("missing_checkout")} label="بدون خروج" count={counts.missing_checkout} tone="orange" />
        <FilterChip active={filter === "missing_checkin"} onClick={() => setFilter("missing_checkin")} label="بدون دخول" count={counts.missing_checkin} tone="orange" />
        <FilterChip active={filter === "late"} onClick={() => setFilter("late")} label="متأخر" count={counts.late} tone="amber" />
        <FilterChip active={filter === "absent"} onClick={() => setFilter("absent")} label="غياب" count={counts.absent} tone="red" />
        <FilterChip active={filter === "present"} onClick={() => setFilter("present")} label="حضور كامل" count={counts.present} tone="emerald" />
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
          <Table>
            <TableHeader>
              <TableRow className="bg-[#0D1B2E] hover:bg-[#0D1B2E]">
                <TableHead className="text-white text-right">الموظف</TableHead>
                <TableHead className="text-white text-right">التاريخ</TableHead>
                <TableHead className="text-white text-right">اليوم</TableHead>
                <TableHead className="text-white text-right">دخول</TableHead>
                <TableHead className="text-white text-right">خروج</TableHead>
                <TableHead className="text-white text-right">ساعات</TableHead>
                <TableHead className="text-white text-right">إضافي</TableHead>
                <TableHead className="text-white text-right">الحالة</TableHead>
                <TableHead className="text-white text-right">المشكلة</TableHead>
                <TableHead className="text-white text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const issue = !r.first_check_in && r.status !== "absent" ? "بدون دخول"
                  : r.first_check_in && !r.last_check_out ? "بدون خروج"
                  : r.status === "late" ? "تأخير"
                  : r.status === "absent" ? "غياب"
                  : "—";
                return (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium">{r.employees?.full_name || "—"}</TableCell>
                    <TableCell className="tabular-nums">{fmtDateDisplay(r.attendance_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtWeekday(r.attendance_date)}</TableCell>
                    <TableCell className="tabular-nums">{fmtTime(r.first_check_in)}</TableCell>
                    <TableCell className="tabular-nums">{fmtTime(r.last_check_out)}</TableCell>
                    <TableCell className="tabular-nums">{(r.total_hours ?? 0).toFixed(1)}</TableCell>
                    <TableCell className="tabular-nums">{(r.overtime_hours ?? 0).toFixed(1)}</TableCell>
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
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} className="h-7 gap-1">
                        <Pencil className="h-3.5 w-3.5" /> تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                <TableCell colSpan={5} className="text-right">
                  الإجمالي ({filtered.length} سجل)
                </TableCell>
                <TableCell className="tabular-nums">
                  {filtered.reduce((s, r) => s + (Number(r.total_hours) || 0), 0).toFixed(1)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {filtered.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0).toFixed(1)}
                </TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              تعديل يدوي — {editing?.employees?.full_name} — {editing && fmtDateDisplay(editing.attendance_date)}
            </DialogTitle>
          </DialogHeader>
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
            {/* Sessions (multi-break) editor */}
            <div className="border rounded-md p-2 bg-muted/20 space-y-2">
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
                                  // drop unsaved rows entirely
                                  .filter((x) => !(x._deleted && !x.id)),
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
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t">
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
              </div>
            </div>
            <div>
              <label className="text-xs text-red-600 mb-1 block">سبب التعديل (إلزامي) *</label>
              <Textarea rows={2} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="اكتب سبب التعديل هنا..." />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> سيتم وسم السجل كمعدّل يدوياً وحفظ السبب في سجل التدقيق.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} disabled={saving} className="w-full gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CounterCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "navy" | "orange" | "amber" | "red" }) {
  const toneCls: Record<string, string> = {
    navy: "bg-[#0D1B2E] text-white",
    orange: "bg-orange-50 text-orange-700 border border-orange-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <div className={cn("rounded-lg p-3 flex items-center justify-between", toneCls[tone])}>
      <div>
        <div className="text-xs opacity-80">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
      <div className="opacity-70">{icon}</div>
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