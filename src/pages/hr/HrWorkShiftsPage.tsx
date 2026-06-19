import { useEffect, useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Save, X, Loader2, Clock, Trash2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Small inline help icon with hover/tap tooltip — used to demystify shift fields. */
function HelpHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-relaxed text-right" dir="rtl">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type WorkShift = {
  id: string;
  user_id: string;
  name: string;
  start_time: string;          // "HH:MM:SS"
  end_time: string;
  break_duration_minutes: number | null;
  late_tolerance_minutes: number | null;
  overtime_after_minutes: number | null;
  crosses_midnight?: boolean | null;
  is_active: boolean;
};

const hhmm = (t?: string | null) => (t || "").slice(0, 5);

const DEFAULT_SHIFTS: Array<Omit<WorkShift, "id" | "user_id">> = [
  // P0 Plaza Mall defaults — match the temporary fallback used in the attendance dashboard.
  // Safe to seed: only inserted when zero shifts exist; never reassigns employees automatically.
  { name: "صباحي", start_time: "09:00", end_time: "17:00", break_duration_minutes: 30, late_tolerance_minutes: 10, overtime_after_minutes: 30, crosses_midnight: false, is_active: true },
  { name: "ميد",   start_time: "14:00", end_time: "22:00", break_duration_minutes: 30, late_tolerance_minutes: 10, overtime_after_minutes: 30, crosses_midnight: false, is_active: true },
  { name: "مسائي", start_time: "17:00", end_time: "01:00", break_duration_minutes: 30, late_tolerance_minutes: 10, overtime_after_minutes: 30, crosses_midnight: true,  is_active: true },
];

export default function HrWorkShiftsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [editing, setEditing] = useState<WorkShift | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("work_shifts")
      .select("*")
      .eq("user_id", dataOwnerId!)
      .order("start_time", { ascending: true });
    setShifts((data as any) || []);

    // count employees per shift
    const { data: emps } = await supabase
      .from("employees")
      .select("shift_id")
      .eq("user_id", dataOwnerId!)
      .eq("is_terminated", false)
      .not("shift_id", "is", null);
    const map: Record<string, number> = {};
    (emps || []).forEach((e: any) => { if (e.shift_id) map[e.shift_id] = (map[e.shift_id] || 0) + 1; });
    setUsageMap(map);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [user?.id]);

  const seedDefaults = async () => {
    if (!user) return;
    // Safety: never overwrite. Only seed when zero templates exist.
    if (shifts.length > 0) {
      toast.info("الشفتات موجودة بالفعل — لم يتم تغيير شيء");
      return;
    }
    const rows = DEFAULT_SHIFTS.map(s => ({ ...s, user_id: dataOwnerId! }));
    const { error } = await supabase.from("work_shifts").insert(rows as any);
    if (error) return toast.error(error.message);
    toast.success("تمت تهيئة 3 شفتات افتراضية (صباحي/ميد/مسائي)");
    fetchAll();
  };

  const saveShift = async (row: Partial<WorkShift>, isAdd: boolean) => {
    if (!user) return;
    if (!row.name?.trim()) return toast.error("اسم الشفت مطلوب");
    if (!row.start_time || !row.end_time) return toast.error("وقت البداية والنهاية مطلوبان");

    const payload = {
      name: row.name.trim(),
      start_time: row.start_time,
      end_time: row.end_time,
      break_duration_minutes: row.break_duration_minutes ?? 30,
      late_tolerance_minutes: row.late_tolerance_minutes ?? 15,
      overtime_after_minutes: row.overtime_after_minutes ?? 30,
      crosses_midnight: row.crosses_midnight ?? false,
      is_active: row.is_active ?? true,
    };

    if (isAdd) {
      const { error } = await supabase.from("work_shifts").insert({ ...payload, user_id: dataOwnerId! } as any);
      if (error) return toast.error(error.message);
      toast.success("تمت إضافة الشفت");
    } else {
      const { error } = await supabase.from("work_shifts").update(payload).eq("id", row.id!);
      if (error) return toast.error(error.message);
      toast.success("تم الحفظ");
    }
    setEditing(null);
    setShowAdd(false);
    fetchAll();
  };

  const toggleActive = async (s: WorkShift) => {
    const { error } = await supabase.from("work_shifts").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    fetchAll();
  };

  const removeShift = async (s: WorkShift) => {
    const used = usageMap[s.id] || 0;
    if (used > 0) {
      return toast.error(`لا يمكن حذف الشفت — مستخدم من ${used} موظف. أزل التعيين أولاً.`);
    }
    if (!confirm(`حذف الشفت "${s.name}"؟`)) return;
    const { error } = await supabase.from("work_shifts").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    fetchAll();
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <BackButton />
      <PageHeader title="إدارة الشفتات" />
      <p className="text-sm text-muted-foreground -mt-2">
        عرّف شفتات العمل (صباحي/مسائي/ليلي...) ثم اربط كل موظف بشفت في ملفه. يستخدم الحضور هذه الشفتات لحساب التأخير والوقت الإضافي.
      </p>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            {shifts.length} شفت
          </div>
          <div className="flex gap-2">
            {shifts.length === 0 && (
              <Button size="sm" variant="outline" onClick={seedDefaults}>
                <Clock className="ml-1 h-4 w-4" /> تهيئة افتراضية (3 شفتات)
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="ml-1 h-4 w-4" /> شفت جديد
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
            لا يوجد شفتات بعد — ابدأ بتهيئة افتراضية أو أضف شفت جديد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البداية</TableHead>
                  <TableHead>النهاية</TableHead>
                  <TableHead>سماح التأخير</TableHead>
                  <TableHead>راحة (د)</TableHead>
                  <TableHead>الإضافي بعد (د)</TableHead>
                  <TableHead className="text-center">عدد الموظفين</TableHead>
                  <TableHead className="text-center">نشط</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map(s => {
                  const used = usageMap[s.id] || 0;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs">{hhmm(s.start_time)}</TableCell>
                      <TableCell className="font-mono text-xs">{hhmm(s.end_time)}</TableCell>
                      <TableCell>{s.late_tolerance_minutes ?? 0} د</TableCell>
                      <TableCell>{s.break_duration_minutes ?? 0}</TableCell>
                      <TableCell>{s.overtime_after_minutes ?? 0}</TableCell>
                      <TableCell className="text-center">
                        {used > 0
                          ? <Badge variant="secondary">{used}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeShift(s)} disabled={used > 0}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ShiftDialog
        open={!!editing || showAdd}
        initial={editing}
        isAdd={showAdd && !editing}
        onClose={() => { setEditing(null); setShowAdd(false); }}
        onSave={(row) => saveShift(row, showAdd && !editing)}
      />
    </div>
  );
}

function ShiftDialog({
  open, onClose, onSave, initial, isAdd,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (row: Partial<WorkShift>) => void;
  initial: WorkShift | null;
  isAdd: boolean;
}) {
  const [row, setRow] = useState<Partial<WorkShift>>(
    initial || {
      name: "", start_time: "08:00", end_time: "16:00",
      break_duration_minutes: 30, late_tolerance_minutes: 15, overtime_after_minutes: 30,
      crosses_midnight: false, is_active: true,
    }
  );

  useEffect(() => {
    setRow(initial || {
      name: "", start_time: "08:00", end_time: "16:00",
      break_duration_minutes: 30, late_tolerance_minutes: 15, overtime_after_minutes: 30,
      crosses_midnight: false, is_active: true,
    });
  }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAdd ? "شفت جديد" : `تعديل: ${initial?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">اسم الشفت</label>
            <Input value={row.name || ""} onChange={e => setRow({ ...row, name: e.target.value })} placeholder="صباحي / مسائي / ليلي" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">البداية</label>
              <Input type="time" value={hhmm(row.start_time)} onChange={e => setRow({ ...row, start_time: e.target.value })} dir="ltr" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">النهاية</label>
              <Input type="time" value={hhmm(row.end_time)} onChange={e => setRow({ ...row, end_time: e.target.value })} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                سماح التأخير (د)
                <HelpHint text="عدد الدقائق المسموح تأخيرها بعد بداية الشفت قبل احتساب الموظف متأخراً. مثلاً: 15 دقيقة = من 9:00 إلى 9:15 يُعتبر حضور في الموعد." />
              </label>
              <Input type="number" min={0} max={120} value={row.late_tolerance_minutes ?? 15}
                onChange={e => setRow({ ...row, late_tolerance_minutes: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                راحة (د)
                <HelpHint text="مدة الاستراحة المخصومة من الشفت (تُحسب ضمن وقت العمل لكن لا تُحتسب ساعات إنتاج). مثلاً: شفت 8 ساعات + 30 دقيقة راحة = 7.5 ساعة عمل فعلي." />
              </label>
              <Input type="number" min={0} max={240} value={row.break_duration_minutes ?? 30}
                onChange={e => setRow({ ...row, break_duration_minutes: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                إضافي بعد (د)
                <HelpHint text="بعد كم دقيقة من نهاية الشفت يبدأ احتساب الوقت كساعات إضافية (Overtime). مثلاً: 30 دقيقة يعني الموظف لازم يبقى أكثر من نصف ساعة بعد نهاية الشفت ليُحسب له إضافي." />
              </label>
              <Input type="number" min={0} max={240} value={row.overtime_after_minutes ?? 30}
                onChange={e => setRow({ ...row, overtime_after_minutes: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 bg-muted/30 rounded p-2 text-sm">
            <span className="inline-flex items-center gap-1">
              يعبر منتصف الليل (شفت ليلي)
              <HelpHint text="فعِّل هذا الخيار إذا كان وقت النهاية أصغر من وقت البداية (مثلاً يبدأ 22:00 وينتهي 06:00 صباحاً)، ليفهم النظام أن الشفت يمتد لليوم التالي. بدون تفعيله، النظام سيظن أن الشفت 16 ساعة بالعكس." />
            </span>
            <Switch checked={!!row.crosses_midnight} onCheckedChange={v => setRow({ ...row, crosses_midnight: v })} />
          </label>
          <label className="flex items-center justify-between gap-2 bg-muted/30 rounded p-2 text-sm">
            <span className="inline-flex items-center gap-1">
              نشط
              <HelpHint text="نشط = الشفت متاح للاختيار في ملفات الموظفين. موقوف = الشفت يبقى محفوظاً للسجلات القديمة لكنه يختفي من قائمة الإضافة الجديدة." />
            </span>
            <Switch checked={row.is_active ?? true} onCheckedChange={v => setRow({ ...row, is_active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="ml-1 h-4 w-4" /> إلغاء</Button>
          <Button onClick={() => onSave(row)}><Save className="ml-1 h-4 w-4" /> حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}