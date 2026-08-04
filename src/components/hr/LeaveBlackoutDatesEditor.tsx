import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, Trash2, Loader2, ChevronDown, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      setPickerOpen(false);
    } catch (e: any) {
      toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const rangeLabel = range?.from
    ? `${toISODate(range.from)}${range.to && toISODate(range.to) !== toISODate(range.from) ? ` → ${toISODate(range.to)}` : ""}`
    : "اختر يوم أو فترة";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border rounded-lg bg-destructive/5 border-destructive/20"
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 p-2.5">
        <div className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium">أيام ممنوع تقديم إجازة فيها</span>
          {ranges.length > 0 && (
            <Badge variant="outline" className="h-5 text-[10px] border-destructive text-destructive">
              {ranges.length} فترة
            </Badge>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-2.5 pt-0 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 justify-start gap-2 sm:w-[210px] text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span dir="ltr" className="truncate">{rangeLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  locale={ar}
                  dir="rtl"
                  modifiers={{ blocked }}
                  modifiersClassNames={{ blocked: "bg-destructive/15 text-destructive line-through" }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="السبب (اختياري)"
              className="h-9 text-xs flex-1"
            />

            <Button size="sm" onClick={save} disabled={busy || !range?.from} className="h-9 gap-1.5 text-xs">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarOff className="h-3.5 w-3.5" />}
              حظر
            </Button>
          </div>

          <div className="max-h-32 overflow-auto space-y-1">
            {loading ? (
              <p className="text-[11px] text-muted-foreground text-center py-2">جارِ التحميل…</p>
            ) : ranges.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-2">لا توجد أيام محظورة حالياً</p>
            ) : (
              ranges.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1">
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
      </CollapsibleContent>
    </Collapsible>
  );
}
