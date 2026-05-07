import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useManagerBranches,
  useShiftTemplates,
  useBranchEmployees,
  useWeekRoster,
  useUpsertRoster,
  useDeleteRosterEntry,
  useCurrentEmployee,
  type RosterEntry,
  type ShiftTemplate,
} from "@/hooks/useBranchRoster";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { data: me } = useCurrentEmployee();
  const { data: branches = [], isLoading: bLoading } = useManagerBranches();
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
  // Non-admin/HR managers: restrict to their direct team only
  const { data: employees = [] } = useBranchEmployees(
    effectiveBranchId,
    isHrAdmin ? undefined : me?.id,
  );
  const { data: roster = [], isLoading: rLoading } = useWeekRoster(effectiveBranchId, weekStart, weekEnd);

  const upsert = useUpsertRoster();
  const del = useDeleteRosterEntry();

  const rosterMap = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    roster.forEach((r) => m.set(`${r.employee_id}|${r.roster_date}`, r));
    return m;
  }, [roster]);

  const [cell, setCell] = useState<CellState | null>(null);
  // Mobile day index (0..6) within the current week
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(() => {
    const today = new Date();
    const ws = startOfWeek(today);
    const diff = Math.round((today.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(6, diff));
  });

  if (bLoading) return <div className="p-8 text-center">جار التحميل…</div>;
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
        <div className="space-y-2">
          {rLoading ? (
            <div className="p-8 text-center text-muted-foreground">جار التحميل…</div>
          ) : !employees.length ? (
            <div className="p-8 text-center text-muted-foreground">لا يوجد موظفين في هذا الفرع</div>
          ) : (
            employees.map((emp: any) => {
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
            })
          )}
        </div>
      </div>

      <Card className="hidden md:block">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{activeBranch?.branch_name} • {employees.length} موظف</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rLoading ? (
            <div className="p-8 text-center text-muted-foreground">جار التحميل…</div>
          ) : !employees.length ? (
            <div className="p-8 text-center text-muted-foreground">لا يوجد موظفين في هذا الفرع</div>
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
                {employees.map((emp: any) => (
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
                ))}
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
      {/* Mobile bottom sheet */}
      <Sheet open={!!cell} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" dir="rtl" className="md:hidden rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-right">
            <SheetTitle>{cell.date}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{body}</div>
          {footer}
        </SheetContent>
      </Sheet>
      {/* Desktop dialog */}
      <Dialog open={!!cell} onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="hidden md:block">
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
    </>
  );
}