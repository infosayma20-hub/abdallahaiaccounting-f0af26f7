import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Filter, MoreHorizontal, Eye, Pencil, MessageSquare, FileText, Send } from "lucide-react";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import { tAttendanceStatus, tEventType, attendanceStatusTone } from "@/lib/hrLabels";
import { HRTable, HRTHead, HRTH, HRTR, HRTD } from "../HRTable";

interface Props {
  data: Employee360Data;
}

type StatusFilter = "all" | "present" | "late" | "absent" | "incomplete" | "leave";
type RangeKey = "30" | "60" | "90" | "month" | "all";

function isInRange(dateStr: string, range: RangeKey, customFrom?: string, customTo?: string) {
  if (!dateStr) return false;
  if (customFrom || customTo) {
    if (customFrom && dateStr < customFrom) return false;
    if (customTo && dateStr > customTo) return false;
    return true;
  }
  if (range === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  const days = parseInt(range, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

function statusBucket(s: string): StatusFilter | null {
  const k = (s || "").toLowerCase();
  if (["present", "complete", "حاضر", "مكتمل"].includes(k)) return "present";
  if (["late", "متأخر"].includes(k)) return "late";
  if (["absent", "غائب"].includes(k)) return "absent";
  if (["incomplete", "ناقص"].includes(k)) return "incomplete";
  if (["on_leave", "leave", "إجازة"].includes(k)) return "leave";
  return null;
}

export function AttendanceTab({ data }: Props) {
  const allDays = data.attendance.days || [];
  const stats = data.attendance.stats;
  const lastEvent = data.attendance.events?.[0];

  const [range, setRange] = useState<RangeKey>("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return allDays.filter((d: any) => {
      if (!isInRange(d.attendance_date, range, from, to)) return false;
      if (status !== "all" && statusBucket(d.status) !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${d.attendance_date} ${d.notes || ""} ${tAttendanceStatus(d.status)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allDays, range, from, to, status, search]);

  const resetFilters = () => {
    setRange("30");
    setFrom("");
    setTo("");
    setStatus("all");
    setSearch("");
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniCard label="إجمالي الأيام" value={stats.totalDays} />
        <MiniCard label="حاضر" value={stats.presentDays} tone="positive" />
        <MiniCard label="متأخر" value={stats.lateDays} tone="warning" />
        <MiniCard label="غائب" value={stats.absentDays} tone="danger" />
        <MiniCard label="ساعات إضافية" value={`${stats.totalOvertime.toFixed(1)}`} tone="primary" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">آخر تسجيل دخول</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          {lastEvent ? (
            <div className="flex items-center justify-between text-sm">
              <Badge variant="outline">{tEventType(lastEvent.event_type)}</Badge>
              <span className="text-muted-foreground">
                {new Date(lastEvent.event_time).toLocaleString("ar")}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد سجلات دخول حديثة.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base text-right">سجل الحضور</CardTitle>
            <span className="text-xs text-muted-foreground">
              {filtered.length} من {allDays.length} يوم
            </span>
          </div>
        </CardHeader>

        {/* Filter bar */}
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={range} onValueChange={(v) => { setRange(v as RangeKey); setFrom(""); setTo(""); }}>
              <SelectTrigger className="h-8 w-auto min-w-[140px]">
                <SelectValue placeholder="الفترة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">آخر 30 يوم</SelectItem>
                <SelectItem value="60">آخر 60 يوم</SelectItem>
                <SelectItem value="90">آخر 90 يوم</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="all">الكل</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">من</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[140px]"
              />
              <span className="text-xs text-muted-foreground">إلى</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>

            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-auto min-w-[120px]">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="present">حاضر</SelectItem>
                <SelectItem value="late">متأخر</SelectItem>
                <SelectItem value="absent">غائب</SelectItem>
                <SelectItem value="incomplete">ناقص</SelectItem>
                <SelectItem value="leave">إجازة</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative ms-auto">
              <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في السجل..."
                className="h-8 pe-2 ps-8 w-[220px]"
              />
            </div>

            <Button variant="ghost" size="sm" className="h-8" onClick={resetFilters}>
              إعادة تعيين
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              لا توجد سجلات حضور تطابق الفلاتر.
            </p>
          ) : (
            <HRTable>
              <HRTHead>
                <HRTH>التاريخ</HRTH>
                <HRTH>دخول</HRTH>
                <HRTH>خروج</HRTH>
                <HRTH>الساعات</HRTH>
                <HRTH>إضافي</HRTH>
                <HRTH>الحالة</HRTH>
                <HRTH>الملاحظات</HRTH>
                <HRTH className="w-12">إجراءات</HRTH>
              </HRTHead>
              <tbody>
                  {filtered.map((d: any) => (
                    <HRTR key={d.id}>
                      <HRTD numeric>{d.attendance_date}</HRTD>
                      <HRTD numeric className="text-muted-foreground">
                        {d.first_check_in
                          ? new Date(d.first_check_in).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </HRTD>
                      <HRTD numeric className="text-muted-foreground">
                        {d.last_check_out
                          ? new Date(d.last_check_out).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </HRTD>
                      <HRTD numeric>
                        {Number(d.total_hours || 0).toFixed(1)}
                      </HRTD>
                      <HRTD numeric>
                        {Number(d.overtime_hours || 0).toFixed(1)}
                      </HRTD>
                      <HRTD>
                        <Badge variant="outline" className={attendanceStatusTone(d.status)}>
                          {tAttendanceStatus(d.status)}
                        </Badge>
                      </HRTD>
                      <HRTD className="text-muted-foreground truncate max-w-[200px]">
                        {d.notes || "—"}
                      </HRTD>
                      <HRTD>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem disabled>
                              <Eye className="h-3.5 w-3.5 ms-2" /> عرض البصمات
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Pencil className="h-3.5 w-3.5 ms-2" /> تعديل يدوي
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Send className="h-3.5 w-3.5 ms-2" /> طلب توضيح
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <FileText className="h-3.5 w-3.5 ms-2" /> طلب تصحيح
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <MessageSquare className="h-3.5 w-3.5 ms-2" /> إضافة ملاحظة
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </HRTD>
                    </HRTR>
                  ))}
                </tbody>
            </HRTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: any;
  tone?: "neutral" | "positive" | "warning" | "danger" | "primary";
}) {
  const cls = {
    neutral: "text-foreground",
    positive: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-rose-700 dark:text-rose-400",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </Card>
  );
}
