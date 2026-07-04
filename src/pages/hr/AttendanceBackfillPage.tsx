import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import BackButton from "@/components/BackButton";
import {
  ArrowLeft, Save, RefreshCw, Eye, Users, Calendar, Clock, FileText,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronDown, Fingerprint,
  ListChecks, Trash2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  full_name: string;
  branch_id: string | null;
  branches?: { name_ar?: string | null; name?: string | null } | null;
}

interface PreviewRow {
  employeeId: string;
  employeeName: string;
  date: string;
  weekday: string;
  existing: boolean;
  checkIn: string;
  checkOut: string;
  hours: number;
}

interface ResultRow {
  employeeName: string;
  inserted: number;
  skipped: number;
  failed: number;
  error?: string;
}

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default function AttendanceBackfillPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [checkIn, setCheckIn] = useState("08:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [weekendDay, setWeekendDay] = useState<number>(5); // Friday
  const [reason, setReason] = useState("موظف جديد — تعبئة بصمات بأثر رجعي");

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);

  // Load employees
  useEffect(() => {
    (async () => {
      setLoadingEmps(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, branches(name_ar, name)")
        .eq("is_active", true)
        .order("full_name");
      if (error) toast({ title: "خطأ في تحميل الموظفين", description: error.message, variant: "destructive" });
      else setEmployees((data || []) as any);
      setLoadingEmps(false);
    })();
  }, []);

  const selectedEmployees = useMemo(
    () => employees.filter(e => selectedIds.includes(e.id)),
    [employees, selectedIds]
  );

  const totalHoursPerDay = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const [ih, im] = checkIn.split(":").map(Number);
    const [oh, om] = checkOut.split(":").map(Number);
    let mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
  }, [checkIn, checkOut]);

  const daysInRange = useMemo(() => {
    if (!fromDate || !toDate) return [];
    const out: string[] = [];
    const a = new Date(fromDate + "T00:00:00");
    const b = new Date(toDate + "T00:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || a > b) return [];
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      if (skipWeekends && d.getDay() === weekendDay) continue;
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [fromDate, toDate, skipWeekends, weekendDay]);

  const totalCells = selectedEmployees.length * daysInRange.length;

  const runPreview = useCallback(async () => {
    if (selectedEmployees.length === 0 || daysInRange.length === 0) {
      setPreview([]);
      return;
    }
    setLoadingPreview(true);
    try {
      // Fetch existing days for selected employees within range
      const { data: existingDays, error } = await supabase
        .from("attendance_days")
        .select("employee_id, attendance_date, first_check_in, last_check_out")
        .in("employee_id", selectedIds)
        .gte("attendance_date", fromDate)
        .lte("attendance_date", toDate);
      if (error) throw error;

      const existingSet = new Set<string>(
        (existingDays || [])
          .filter((r: any) => r.first_check_in || r.last_check_out)
          .map((r: any) => `${r.employee_id}|${r.attendance_date}`)
      );

      const rows: PreviewRow[] = [];
      for (const emp of selectedEmployees) {
        for (const d of daysInRange) {
          const dt = new Date(d + "T00:00:00");
          rows.push({
            employeeId: emp.id,
            employeeName: emp.full_name,
            date: d,
            weekday: WEEKDAYS_AR[dt.getDay()],
            existing: existingSet.has(`${emp.id}|${d}`),
            checkIn,
            checkOut,
            hours: totalHoursPerDay,
          });
        }
      }
      setPreview(rows);
    } catch (e: any) {
      toast({ title: "فشل المعاينة", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  }, [selectedEmployees, selectedIds, daysInRange, fromDate, toDate, checkIn, checkOut, totalHoursPerDay]);

  useEffect(() => {
    runPreview();
  }, [runPreview]);

  const willInsertCount = preview.filter(p => !p.existing).length;
  const willSkipCount = preview.filter(p => p.existing).length;

  const canRun =
    !running &&
    selectedEmployees.length > 0 &&
    daysInRange.length > 0 &&
    !!checkIn && !!checkOut &&
    reason.trim().length > 0 &&
    willInsertCount > 0;

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    setResults([]);
    const out: ResultRow[] = [];
    try {
      for (const emp of selectedEmployees) {
        try {
          const { data, error } = await supabase.rpc("hr_backfill_attendance" as any, {
            p_employee_id: emp.id,
            p_from: fromDate,
            p_to: toDate,
            p_check_in: checkIn + ":00",
            p_check_out: checkOut + ":00",
            p_reason: reason.trim(),
          });
          if (error) throw error;
          const r: any = data || {};
          out.push({
            employeeName: emp.full_name,
            inserted: r.inserted ?? 0,
            skipped: r.skipped ?? 0,
            failed: r.failed ?? 0,
          });
        } catch (e: any) {
          out.push({
            employeeName: emp.full_name,
            inserted: 0, skipped: 0, failed: daysInRange.length,
            error: e?.message || String(e),
          });
        }
        setResults([...out]);
      }
      const totIns = out.reduce((s, r) => s + r.inserted, 0);
      const totFail = out.reduce((s, r) => s + r.failed, 0);
      toast({
        title: totFail > 0 ? "اكتملت العملية مع أخطاء" : "تم التوليد بنجاح",
        description: `تم إدراج ${totIns} بصمة لـ ${out.length} موظف${totFail > 0 ? ` — ${totFail} فشل` : ""}`,
        variant: totFail > 0 ? "destructive" : "default",
      });
      await runPreview();
    } finally {
      setRunning(false);
    }
  };

  const toggleEmp = (id: string) => {
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const clearSelection = () => setSelectedIds([]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Command Bar — Dynamics-style */}
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="flex items-center gap-2 px-4 h-11">
          <BackButton />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Fingerprint className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">توليد بصمات الحضور بأثر رجعي</h1>
          <span className="text-xs text-muted-foreground">· قيد جماعي (Employee attendance backfill)</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="gap-1" onClick={runPreview} disabled={loadingPreview}>
            <RefreshCw className={cn("h-3.5 w-3.5", loadingPreview && "animate-spin")} /> تحديث المعاينة
          </Button>
          <Button size="sm" onClick={handleRun} disabled={!canRun} className="gap-1">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            حفظ وترحيل
          </Button>
        </div>
        {/* Sub-bar with counts */}
        <div className="flex items-center gap-4 px-4 h-9 border-t bg-muted/40 text-xs">
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" /> موظفون: <b>{selectedEmployees.length}</b></span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> أيام: <b>{daysInRange.length}</b></span>
          <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5 text-muted-foreground" /> إجمالي البصمات: <b>{totalCells}</b></span>
          <Separator orientation="vertical" className="h-4" />
          <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> ستُدرج: <b>{willInsertCount}</b></span>
          <span className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> ستُتخطى (موجودة): <b>{willSkipCount}</b></span>
          <div className="flex-1" />
          {running && <span className="text-primary flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> جاري الترحيل...</span>}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Form (FastTabs style) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Employees fast-tab */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">الموظفون</span>
              <Badge variant="secondary" className="ms-auto">{selectedEmployees.length}</Badge>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 justify-between gap-2">
                      <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> إضافة موظف</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0 pointer-events-auto" align="start">
                    <Command>
                      <CommandInput placeholder="ابحث عن موظف..." />
                      <CommandList>
                        <CommandEmpty>{loadingEmps ? "جارٍ التحميل..." : "لا توجد نتائج"}</CommandEmpty>
                        <CommandGroup>
                          {employees.map(e => (
                            <CommandItem key={e.id} value={e.full_name} onSelect={() => toggleEmp(e.id)}>
                              <Checkbox checked={selectedIds.includes(e.id)} className="me-2" />
                              <div className="flex-1">
                                <div className="text-sm">{e.full_name}</div>
                                {e.branches?.name_ar && <div className="text-[10px] text-muted-foreground">{e.branches.name_ar}</div>}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedIds.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearSelection} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {selectedEmployees.length > 0 && (
                <ScrollArea className="max-h-40">
                  <div className="flex flex-wrap gap-1">
                    {selectedEmployees.map(e => (
                      <Badge key={e.id} variant="outline" className="gap-1 pe-1">
                        {e.full_name}
                        <button
                          onClick={() => toggleEmp(e.id)}
                          className="ms-1 rounded-sm hover:bg-destructive/20 p-0.5"
                          aria-label="إزالة"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </Card>

          {/* Period fast-tab */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">الفترة الزمنية</span>
            </div>
            <div className="p-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">من تاريخ</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">إلى تاريخ</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8" />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <Checkbox id="skip-weekends" checked={skipWeekends} onCheckedChange={(v) => setSkipWeekends(!!v)} />
                <Label htmlFor="skip-weekends" className="text-xs cursor-pointer">تخطي يوم الراحة الأسبوعي</Label>
                {skipWeekends && (
                  <select
                    value={weekendDay}
                    onChange={e => setWeekendDay(Number(e.target.value))}
                    className="text-xs border rounded px-1 py-0.5 bg-background"
                  >
                    {WEEKDAYS_AR.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                )}
              </div>
            </div>
          </Card>

          {/* Times fast-tab */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">أوقات البصمة</span>
              <Badge variant="secondary" className="ms-auto">{totalHoursPerDay} س / يوم</Badge>
            </div>
            <div className="p-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">وقت الدخول</Label>
                <Input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">وقت الخروج</Label>
                <Input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="h-8" />
              </div>
            </div>
          </Card>

          {/* Reason fast-tab */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">السبب (إجباري)</span>
            </div>
            <div className="p-3">
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="مثال: موظف جديد — تعبئة بصمات من بداية الشهر" />
              <p className="text-[10px] text-muted-foreground mt-1">
                يُسجَّل في سجل التدقيق (attendance_audit_logs) مع اسم المستخدم والوقت.
              </p>
            </div>
          </Card>
        </div>

        {/* Right column: Preview grid + Results */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">معاينة قبل الترحيل</span>
              <div className="ms-auto flex items-center gap-2 text-xs">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">إدراج: {willInsertCount}</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">تخطي: {willSkipCount}</Badge>
              </div>
            </div>
            <ScrollArea className="max-h-[520px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">اليوم</TableHead>
                    <TableHead className="text-right">دخول</TableHead>
                    <TableHead className="text-right">خروج</TableHead>
                    <TableHead className="text-right">ساعات</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">
                        اختر موظفاً وحدد فترة لبدء المعاينة
                      </TableCell>
                    </TableRow>
                  ) : preview.map((r, i) => (
                    <TableRow key={i} className={cn(r.existing && "opacity-60 bg-amber-50/30")}>
                      <TableCell className="text-sm">{r.employeeName}</TableCell>
                      <TableCell className="text-xs font-mono">{r.date}</TableCell>
                      <TableCell className="text-xs">{r.weekday}</TableCell>
                      <TableCell className="text-xs font-mono">{r.checkIn}</TableCell>
                      <TableCell className="text-xs font-mono">{r.checkOut}</TableCell>
                      <TableCell className="text-xs">{r.hours}</TableCell>
                      <TableCell>
                        {r.existing ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" /> موجودة — تُتخطى
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                            <Plus className="h-3 w-3" /> ستُدرج
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>

          {results.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">نتائج الترحيل</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">أُدرج</TableHead>
                    <TableHead className="text-right">تُخطي</TableHead>
                    <TableHead className="text-right">فشل</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{r.employeeName}</TableCell>
                      <TableCell><Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{r.inserted}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{r.skipped}</Badge></TableCell>
                      <TableCell>
                        {r.failed > 0
                          ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{r.failed}</Badge>
                          : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.error || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-3 border-t bg-muted/30 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/hr-attendance?tab=monthly")}>
                  فتح كشف الحضور الشهري
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}