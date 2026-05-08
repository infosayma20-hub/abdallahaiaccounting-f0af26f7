import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Calendar, Trash2 } from "lucide-react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  useManagerBranches,
  useShiftTemplates,
  useManagedBranchEmployees,
  useWeekRoster,
  useUpsertRoster,
  useDeleteRosterEntry,
  type RosterEntry,
  type ShiftTemplate,
} from "@/hooks/useBranchRoster";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";

function startOfWeek(d: Date): Date {
  // Saturday start (Arab work week)
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 6 ? 0 : day + 1;
  const out = new Date(d);
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const o = new Date(d);
  o.setDate(o.getDate() + n);
  return o;
}
const DAY_NAMES = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const STATUS_OPTIONS: { value: RosterEntry["status"]; label: string; color: string }[] = [
  { value: "scheduled", label: "دوام", color: "" },
  { value: "off", label: "OFF", color: "#94A3B8" },
  { value: "leave", label: "إجازة", color: "#F59E0B" },
  { value: "coverage", label: "تغطية", color: "#10B981" },
];

type CellState = {
  employeeId: string;
  date: string;
  existing: RosterEntry | null;
};

export default function BranchRosterPage() {
  const { user } = useAuth();
  const { data: branches = [], isLoading: bLoading, error: bError } = useManagerBranches();
  const [branchId, setBranchId] = useState<string>("");
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [isHrAdmin, setIsHrAdmin] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = (data || []).map((r: any) => r.role);
      setIsHrAdmin(roles.length === 0 || roles.includes("admin") || roles.includes("hr_manager"));
    });
  }, [user?.id]);

  const activeBranch = branches.find((b) => b.branch_id === branchId) || branches[0];
  const effectiveBranchId = activeBranch?.branch_id;
  const companyId = activeBranch?.company_id;

  const weekStart = fmtISO(weekAnchor);
  const weekEnd = fmtISO(addDays(weekAnchor, 6));

  const { data: templates = [] } = useShiftTemplates(companyId);
  const { data: employees = [] } = useManagedBranchEmployees(effectiveBranchId);
  const { data: roster = [], isLoading: rLoading } = useWeekRoster(effectiveBranchId, weekStart, weekEnd);

  const upsert = useUpsertRoster();
  const del = useDeleteRosterEntry();

  const rosterMap = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    roster.forEach((r) => m.set(`${r.employee_id}|${r.roster_date}`, r));
    return m;
  }, [roster]);

  const [cell, setCell] = useState<CellState | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [onlyUnset, setOnlyUnset] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Mobile day index (0..6) within the current week
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(() => {
    const today = new Date();
    const ws = startOfWeek(today);
    const diff = Math.round((today.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(6, diff));
  });

  const DEPT_UNSET = "غير محدد";
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e: any) => set.add((e.department || "").trim() || DEPT_UNSET));
    return Array.from(set).sort((a, b) => (a === DEPT_UNSET ? 1 : b === DEPT_UNSET ? -1 : a.localeCompare(b, "ar")));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees as any[]).filter((e) => {
      const dept = (e.department || "").trim() || DEPT_UNSET;
      if (deptFilter !== "all" && dept !== deptFilter) return false;
      if (onlyUnset) {
        const d = fmtISO(addDays(weekAnchor, mobileDayIdx));
        if (rosterMap.get(`${e.id}|${d}`)) return false;
      }
      if (!q) return true;
      return (
        (e.full_name || "").toLowerCase().includes(q) ||
        (e.position || "").toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q)
      );
    });
  }, [employees, search, deptFilter, onlyUnset, weekAnchor, mobileDayIdx, rosterMap]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredEmployees.forEach((e: any) => {
      const dept = (e.department || "").trim() || DEPT_UNSET;
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(e);
    });
    return Array.from(groups.entries()).sort((a, b) =>
      a[0] === DEPT_UNSET ? 1 : b[0] === DEPT_UNSET ? -1 : a[0].localeCompare(b[0], "ar")
    );
  }, [filteredEmployees]);

  if (bLoading) return <div className="p-8 text-center">جار التحميل…</div>;
  if (bError) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <Calendar className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">فشل تحميل الفروع</h2>
        <p className="text-sm text-muted-foreground mb-2">{(bError as any)?.message || "خطأ غير معروف"}</p>
        <p className="text-xs text-muted-foreground">راجع الكونسول أو تواصل مع الدعم الفني.</p>
      </div>
    );
  }
  if (!branches.length) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">
          {isHrAdmin ? "لا توجد فروع مُعرّفة بعد" : "لا يوجد فروع مرتبطة بحسابك"}
        </h2>
        <p className="text-muted-foreground mb-4">
          {isHrAdmin
            ? "أنشئ فرعاً واحداً على الأقل لتبدأ بإدارة جداول الدوام."
            : "يرجى التواصل مع مدير الموارد البشرية لربط فرعك."}
        </p>
        {isHrAdmin && (
          <Button onClick={() => (window.location.href = "/settings?tab=branches")}>
            إدارة الفروع
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            جدول الدوام الأسبوعي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            من {weekStart} إلى {weekEnd}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {branches.length > 1 && (
            <Select value={effectiveBranchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.branch_id} value={b.branch_id}>{b.branch_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekAnchor(startOfWeek(new Date()))}>
            هذا الأسبوع
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="hidden md:flex items-center gap-3 flex-wrap text-xs">
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md border" style={{ borderColor: t.color }}>
            <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
            <span>{t.name_ar}</span>
            <span className="text-muted-foreground">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
          </div>
        ))}
      </div>

      {/* Mobile day picker */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button variant="outline" size="icon" onClick={() => {
            if (mobileDayIdx === 0) { setWeekAnchor(addDays(weekAnchor, -7)); setMobileDayIdx(6); }
            else setMobileDayIdx(mobileDayIdx - 1);
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-center flex-1">
            <div className="font-bold text-lg">{DAY_NAMES[mobileDayIdx]}</div>
            <div className="text-xs text-muted-foreground">{fmtISO(addDays(weekAnchor, mobileDayIdx))}</div>
          </div>
          <Button variant="outline" size="icon" onClick={() => {
            if (mobileDayIdx === 6) { setWeekAnchor(addDays(weekAnchor, 7)); setMobileDayIdx(0); }
            else setMobileDayIdx(mobileDayIdx + 1);
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const d = addDays(weekAnchor, i);
            const active = i === mobileDayIdx;
            return (
              <button
                key={i}
                onClick={() => setMobileDayIdx(i)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs border transition ${active ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card border-border"}`}
              >
                <div>{DAY_NAMES[i]}</div>
                <div className={active ? "opacity-90" : "text-muted-foreground"}>{d.getDate()}/{d.getMonth() + 1}</div>
              </button>
            );
          })}
        </div>

        {/* Mobile day cards */}
        <div className="space-y-3">
          {/* Search + filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن موظف..."
                className="pr-9 h-10"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                onClick={() => setDeptFilter("all")}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border ${deptFilter === "all" ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card border-border"}`}
              >
                الكل ({employees.length})
              </button>
              {departments.map((d) => {
                const count = (employees as any[]).filter((e) => ((e.department || "").trim() || DEPT_UNSET) === d).length;
                const active = deptFilter === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDeptFilter(d)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border ${active ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card border-border"}`}
                  >
                    {d} ({count})
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setOnlyUnset((v) => !v)}
                className={`text-[11px] px-2.5 py-1 rounded-md border ${onlyUnset ? "bg-warning/10 border-warning text-warning font-bold" : "bg-card border-border text-muted-foreground"}`}
              >
                {onlyUnset ? "✓ غير المحدد فقط" : "إظهار غير المحدد فقط"}
              </button>
              <span className="text-[10px] text-muted-foreground">المصدر: ملف الموظف (الفرع + القسم)</span>
            </div>
          </div>

          {rLoading ? (
            <div className="p-8 text-center text-muted-foreground">جار التحميل…</div>
          ) : !employees.length ? (
            <div className="p-8 text-center text-muted-foreground">لا يوجد موظفين في هذا الفرع</div>
          ) : !filteredEmployees.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">لا نتائج مطابقة</div>
          ) : (
            groupedEmployees.map(([dept, list]) => {
              const isCollapsed = collapsed[dept];
              return (
                <div key={dept} className="space-y-2">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [dept]: !c[dept] }))}
                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm font-bold sticky top-0 z-10"
                  >
                    <span>{dept} ({list.length})</span>
                    <span className="text-xs text-muted-foreground">{isCollapsed ? "▾" : "▴"}</span>
                  </button>
                  {!isCollapsed && list.map((emp: any) => {
              const d = fmtISO(addDays(weekAnchor, mobileDayIdx));
              const entry = rosterMap.get(`${emp.id}|${d}`) || null;
              const tpl = entry?.shift_template_id ? templates.find((t) => t.id === entry.shift_template_id) : null;
              const statusOpt = entry ? STATUS_OPTIONS.find((s) => s.value === entry.status) : null;
              const bg = tpl?.color || statusOpt?.color || "hsl(var(--muted-foreground))";
              const label = tpl?.name_ar || statusOpt?.label || "غير محدد";
              const time = tpl ? `${tpl.start_time.slice(0, 5)} → ${tpl.end_time.slice(0, 5)}` : null;
              return (
                <button
                  key={emp.id}
                  onClick={() => setCell({ employeeId: emp.id, date: d, existing: entry })}
                  className="w-full text-right bg-card border rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition"
                >
                  <span className="w-3 h-12 rounded-full flex-shrink-0" style={{ background: entry ? bg : "hsl(var(--border))" }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base truncate">{emp.full_name}</div>
                    {emp.position && <div className="text-xs text-muted-foreground truncate">{emp.position}</div>}
                  </div>
                  <div className="text-left flex-shrink-0">
                    <div className="text-sm font-bold" style={{ color: entry ? bg : "hsl(var(--muted-foreground))" }}>{label}</div>
                    {time && <div className="text-xs text-muted-foreground" dir="ltr">{time}</div>}
                  </div>
                </button>
              );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      <Card className="hidden md:block">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <span>{activeBranch?.branch_name} • {filteredEmployees.length} / {employees.length} موظف</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="pr-8 h-9 w-48" />
              </div>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rLoading ? (
            <div className="p-8 text-center text-muted-foreground">جار التحميل…</div>
          ) : !employees.length ? (
            <div className="p-8 text-center text-muted-foreground">لا يوجد موظفين في هذا الفرع</div>
          ) : !filteredEmployees.length ? (
            <div className="p-8 text-center text-muted-foreground">لا نتائج مطابقة</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-xs">
                  <th className="text-right p-2 sticky right-0 bg-muted/40 min-w-[140px]">الموظف</th>
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = addDays(weekAnchor, i);
                    return (
                      <th key={i} className="p-2 min-w-[110px]">
                        <div>{DAY_NAMES[i]}</div>
                        <div className="text-muted-foreground font-normal">{d.getDate()}/{d.getMonth() + 1}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groupedEmployees.flatMap(([dept, list]) => [
                  <tr key={`h-${dept}`} className="bg-muted/20">
                    <td colSpan={8} className="px-2 py-1.5 text-xs font-bold text-muted-foreground">{dept} ({list.length})</td>
                  </tr>,
                  ...list.map((emp: any) => (
                  <tr key={emp.id} className="border-t">
                    <td className="p-2 text-sm font-medium sticky right-0 bg-card">
                      {emp.full_name}
                      {emp.position && <div className="text-[11px] text-muted-foreground">{emp.position}</div>}
                    </td>
                    {Array.from({ length: 7 }).map((_, i) => {
                      const d = fmtISO(addDays(weekAnchor, i));
                      const entry = rosterMap.get(`${emp.id}|${d}`) || null;
                      const tpl = entry?.shift_template_id ? templates.find((t) => t.id === entry.shift_template_id) : null;
                      const statusOpt = entry ? STATUS_OPTIONS.find((s) => s.value === entry.status) : null;
                      const bg = tpl?.color || statusOpt?.color || "transparent";
                      const label = tpl?.name_ar || statusOpt?.label || "—";
                      return (
                        <td key={i} className="p-1 text-center">
                          <button
                            onClick={() => setCell({ employeeId: emp.id, date: d, existing: entry })}
                            className="w-full px-2 py-1.5 rounded-md text-xs font-medium transition hover:opacity-80 border"
                            style={{
                              background: entry ? bg + "20" : "transparent",
                              borderColor: entry ? bg : "hsl(var(--border))",
                              color: entry ? bg : "hsl(var(--muted-foreground))",
                            }}
                          >
                            {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  )),
                ])}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CellDialog
        cell={cell}
        onClose={() => setCell(null)}
        templates={templates}
        onSave={async (data) => {
          if (!cell || !companyId || !effectiveBranchId) return;
          try {
            await upsert.mutateAsync({
              ...(cell.existing?.id ? { id: cell.existing.id } : {}),
              company_id: companyId,
              branch_id: effectiveBranchId,
              employee_id: cell.employeeId,
              roster_date: cell.date,
              shift_template_id: data.status === "scheduled" || data.status === "coverage" ? data.shift_template_id : null,
              status: data.status,
              notes: data.notes || null,
            });
            toast.success("تم الحفظ");
            setCell(null);
          } catch (e: any) {
            toast.error(e.message || "فشل الحفظ");
          }
        }}
        onDelete={async () => {
          if (!cell?.existing?.id) return;
          try {
            await del.mutateAsync(cell.existing.id);
            toast.success("تم الحذف");
            setCell(null);
          } catch (e: any) {
            toast.error(e.message || "فشل الحذف");
          }
        }}
      />
    </div>
  );
}

function CellDialog({
  cell,
  onClose,
  templates,
  onSave,
  onDelete,
}: {
  cell: CellState | null;
  onClose: () => void;
  templates: ShiftTemplate[];
  onSave: (d: { status: RosterEntry["status"]; shift_template_id: string | null; notes: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<RosterEntry["status"]>("scheduled");
  const [shiftId, setShiftId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // sync state when cell changes
  useMemo(() => {
    if (cell) {
      setStatus(cell.existing?.status || "scheduled");
      setShiftId(cell.existing?.shift_template_id || templates[0]?.id || "");
      setNotes(cell.existing?.notes || "");
    }
  }, [cell, templates]);

  if (!cell) return null;
  const needsShift = status === "scheduled" || status === "coverage";

  const body = (
    <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">الحالة</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`px-3 py-3 rounded-md text-base border transition ${status === s.value ? "border-primary bg-primary/10 font-bold" : "border-border"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {needsShift && (
            <div>
              <label className="text-sm font-medium block mb-2">الوردية</label>
              <div className="grid grid-cols-1 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setShiftId(t.id)}
                    className={`flex items-center gap-2 px-3 py-3 rounded-md border text-right transition ${shiftId === t.id ? "border-primary bg-primary/10 font-bold" : "border-border"}`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                    <span className="flex-1">{t.name_ar}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-2">ملاحظات (اختياري)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
    </div>
  );

  const footer = (
    <div className="flex items-center gap-2 pt-2">
      {cell.existing && (
        <Button variant="destructive" size="sm" onClick={onDelete} className="me-auto">
          <Trash2 className="h-4 w-4 ms-1" /> حذف
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>إلغاء</Button>
      <Button onClick={() => onSave({ status, shift_template_id: needsShift ? shiftId : null, notes })}>
        حفظ
      </Button>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={!!cell} onOpenChange={(o) => !o && onClose()}>
          <SheetContent side="bottom" dir="rtl" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-right">
              <SheetTitle>{cell.date}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{body}</div>
            {footer}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!cell} onOpenChange={(o) => !o && onClose()}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>{cell.date}</DialogTitle>
            </DialogHeader>
            {body}
            <DialogFooter className="gap-2">
              {cell.existing && (
                <Button variant="destructive" size="sm" onClick={onDelete} className="me-auto">
                  <Trash2 className="h-4 w-4 ms-1" /> حذف
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button onClick={() => onSave({ status, shift_template_id: needsShift ? shiftId : null, notes })}>
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}