import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, CheckCircle2, Clock, XCircle, AlertTriangle, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay, subMonths, addMonths } from "date-fns";
import { ar } from "date-fns/locale";

type AttendanceDay = {
  id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  overtime_hours: number;
  status: string;
};

const statusColors: Record<string, string> = {
  present: "bg-primary",
  late: "bg-warning",
  absent: "bg-destructive",
  incomplete: "bg-orange-500",
  leave: "bg-info",
  holiday: "bg-purple-500",
};

const statusLabels: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  incomplete: "ناقص",
  leave: "إجازة",
  holiday: "عطلة",
};

interface Props {
  history: AttendanceDay[];
}

export default function AttendanceCalendarTab({ history }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<AttendanceDay | null>(null);

  const dayMap = useMemo(() => {
    const map = new Map<string, AttendanceDay>();
    history.forEach((d) => map.set(d.attendance_date, d));
    return map;
  }, [history]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start of month (Saturday = 6 is first day in Arabic calendar)
  const startDay = getDay(monthStart);
  const padDays = (startDay + 1) % 7; // Adjust for Saturday start

  const stats = useMemo(() => {
    const monthDays = history.filter((d) => {
      const date = new Date(d.attendance_date);
      return isSameMonth(date, currentMonth);
    });
    return {
      present: monthDays.filter((d) => d.status === "present").length,
      late: monthDays.filter((d) => d.status === "late").length,
      absent: monthDays.filter((d) => d.status === "absent").length,
      totalHours: monthDays.reduce((s, d) => s + (d.total_hours || 0), 0),
    };
  }, [history, currentMonth]);

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-base">
          {format(currentMonth, "MMMM yyyy", { locale: ar })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "حضور", value: stats.present, color: "text-primary" },
          { label: "تأخير", value: stats.late, color: "text-warning" },
          { label: "غياب", value: stats.absent, color: "text-destructive" },
          { label: "ساعات", value: stats.totalHours.toFixed(0), color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label} className="border-border bg-card">
            <CardContent className="p-3 text-center">
              <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar grid */}
      <Card className="border-border bg-card">
        <CardContent className="p-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["سبت", "أحد", "إثن", "ثلا", "أرب", "خمي", "جمع"].map((d) => (
              <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: padDays }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const record = dayMap.get(dateStr);
              const today = isToday(day);

              return (
                <button
                  key={dateStr}
                  onClick={() => record && setSelectedDay(record)}
                  className={`relative aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
                    today ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                  } ${record ? "cursor-pointer hover:bg-secondary" : "text-muted-foreground/50"}`}
                >
                  {format(day, "d")}
                  {record && (
                    <span className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${statusColors[record.status] || "bg-muted"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(statusColors).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[10px] text-muted-foreground">{statusLabels[key]}</span>
          </div>
        ))}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <Card className="border-border bg-card">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                {format(new Date(selectedDay.attendance_date), "EEEE d/M", { locale: ar })}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {statusLabels[selectedDay.status] || selectedDay.status}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-secondary/50 rounded-lg p-2">
                <div className="text-muted-foreground text-[10px]">دخول</div>
                <div className="font-semibold">
                  {selectedDay.first_check_in ? format(new Date(selectedDay.first_check_in), "hh:mm a") : "—"}
                </div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <div className="text-muted-foreground text-[10px]">خروج</div>
                <div className="font-semibold">
                  {selectedDay.last_check_out ? format(new Date(selectedDay.last_check_out), "hh:mm a") : "—"}
                </div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <div className="text-muted-foreground text-[10px]">ساعات</div>
                <div className="font-semibold">{selectedDay.total_hours?.toFixed(1) || "0"}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => setSelectedDay(null)}>
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
