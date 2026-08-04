import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, Trash2, Loader2 } from "lucide-react";
import { ar } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useLeaveBlackoutDates } from "@/hooks/hr/useLeaveBlackoutDates";
import { toISODate, parseISODate, formatBlackoutLabel } from "@/lib/hr/leaveBlackout";
import { useToast } from "@/hooks/use-toast";

/**
 * لوحة الموارد البشرية: تحديد أيام/فترات ممنوع فيها تقديم طلبات الإجازة.
 * تنعكس فوراً على شاشة الموظف (التواريخ تصير مطفيّة).
 */
export function LeaveBlackoutDatesEditor() {
  const { toast } = useToast();
  const { ranges, loading, add, remove } = useLeaveBlackoutDates();
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const blocked = useMemo(
    () => ranges.map(r => ({ from: parseISODate(r.start_date), to: parseISODate(r.end_date) })),
    [ranges],
  );

  const save = async () => {
    if (!range?.from) {
      toast({ title: "اختر تاريخ أو فترة من التقويم", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await add({
        start_date: toISODate(range.from),
        end_date: toISODate(range.to ?? range.from),
        reason,
      });
      toast({ title: "تم حظر الفترة ✅", description: "ما رح يقدر الموظف يقدّم إجازة على هالأيام." });
      setRange(undefined);
      setReason("");
    } catch (e: any) {
      toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-destructive/5 border-destructive/20">
      <div className="flex items-center gap-2">
        <CalendarOff className="h-4 w-4 text-destructive" />
        <p className="text-sm font-medium">أيام ممنوع تقديم إجازة فيها</p>
        {ranges.length > 0 && (
          <Badge variant="outline" className="h-5 text-[10px] border-destructive text-destructive">
            {ranges.length} فترة
          </Badge>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        حدّد يوم أو فترة من التقويم (اضغط على البداية ثم النهاية). هذه الأيام رح تظهر مطفيّة عند الموظف ولا يقدر يختارها.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border bg-background p-1 w-fit">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            locale={ar}
            dir="rtl"
            modifiers={{ blocked }}
            modifiersClassNames={{ blocked: "bg-destructive/15 text-destructive line-through" }}
            className="pointer-events-auto"
          />
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">السبب (اختياري)</label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: موسم الأعياد — ذروة العمل"
              className="h-9 text-xs"
            />
          </div>
          <Button size="sm" onClick={save} disabled={busy || !range?.from} className="w-full">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarOff className="h-3.5 w-3.5" />}
            حظر الفترة المحددة
          </Button>

          <div className="max-h-44 overflow-auto space-y-1.5 pt-1">
            {loading ? (
              <p className="text-[11px] text-muted-foreground text-center py-3">جارِ التحميل…</p>
            ) : ranges.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-3">لا توجد أيام محظورة حالياً</p>
            ) : (
              ranges.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => remove(r.id)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <div className="text-right flex-1">
                    <p className="text-[11px] font-medium" dir="ltr">{formatBlackoutLabel(r)}</p>
                    {r.reason && <p className="text-[10px] text-muted-foreground">{r.reason}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
