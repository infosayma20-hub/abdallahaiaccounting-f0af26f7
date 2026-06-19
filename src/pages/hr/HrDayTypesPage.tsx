import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import PageHeader from "@/components/layout/PageHeader";
import BackButton from "@/components/BackButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Save, X, Loader2, Calendar, Tag, Trash2, Sparkles, CalendarDays } from "lucide-react";
import { FIXED_HOLIDAYS } from "@/lib/hr-utils";

type DayType = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  category: string;
  is_paid: boolean;
  affects_salary: boolean;
  requires_approval: boolean;
  counts_as_attendance: boolean;
  color: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  notes: string | null;
};

type Holiday = {
  id: string;
  user_id: string;
  holiday_date: string;
  name: string;
  multiplier: number | null;
  is_recurring: boolean | null;
  recurring_month: number | null;
  recurring_day: number | null;
  is_active: boolean;
  notes: string | null;
};

type WorkWeekConfig = {
  id: string;
  user_id: string;
  working_days: number[];
  weekly_off_days: number[];
  work_hours_per_day: number;
  notes: string | null;
};

// JS getDay(): 0=Sun .. 6=Sat — Arabic labels
const DOW_LABELS: { value: number; short: string; long: string }[] = [
  { value: 6, short: "السبت",   long: "السبت" },
  { value: 0, short: "الأحد",   long: "الأحد" },
  { value: 1, short: "الإثنين", long: "الإثنين" },
  { value: 2, short: "الثلاثاء",long: "الثلاثاء" },
  { value: 3, short: "الأربعاء",long: "الأربعاء" },
  { value: 4, short: "الخميس",  long: "الخميس" },
  { value: 5, short: "الجمعة",  long: "الجمعة" },
];

// System defaults — seeded once per user on first visit
const DEFAULT_DAY_TYPES: Omit<DayType, "id" | "user_id">[] = [
  { code: "working",      name: "يوم عمل",          category: "work",     is_paid: true,  affects_salary: false, requires_approval: false, counts_as_attendance: true,  color: "#10b981", is_active: true, is_system: true, sort_order: 1,  notes: null },
  { code: "weekly_off",   name: "عطلة أسبوعية",     category: "off",      is_paid: true,  affects_salary: false, requires_approval: false, counts_as_attendance: false, color: "#6366f1", is_active: true, is_system: true, sort_order: 2,  notes: null },
  { code: "holiday",      name: "عطلة رسمية",       category: "off",      is_paid: true,  affects_salary: false, requires_approval: false, counts_as_attendance: false, color: "#a855f7", is_active: true, is_system: true, sort_order: 3,  notes: null },
  { code: "annual_leave", name: "إجازة سنوية",      category: "leave",    is_paid: true,  affects_salary: false, requires_approval: true,  counts_as_attendance: false, color: "#3b82f6", is_active: true, is_system: true, sort_order: 4,  notes: null },
  { code: "sick_leave",   name: "إجازة مرضية",      category: "leave",    is_paid: true,  affects_salary: false, requires_approval: true,  counts_as_attendance: false, color: "#06b6d4", is_active: true, is_system: true, sort_order: 5,  notes: null },
  { code: "permission",   name: "مغادرة",           category: "leave",    is_paid: true,  affects_salary: false, requires_approval: true,  counts_as_attendance: false, color: "#0ea5e9", is_active: true, is_system: true, sort_order: 6,  notes: null },
  { code: "mission",      name: "مهمة عمل",         category: "work",     is_paid: true,  affects_salary: false, requires_approval: true,  counts_as_attendance: true,  color: "#14b8a6", is_active: true, is_system: true, sort_order: 7,  notes: null },
  { code: "absent",       name: "غياب",             category: "absence",  is_paid: false, affects_salary: true,  requires_approval: false, counts_as_attendance: false, color: "#ef4444", is_active: true, is_system: true, sort_order: 8,  notes: null },
];

const CATEGORY_LABEL: Record<string, string> = {
  work: "عمل", off: "عطلة", leave: "إجازة", absence: "غياب", other: "أخرى",
};

const CATEGORY_OPTIONS = [
  { value: "work", label: "عمل" },
  { value: "off", label: "عطلة" },
  { value: "leave", label: "إجازة" },
  { value: "absence", label: "غياب" },
  { value: "other", label: "أخرى" },
];

export default function HrDayTypesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [workWeek, setWorkWeek] = useState<WorkWeekConfig | null>(null);
  const [savingWW, setSavingWW] = useState(false);

  // Day type editor
  const [editing, setEditing] = useState<DayType | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Holiday form
  const [hForm, setHForm] = useState({ holiday_date: "", name: "", is_recurring: false, notes: "" });

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: dt }, { data: hh }, { data: ww }] = await Promise.all([
      supabase.from("hr_day_types").select("*").eq("user_id", dataOwnerId!).order("sort_order", { ascending: true }),
      supabase.from("official_holidays").select("*").eq("user_id", dataOwnerId!).order("holiday_date", { ascending: true }),
      supabase.from("hr_work_week_config").select("*").eq("user_id", dataOwnerId!).maybeSingle(),
    ]);
    setDayTypes((dt as DayType[]) || []);
    setHolidays((hh as Holiday[]) || []);

    // Lazy-init work week config if missing
    if (!ww) {
      const { data: created } = await supabase
        .from("hr_work_week_config")
        .insert({ user_id: dataOwnerId! } as any)
        .select()
        .single();
      setWorkWeek(created as WorkWeekConfig);
    } else {
      setWorkWeek(ww as WorkWeekConfig);
    }

    setLoading(false);

    // Auto-seed defaults if empty
    if ((dt || []).length === 0) {
      await seedDefaults(user.id);
    }
  };

  const seedDefaults = async (uid: string) => {
    setSeeding(true);
    const rows = DEFAULT_DAY_TYPES.map(d => ({ ...d, user_id: uid }));
    const { error } = await supabase.from("hr_day_types").insert(rows as any);
    setSeeding(false);
    if (error) {
      // unique violation = already seeded
      if (!String(error.message).includes("duplicate")) toast.error(error.message);
    } else {
      toast.success("تمت تهيئة أنواع الأيام الافتراضية");
    }
    const { data } = await supabase.from("hr_day_types").select("*").eq("user_id", uid).order("sort_order");
    setDayTypes((data as DayType[]) || []);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [user?.id]);

  // ---------- Day types CRUD ----------
  const saveDayType = async (row: DayType) => {
    if (!row.name?.trim() || !row.code?.trim()) {
      toast.error("الاسم والكود مطلوبان");
      return;
    }
    const { error } = await supabase
      .from("hr_day_types")
      .update({
        name: row.name.trim(),
        category: row.category,
        is_paid: row.is_paid,
        affects_salary: row.affects_salary,
        requires_approval: row.requires_approval,
        counts_as_attendance: row.counts_as_attendance,
        color: row.color,
        is_active: row.is_active,
        sort_order: row.sort_order,
        notes: row.notes,
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setEditing(null);
    fetchAll();
  };

  const toggleActive = async (row: DayType) => {
    const { error } = await supabase
      .from("hr_day_types").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) return toast.error(error.message);
    fetchAll();
  };

  const addDayType = async (row: Partial<DayType>) => {
    if (!user) return;
    if (!row.code?.trim() || !row.name?.trim()) return toast.error("الكود والاسم مطلوبان");
    const { error } = await supabase.from("hr_day_types").insert({
      user_id: dataOwnerId!,
      code: row.code.trim(),
      name: row.name.trim(),
      category: row.category || "other",
      is_paid: row.is_paid ?? true,
      affects_salary: row.affects_salary ?? false,
      requires_approval: row.requires_approval ?? false,
      counts_as_attendance: row.counts_as_attendance ?? true,
      color: row.color || "#64748b",
      is_active: true,
      is_system: false,
      sort_order: (dayTypes[dayTypes.length - 1]?.sort_order || 0) + 1,
      notes: row.notes || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    setShowAdd(false);
    fetchAll();
  };

  // ---------- Holidays CRUD ----------
  const addHoliday = async () => {
    if (!user) return;
    if (!hForm.holiday_date || !hForm.name.trim()) return toast.error("التاريخ والاسم مطلوبان");
    const d = new Date(hForm.holiday_date + "T00:00:00");
    const { error } = await supabase.from("official_holidays").insert({
      user_id: dataOwnerId!,
      holiday_date: hForm.holiday_date,
      name: hForm.name.trim(),
      multiplier: 2,
      is_recurring: hForm.is_recurring,
      recurring_month: hForm.is_recurring ? d.getMonth() + 1 : null,
      recurring_day: hForm.is_recurring ? d.getDate() : null,
      is_active: true,
      notes: hForm.notes || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة العطلة");
    setHForm({ holiday_date: "", name: "", is_recurring: false, notes: "" });
    fetchAll();
  };

  const toggleHoliday = async (h: Holiday) => {
    const { error } = await supabase.from("official_holidays").update({ is_active: !h.is_active }).eq("id", h.id);
    if (error) return toast.error(error.message);
    fetchAll();
  };

  const seedFixedHolidays = async (year: number) => {
    if (!user) return;
    const rows = FIXED_HOLIDAYS.map(h => ({
      user_id: dataOwnerId!,
      holiday_date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
      name: h.name,
      multiplier: 2,
      is_recurring: true,
      recurring_month: h.month,
      recurring_day: h.day,
      is_active: true,
    }));
    const { error } = await supabase.from("official_holidays").insert(rows as any);
    if (error) return toast.error(error.message);
    toast.success(`تمت إضافة ${rows.length} عطلة لسنة ${year}`);
    fetchAll();
  };

  const sortedDayTypes = useMemo(
    () => [...dayTypes].sort((a, b) => a.sort_order - b.sort_order),
    [dayTypes]
  );

  // ---------- Work Week ----------
  const toggleWorkDay = async (dow: number) => {
    if (!workWeek || !user) return;
    const isWorking = workWeek.working_days.includes(dow);
    const newWorking = isWorking
      ? workWeek.working_days.filter(d => d !== dow)
      : [...workWeek.working_days, dow].sort((a, b) => a - b);
    const newOff = DOW_LABELS.map(l => l.value).filter(d => !newWorking.includes(d)).sort((a, b) => a - b);

    if (newWorking.length === 0) {
      toast.error("يجب اختيار يوم عمل واحد على الأقل");
      return;
    }

    setSavingWW(true);
    const { error } = await supabase
      .from("hr_work_week_config")
      .update({ working_days: newWorking, weekly_off_days: newOff })
      .eq("id", workWeek.id);
    setSavingWW(false);
    if (error) return toast.error(error.message);
    setWorkWeek({ ...workWeek, working_days: newWorking, weekly_off_days: newOff });
    toast.success("تم تحديث أيام الدوام");
  };

  const updateWorkHours = async (hours: number) => {
    if (!workWeek) return;
    const safe = Math.max(1, Math.min(24, hours || 8));
    const { error } = await supabase
      .from("hr_work_week_config")
      .update({ work_hours_per_day: safe })
      .eq("id", workWeek.id);
    if (error) return toast.error(error.message);
    setWorkWeek({ ...workWeek, work_hours_per_day: safe });
    toast.success("تم تحديث ساعات الدوام");
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <BackButton />
      <PageHeader title="أنواع الأيام والعطل الرسمية" />
      <p className="text-sm text-muted-foreground -mt-2">
        مرجع موحد لأنواع الأيام (عمل/عطلة/إجازة/غياب) والعطل الرسمية — يُستخدم في الحضور والرواتب.
      </p>

      <Tabs defaultValue="types" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workweek"><CalendarDays className="ml-1 h-4 w-4" /> أيام الدوام</TabsTrigger>
          <TabsTrigger value="types"><Tag className="ml-1 h-4 w-4" /> أنواع الأيام</TabsTrigger>
          <TabsTrigger value="holidays"><Calendar className="ml-1 h-4 w-4" /> العطل الرسمية</TabsTrigger>
        </TabsList>

        {/* ============ Work Week Config ============ */}
        <TabsContent value="workweek">
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-base">أيام الدوام الأسبوعية</h3>
              <p className="text-xs text-muted-foreground mt-1">
                اختر أيام العمل الرسمية لشركتك. الأيام غير المختارة ستُحسب كعطلة أسبوعية تلقائياً في الحضور والرواتب.
              </p>
            </div>

            {loading || !workWeek ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {DOW_LABELS.map(d => {
                    const isWorking = workWeek.working_days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        disabled={savingWW}
                        onClick={() => toggleWorkDay(d.value)}
                        className={`p-3 rounded-lg border-2 transition text-center ${
                          isWorking
                            ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                            : "bg-muted/30 border-muted text-muted-foreground"
                        }`}
                      >
                        <div className="text-sm font-semibold">{d.long}</div>
                        <div className="text-[10px] mt-1">{isWorking ? "دوام" : "عطلة"}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t pt-3 flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <label className="text-xs text-muted-foreground">ساعات الدوام اليومية</label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      step={0.5}
                      defaultValue={workWeek.work_hours_per_day}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        if (v !== workWeek.work_hours_per_day) updateWorkHours(v);
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                    عدد أيام العمل: <strong className="text-foreground">{workWeek.working_days.length}</strong> أسبوعياً —
                    العطل الأسبوعية: <strong className="text-foreground">{workWeek.weekly_off_days.map(d => DOW_LABELS.find(l => l.value === d)?.long).join(", ") || "لا يوجد"}</strong>
                  </div>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ============ Day Types ============ */}
        <TabsContent value="types">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">
                {sortedDayTypes.length} نوع — الأنواع الافتراضية محمية من الحذف
              </div>
              <div className="flex gap-2">
                {sortedDayTypes.length === 0 && (
                  <Button size="sm" variant="outline" disabled={seeding} onClick={() => user && seedDefaults(user.id)}>
                    <Sparkles className="ml-1 h-4 w-4" /> تهيئة الافتراضيات
                  </Button>
                )}
                <Button size="sm" onClick={() => setShowAdd(true)}>
                  <Plus className="ml-1 h-4 w-4" /> نوع جديد
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اللون</TableHead>
                      <TableHead>الاسم</TableHead>
                      <TableHead>الكود</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead className="text-center">مدفوع</TableHead>
                      <TableHead className="text-center">يؤثر على الراتب</TableHead>
                      <TableHead className="text-center">يحتاج موافقة</TableHead>
                      <TableHead className="text-center">يحسب كحضور</TableHead>
                      <TableHead className="text-center">نشط</TableHead>
                      <TableHead className="text-end">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDayTypes.map(d => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="h-5 w-5 rounded-full border" style={{ background: d.color }} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {d.name}
                          {d.is_system && <Badge variant="outline" className="mr-2 text-[10px]">نظام</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{d.code}</TableCell>
                        <TableCell><Badge variant="secondary">{CATEGORY_LABEL[d.category] || d.category}</Badge></TableCell>
                        <TableCell className="text-center">{d.is_paid ? "✓" : "—"}</TableCell>
                        <TableCell className="text-center">{d.affects_salary ? "✓" : "—"}</TableCell>
                        <TableCell className="text-center">{d.requires_approval ? "✓" : "—"}</TableCell>
                        <TableCell className="text-center">{d.counts_as_attendance ? "✓" : "—"}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={d.is_active} onCheckedChange={() => toggleActive(d)} />
                        </TableCell>
                        <TableCell className="text-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ============ Holidays ============ */}
        <TabsContent value="holidays">
          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground">التاريخ</label>
                <Input type="date" value={hForm.holiday_date}
                  onChange={e => setHForm(p => ({ ...p, holiday_date: e.target.value }))} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground">الاسم</label>
                <Input value={hForm.name} placeholder="عيد الفطر"
                  onChange={e => setHForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground">ملاحظات</label>
                <Input value={hForm.notes} onChange={e => setHForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={hForm.is_recurring}
                  onCheckedChange={v => setHForm(p => ({ ...p, is_recurring: v }))} />
                تتكرر سنوياً
              </label>
              <Button onClick={addHoliday}><Plus className="ml-1 h-4 w-4" /> إضافة</Button>
            </div>

            <div className="flex gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground self-center">تهيئة سريعة:</span>
              <Button size="sm" variant="outline" onClick={() => seedFixedHolidays(2026)}>عطل 2026</Button>
              <Button size="sm" variant="outline" onClick={() => seedFixedHolidays(2027)}>عطل 2027</Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>تتكرر</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead className="text-center">نشطة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا توجد عطل</TableCell></TableRow>
                  ) : holidays.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-xs">{h.holiday_date}</TableCell>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell>{h.is_recurring ? <Badge variant="secondary">سنوياً</Badge> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.notes || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={h.is_active} onCheckedChange={() => toggleHoliday(h)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <DayTypeDialog
        open={!!editing || showAdd}
        initial={editing}
        onClose={() => { setEditing(null); setShowAdd(false); }}
        onSave={(row) => editing ? saveDayType(row as DayType) : addDayType(row)}
        isAdd={showAdd && !editing}
      />
    </div>
  );
}

// ---------- Edit/Add dialog ----------
function DayTypeDialog({
  open, onClose, onSave, initial, isAdd,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (row: any) => void;
  initial: DayType | null;
  isAdd: boolean;
}) {
  const [row, setRow] = useState<any>(initial || {
    code: "", name: "", category: "other",
    is_paid: true, affects_salary: false, requires_approval: false,
    counts_as_attendance: true, color: "#64748b", is_active: true, sort_order: 99, notes: "",
  });

  useEffect(() => {
    setRow(initial || {
      code: "", name: "", category: "other",
      is_paid: true, affects_salary: false, requires_approval: false,
      counts_as_attendance: true, color: "#64748b", is_active: true, sort_order: 99, notes: "",
    });
  }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAdd ? "نوع يوم جديد" : `تعديل: ${initial?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">الاسم</label>
              <Input value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الكود {initial?.is_system && <span className="text-amber-600">(محمي)</span>}</label>
              <Input value={row.code} disabled={!isAdd} onChange={e => setRow({ ...row, code: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">التصنيف</label>
              <select className="w-full h-9 border rounded px-2 bg-background"
                value={row.category} onChange={e => setRow({ ...row, category: e.target.value })}>
                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">اللون</label>
              <Input type="color" value={row.color} onChange={e => setRow({ ...row, color: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <ToggleRow label="مدفوع" v={row.is_paid} on={v => setRow({ ...row, is_paid: v })} />
            <ToggleRow label="يؤثر على الراتب" v={row.affects_salary} on={v => setRow({ ...row, affects_salary: v })} />
            <ToggleRow label="يحتاج موافقة" v={row.requires_approval} on={v => setRow({ ...row, requires_approval: v })} />
            <ToggleRow label="يحسب كحضور" v={row.counts_as_attendance} on={v => setRow({ ...row, counts_as_attendance: v })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">ملاحظات</label>
            <Input value={row.notes || ""} onChange={e => setRow({ ...row, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="ml-1 h-4 w-4" /> إلغاء</Button>
          <Button onClick={() => onSave(row)}><Save className="ml-1 h-4 w-4" /> حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 bg-muted/30 rounded p-2 text-sm">
      <span>{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </label>
  );
}