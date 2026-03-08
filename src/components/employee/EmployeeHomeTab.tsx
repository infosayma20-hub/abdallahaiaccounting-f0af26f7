import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogIn, LogOut, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Timer, MapPin, QrCode, ClipboardList, Send, User, ChevronLeft, ShoppingCart
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { ar } from "date-fns/locale";
import { useState, useEffect, useMemo } from "react";

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
  leave: { label: "إجازة", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: <Calendar className="h-4 w-4" /> },
  holiday: { label: "عطلة", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <Calendar className="h-4 w-4" /> },
};

interface Props {
  employeeName: string;
  todayRecord: AttendanceDay | null;
  history: AttendanceDay[];
  onScanTap: () => void;
  onNavigate: (tab: string) => void;
  isCashier?: boolean;
  onOpenPOS?: () => void;
}

export default function EmployeeHomeTab({ employeeName, todayRecord, history, onScanTap, onNavigate, isCashier, onOpenPOS }: Props) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const canCheckIn = !todayRecord || !todayRecord.first_check_in;
  const canCheckOut = todayRecord?.first_check_in && !todayRecord?.last_check_out;
  const dayComplete = todayRecord?.first_check_in && todayRecord?.last_check_out;
  const status = todayRecord ? statusMap[todayRecord.status] || null : null;

  // Elapsed time since check-in
  const elapsed = useMemo(() => {
    if (!todayRecord?.first_check_in || todayRecord?.last_check_out) return null;
    const mins = differenceInMinutes(currentTime, new Date(todayRecord.first_check_in));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [todayRecord, currentTime]);

  // Completed day summary
  const completedSummary = useMemo(() => {
    if (!dayComplete || !todayRecord) return null;
    const totalMins = differenceInMinutes(new Date(todayRecord.last_check_out!), new Date(todayRecord.first_check_in!));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [dayComplete, todayRecord]);

  // Monthly stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthDays = history.filter(d => {
      const date = new Date(d.attendance_date);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    return {
      present: monthDays.filter(d => d.status === "present").length,
      late: monthDays.filter(d => d.status === "late").length,
      absent: monthDays.filter(d => d.status === "absent").length,
      totalHours: monthDays.reduce((s, d) => s + (d.total_hours || 0), 0),
    };
  }, [history]);

  // Last 5 days
  const last5 = useMemo(() => history.slice(0, 5), [history]);

  const statusIcon = (s: string) => {
    switch (s) {
      case "present": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "late": return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
      case "absent": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "incomplete": return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4 px-4 pt-2 pb-24" dir="rtl">
      {/* Welcome Banner */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0A2342 0%, #0D3158 100%)" }}
      >
        <div className="relative z-10">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Tajawal, sans-serif" }}>مرحباً 👋</p>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>{employeeName}</h1>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Tajawal, sans-serif" }}>
            {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
          </p>
        </div>
      </div>

      {/* POS Quick Access for Cashiers */}
      {isCashier && onOpenPOS && (
        <Button
          onClick={onOpenPOS}
          className="w-full h-14 text-lg gap-3"
          style={{ background: "#0A2342", color: "white" }}
        >
          <ShoppingCart className="w-6 h-6" />
          فتح نقطة البيع
        </Button>
      )}

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

      {/* Today Status & Action */}
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
                  <span className="text-xs text-muted-foreground">🟡 لم تسجّل بعد</span>
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

          {/* Elapsed time */}
          {elapsed && (
            <p className="text-xs text-center text-muted-foreground mb-3">
              ⏱️ دخلت منذ {elapsed}
            </p>
          )}

          {/* Action Buttons */}
          {canCheckIn && (
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onScanTap}
              >
                <LogIn className="h-5 w-5" />
                تسجيل دخول
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl"
                onClick={onScanTap}
              >
                <QrCode className="h-5 w-5" />
              </Button>
            </div>
          )}

          {canCheckOut && (
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={onScanTap}
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl"
                onClick={onScanTap}
              >
                <QrCode className="h-5 w-5" />
              </Button>
            </div>
          )}

          {dayComplete && (
            <div className="text-center py-3 space-y-1">
              <p className="text-sm font-medium text-emerald-500 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                انتهى يوم عملك ✅
              </p>
              <p className="text-xs text-muted-foreground">
                إجمالي العمل: {completedSummary}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">📊 إحصائيات الشهر</h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-lg font-bold tabular-nums text-emerald-500">{stats.present}</div>
              <div className="text-[10px] text-muted-foreground">✅ حاضر</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold tabular-nums text-warning">{stats.late}</div>
              <div className="text-[10px] text-muted-foreground">⚠️ متأخر</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold tabular-nums text-destructive">{stats.absent}</div>
              <div className="text-[10px] text-muted-foreground">❌ غياب</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold tabular-nums text-foreground">{stats.totalHours.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">⏱️ ساعة</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last 5 Days */}
      {last5.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">📅 آخر 5 أيام</h3>
            <div className="space-y-2">
              {last5.map(day => (
                <div key={day.id} className="flex items-center justify-between bg-secondary/30 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    {statusIcon(day.status)}
                    <span className="text-xs font-medium">
                      {format(new Date(day.attendance_date), "dd/MM EEEE", { locale: ar }).slice(0, 12)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                    {day.status === "absent" ? (
                      <span className="text-destructive">غياب</span>
                    ) : (
                      <>
                        <span>{day.first_check_in ? format(new Date(day.first_check_in), "HH:mm") : "—"}</span>
                        <ChevronLeft className="h-3 w-3" />
                        <span>{day.last_check_out ? format(new Date(day.last_check_out), "HH:mm") : "—"}</span>
                        {day.total_hours > 0 && (
                          <span className="text-foreground font-medium">({day.total_hours.toFixed(1)}h)</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-14 rounded-2xl gap-2 text-sm border-border"
          onClick={() => onNavigate("history")}
        >
          <ClipboardList className="h-4 w-4" />
          سجلي الكامل
        </Button>
        <Button
          variant="outline"
          className="h-14 rounded-2xl gap-2 text-sm border-border"
          onClick={() => onNavigate("requests")}
        >
          <Send className="h-4 w-4" />
          طلب إجازة / سلفة
        </Button>
        <Button
          variant="outline"
          className="h-14 rounded-2xl gap-2 text-sm border-border"
          onClick={() => onNavigate("alerts")}
        >
          <AlertTriangle className="h-4 w-4" />
          تنبيهات وتصحيحات
        </Button>
        <Button
          variant="outline"
          className="h-14 rounded-2xl gap-2 text-sm border-border"
          onClick={() => onNavigate("profile")}
        >
          <User className="h-4 w-4" />
          ملفي الشخصي
        </Button>
      </div>

      {/* Geofence note */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <MapPin className="h-3 w-3 shrink-0" />
        <span>يتم التحقق من موقعك الجغرافي تلقائياً عند التسجيل</span>
      </div>
    </div>
  );
}
