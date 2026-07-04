import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, CalendarPlus, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee { id: string; full_name: string; is_active: boolean | null; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmployeeId?: string | null;
  onDone?: () => void;
}

export default function BackfillAttendanceDialog({ open, onOpenChange, defaultEmployeeId, onDone }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [checkIn, setCheckIn] = useState("08:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [reason, setReason] = useState("موظف جديد — تعبئة بصمات بأثر رجعي");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) { toast({ title: "خطأ في تحميل الموظفين", description: error.message, variant: "destructive" }); return; }
      setEmployees((data || []) as Employee[]);
    })();
  }, [open]);

  useEffect(() => {
    if (open && defaultEmployeeId) setEmployeeId(defaultEmployeeId);
  }, [open, defaultEmployeeId]);

  const daysCount = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const a = new Date(fromDate).getTime();
    const b = new Date(toDate).getTime();
    if (isNaN(a) || isNaN(b) || a > b) return 0;
    return Math.floor((b - a) / 86400000) + 1;
  }, [fromDate, toDate]);

  const totalHoursPerDay = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const [ih, im] = checkIn.split(":").map(Number);
    const [oh, om] = checkOut.split(":").map(Number);
    let mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
  }, [checkIn, checkOut]);

  const selectedEmployee = employees.find(e => e.id === employeeId);

  const canRun = employeeId && fromDate && toDate && daysCount > 0 && checkIn && checkOut && reason.trim().length > 0 && !running;

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("hr_backfill_attendance" as any, {
        p_employee_id: employeeId,
        p_from: fromDate,
        p_to: toDate,
        p_check_in: checkIn + ":00",
        p_check_out: checkOut + ":00",
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const r: any = data || {};
      toast({
        title: "تم التوليد",
        description: `تم إدراج ${r.inserted ?? 0} يوم · تُخطي ${r.skipped ?? 0} · فشل ${r.failed ?? 0}`,
      });
      if ((r.failed ?? 0) > 0 && Array.isArray(r.errors)) {
        console.warn("backfill errors", r.errors);
      }
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "فشل التوليد", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            توليد بصمات بأثر رجعي
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>الموظف</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedEmployee ? selectedEmployee.full_name : "اختر موظفاً..."}
                  <ChevronsUpDown className="ms-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
                <Command>
                  <CommandInput placeholder="ابحث عن موظف..." />
                  <CommandList>
                    <CommandEmpty>لا توجد نتائج</CommandEmpty>
                    <CommandGroup>
                      {employees.map(e => (
                        <CommandItem key={e.id} value={e.full_name} onSelect={() => { setEmployeeId(e.id); setPickerOpen(false); }}>
                          <Check className={cn("me-2 h-4 w-4", employeeId === e.id ? "opacity-100" : "opacity-0")} />
                          {e.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>وقت الدخول</Label>
              <Input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
            </div>
            <div>
              <Label>وقت الخروج</Label>
              <Input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>السبب</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">عدد الأيام</span>
              <Badge variant="secondary">{daysCount} يوم</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ساعات كل يوم</span>
              <Badge variant="secondary">{totalHoursPerDay} س</Badge>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-700 pt-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              الأيام التي فيها بصمات مسبقاً سيتم تخطيها تلقائياً (لن يتم دهسها).
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>إلغاء</Button>
          <Button onClick={handleRun} disabled={!canRun} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            توليد البصمات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}