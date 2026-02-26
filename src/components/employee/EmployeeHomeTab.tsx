import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogIn, LogOut, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Timer, MapPin
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState, useEffect } from "react";

type AttendanceDay = {
  id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  overtime_hours: number;
  status: string;
  branch_id: string | null;
  notes: string | null;
};

const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  present: { label: "حاضر", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: <CheckCircle2 className="h-4 w-4" /> },
  late: { label: "متأخر", color: "bg-warning/10 text-warning border-warning/20", icon: <Clock className="h-4 w-4" /> },
  absent: { label: "غائب", color: "bg-destructive/10 text-destructive border-destructive/20", icon: <XCircle className="h-4 w-4" /> },
  incomplete: { label: "ناقص", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: <AlertTriangle className="h-4 w-4" /> },
  leave: { label: "إجازة", color: "bg-info/10 text-info border-info/20", icon: <Calendar className="h-4 w-4" /> },
  holiday: { label: "عطلة", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <Calendar className="h-4 w-4" /> },
};

interface Props {
  employeeName: string;
  todayRecord: AttendanceDay | null;
  onScanTap: () => void;
}

export default function EmployeeHomeTab({ employeeName, todayRecord, onScanTap }: Props) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const canCheckIn = !todayRecord || !todayRecord.first_check_in;
  const canCheckOut = todayRecord?.first_check_in && !todayRecord?.last_check_out;
  const status = todayRecord ? statusMap[todayRecord.status] || statusMap.absent : null;

  return (
    <div className="space-y-5 px-4 pt-2 pb-24" dir="rtl">
      {/* Greeting */}
      <div className="pt-2">
        <p className="text-sm text-muted-foreground">مرحباً 👋</p>
        <h1 className="text-xl font-bold text-foreground">{employeeName}</h1>
      </div>

      {/* Clock Card */}
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-5 text-center">
          <div className="text-4xl font-bold tabular-nums text-primary" style={{ fontFeatureSettings: "'tnum' 1" }}>
            {format(currentTime, "HH:mm:ss")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
          </p>
        </CardContent>
      </Card>

      {/* Today Status */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Timer className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">حالة اليوم</h3>
                {status ? (
                  <Badge variant="outline" className={`${status.color} mt-0.5 text-[10px]`}>
                    {status.icon}
                    <span className="mr-1">{status.label}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">لم تسجّل بعد</span>
                )}
              </div>
            </div>
            {todayRecord?.total_hours ? (
              <div className="text-left">
                <span className="text-2xl font-bold tabular-nums">{todayRecord.total_hours.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground mr-1">ساعة</span>
              </div>
            ) : null}
          </div>

          {/* Check-in / Check-out times */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <LogIn className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
              <div className="text-[10px] text-muted-foreground">دخول</div>
              <div className="font-semibold text-sm">
                {todayRecord?.first_check_in
                  ? format(new Date(todayRecord.first_check_in), "hh:mm a")
                  : "—"}
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <LogOut className="h-4 w-4 mx-auto mb-1 text-destructive" />
              <div className="text-[10px] text-muted-foreground">خروج</div>
              <div className="font-semibold text-sm">
                {todayRecord?.last_check_out
                  ? format(new Date(todayRecord.last_check_out), "hh:mm a")
                  : "—"}
              </div>
            </div>
          </div>

          {/* Action Button */}
          {(canCheckIn || canCheckOut) && (
            <Button
              size="lg"
              className="w-full h-14 text-base rounded-2xl gap-2 font-semibold"
              variant={canCheckOut ? "outline" : "default"}
              onClick={onScanTap}
            >
              {canCheckOut ? (
                <>
                  <LogOut className="h-5 w-5" />
                  تسجيل خروج
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  تسجيل دخول
                </>
              )}
            </Button>
          )}

          {!canCheckIn && !canCheckOut && todayRecord && (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                تم تسجيل حضورك وانصرافك لهذا اليوم
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Geofence note */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <MapPin className="h-3 w-3 shrink-0" />
        <span>يتم التحقق من موقعك الجغرافي تلقائياً عند التسجيل</span>
      </div>
    </div>
  );
}
