import { useState, useEffect, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay, cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Loader2, Pencil, AlertCircle, Search, Calendar, Clock, XCircle,
  AlertTriangle, RefreshCw, CheckCircle2,
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

type QuickFilter = "all" | "missing_checkout" | "missing_checkin" | "late" | "absent" | "present";

function pad2(n: number) { return String(n).padStart(2, "0"); }

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
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit dialog
  const [editing, setEditing] = useState<MonthRow | null>(null);
  const [form, setForm] = useState({ first_check_in: "", last_check_out: "", status: "present", notes: "", reason: "" });
  const [saving, setSaving] = useState(false);

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
  };

  const saveEdit = async () => {
    if (!editing || !user) return;
    if (!form.reason.trim()) {
      toast({ title: "سبب التعديل إلزامي", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const buildTs = (hhmm: string) => {
        if (!hhmm) return null;
        const [h, m] = hhmm.split(":").map(Number);
        const d = new Date(editing.attendance_date);
        d.setHours(h || 0, m || 0, 0, 0);
        return d.toISOString();
      };
      const ci = buildTs(form.first_check_in);
      const co = buildTs(form.last_check_out);
      let total = 0;
      if (ci && co) total = Math.max(0, (new Date(co).getTime() - new Date(ci).getTime()) / 3600000);
      // Recompute overtime based on employee's daily work hours (default 8)
      let dailyHours = 8;
      try {
        const { data: emp } = await supabase
          .from("employees")
          .select("work_hours_per_day")
          .eq("id", editing.employee_id)
          .maybeSingle();
        if (emp?.work_hours_per_day) dailyHours = Number(emp.work_hours_per_day) || 8;
      } catch { /* fallback to 8 */ }
      const overtime = ci && co ? Math.max(0, total - dailyHours) : 0;
      const { error } = await supabase.from("attendance_days").update({
        first_check_in: ci,
        last_check_out: co,
        total_hours: Number(total.toFixed(2)),
        overtime_hours: Number(overtime.toFixed(2)),
        status: form.status,
        notes: form.notes || null,
        is_manually_adjusted: true,
        updated_at: new Date().toISOString(),
      }).eq("id", editing.id);
      if (error) throw error;
      await supabase.from("attendance_audit_logs").insert({
        table_name: "attendance_days",
        record_id: editing.id,
        action: "update",
        new_values: { ...form } as any,
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