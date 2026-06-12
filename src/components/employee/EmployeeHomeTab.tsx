import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogIn, LogOut, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Timer, MapPin, QrCode, ClipboardList, Send, User, ChevronLeft, ShoppingCart,
  Users, CalendarDays, ClipboardCheck, Shield, Receipt, Wallet, BarChart3, CalendarRange, ChevronRight
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { ar } from "date-fns/locale";
import { useState, useEffect, useMemo } from "react";
import { getOpenAttendanceSession } from "@/lib/attendance-session";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useHasMultipleWorkspaces } from "@/hooks/useHasMultipleWorkspaces";
import { clearRoleRedirectCache } from "@/hooks/useRoleRedirect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  todayEvents?: { event_type: string; event_time: string }[];
  recentEvents?: { event_type: string; event_time: string }[];
  history: AttendanceDay[];
  onScanTap: () => void;
  onNavigate: (tab: string) => void;
  isCashier?: boolean;
  onOpenPOS?: () => void;
  canViewTeam?: boolean;
  canManageSchedule?: boolean;
  canManageAttendance?: boolean;
  isManager?: boolean;
  branchName?: string;
  companyLogo?: string | null;
  onOpenManagerRoute?: (path: string) => void;
}

export default function EmployeeHomeTab({ employeeName, todayRecord, todayEvents = [], recentEvents = [], history, onScanTap, onNavigate, isCashier, onOpenPOS, canViewTeam, canManageSchedule, canManageAttendance, isManager, branchName, companyLogo, onOpenManagerRoute }: Props) {
  const hasMgmt = !!(canViewTeam || canManageSchedule || canManageAttendance);
  const mgmtBadge = isManager ? "مدير فرع" : (canManageSchedule ? "مشرف دوام" : "مشرف");
  const [currentTime, setCurrentTime] = useState(new Date());
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasMultiple: hasMultipleWorkspaces } = useHasMultipleWorkspaces();
  const [switchOpen, setSwitchOpen] = useState(false);

  const goToWorkspaceChooser = () => {
    try {
      if (user?.id) {
        sessionStorage.removeItem(`workspace-choice:${user.id}`);
        clearRoleRedirectCache(user.id);
      }
    } catch {
      // session storage may be unavailable in restricted browsers
    }
    window.dispatchEvent(new Event("workspace-choice-changed"));
    navigate("/choose-workspace", { replace: true });
  };

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Multi check-in/out: use events to determine current state
  const lastEvent = todayEvents.length > 0 ? todayEvents[todayEvents.length - 1] : null;
  const openSession = getOpenAttendanceSession(recentEvents.length ? recentEvents : todayEvents);
  const canCheckIn = !openSession && (!lastEvent || lastEvent.event_type === "check_out");
  const canCheckOut = !!openSession;
  const dayComplete = !!(todayRecord?.total_hours && todayRecord.total_hours > 0 && canCheckIn && todayEvents.length >= 2);
  const status = todayRecord ? statusMap[todayRecord.status] || null : null;

  const elapsed = useMemo(() => {
    if (!todayRecord?.first_check_in || todayRecord?.last_check_out) return null;
    const mins = differenceInMinutes(currentTime, new Date(todayRecord.first_check_in));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [todayRecord, currentTime]);

  // ابنِ جلسات اليوم من أحداث (in→out) ودمج الجلسات الأقل من دقيقة كتكرار عابر
  const sessions = useMemo(() => {
    const MIN_MS = 60_000;
    const DEBOUNCE_MS = 60_000;
    const cleaned: { event_type: string; event_time: string }[] = [];
    for (const evt of todayEvents) {
      const last = cleaned[cleaned.length - 1];
      if (last && last.event_type === evt.event_type) {
        const gap = new Date(evt.event_time).getTime() - new Date(last.event_time).getTime();
        if (gap < DEBOUNCE_MS) continue;
      }
      cleaned.push(evt);
    }
    const result: { checkIn: string; checkOut: string | null; durationMs: number }[] = [];
    let openIn: string | null = null;
    for (const e of cleaned) {
      if (e.event_type === "check_in") {
        openIn = e.event_time;
      } else if (e.event_type === "check_out" && openIn) {
        const dur = new Date(e.event_time).getTime() - new Date(openIn).getTime();
        if (dur >= MIN_MS) result.push({ checkIn: openIn, checkOut: e.event_time, durationMs: dur });
        openIn = null;
      }
    }
    if (openIn) result.push({ checkIn: openIn, checkOut: null, durationMs: 0 });
    return result;
  }, [todayEvents]);

  const completedSummary = useMemo(() => {
    if (!dayComplete) return null;
    const totalMs = sessions.reduce((s, x) => s + (x.checkOut ? x.durationMs : 0), 0);
    const totalMins = Math.round(totalMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [dayComplete, sessions]);

  const fmtDuration = (ms: number) => {
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}د`;
    return `${h}س ${m}د`;
  };

  // Per-date sessions (Asia/Hebron) built from recentEvents. Single source for hours.
  const sessionsByDate = useMemo(() => {
    const MIN_MS = 60_000;
    const DEBOUNCE_MS = 60_000;
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit",
    });
    const byDate = new Map<string, { event_type: string; event_time: string }[]>();
    for (const e of recentEvents) {
      const key = dtf.format(new Date(e.event_time));
      const arr = byDate.get(key) || [];
      arr.push(e);
      byDate.set(key, arr);
    }
    const result = new Map<string, { firstIn: string | null; lastOut: string | null; totalMs: number; count: number }>();
    for (const [date, evs] of byDate) {
      const sorted = [...evs].sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
      const cleaned: typeof sorted = [];
      for (const evt of sorted) {
        const last = cleaned[cleaned.length - 1];
        if (last && last.event_type === evt.event_type) {
          const gap = new Date(evt.event_time).getTime() - new Date(last.event_time).getTime();
          if (gap < DEBOUNCE_MS) continue;
        }
        cleaned.push(evt);
      }
      let openIn: string | null = null;
      let totalMs = 0;
      let firstIn: string | null = null;
      let lastOut: string | null = null;
      let count = 0;
      for (const e of cleaned) {
        if (e.event_type === "check_in") {
          openIn = e.event_time;
        } else if (e.event_type === "check_out" && openIn) {
          const dur = new Date(e.event_time).getTime() - new Date(openIn).getTime();
          if (dur >= MIN_MS) {
            if (!firstIn) firstIn = openIn;
            lastOut = e.event_time;
            totalMs += dur;
            count += 1;
          }
          openIn = null;
        }
      }
      result.set(date, { firstIn, lastOut, totalMs, count });
    }
    return result;
  }, [recentEvents]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthDays = history.filter(d => {
      const date = new Date(d.attendance_date);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let totalMs = 0;
    for (const [date, s] of sessionsByDate) {
      if (date.startsWith(ym)) totalMs += s.totalMs;
    }
    return {
      present: monthDays.filter(d => d.status === "present").length,
      late: monthDays.filter(d => d.status === "late").length,
      absent: monthDays.filter(d => d.status === "absent").length,
      totalHours: totalMs / 3_600_000,
    };
  }, [history, sessionsByDate]);

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

  // Safe area bottom padding for bottom nav + extra
  const bottomPad = "calc(72px + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="space-y-3 px-4 pt-3" dir="rtl" style={{ paddingBottom: bottomPad }}>
      {/* Welcome Banner */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%)" }}
      >
        {hasMultipleWorkspaces && (
          <button
            type="button"
            aria-label="الرجوع إلى اختيار مساحة العمل"
            onClick={() => setSwitchOpen(true)}
            className="absolute top-2 left-2 z-20 h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur border border-white/20 flex items-center justify-center text-primary-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <div className="relative z-10 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-primary-foreground/60">مرحباً</p>
            <h1 className="text-xl font-bold text-primary-foreground truncate">{employeeName}</h1>
            <p className="text-xs mt-1 text-primary-foreground/50">
              {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
            </p>
          {hasMgmt && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20">
              <Shield className="h-3 w-3 text-primary-foreground" />
              <span className="text-[11px] font-semibold text-primary-foreground">
                {mgmtBadge}{branchName ? ` • ${branchName}` : ""}
              </span>
            </div>
          )}
          </div>
          {companyLogo && (
            <img
              src={companyLogo}
              alt="شعار الشركة"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              className="h-14 w-14 rounded-xl bg-white object-contain p-1.5 shrink-0 border border-white/30 shadow-md"
            />
          )}
        </div>
        {/* Decorative circle */}
        <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-white/5" />
      </div>

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">الرجوع إلى اختيار مساحة العمل</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل تريد الرجوع إلى صفحة اختيار مساحة العمل لتبديل التطبيق؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <AlertDialogAction onClick={goToWorkspaceChooser}>نعم، رجوع</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manager Section */}
      {hasMgmt && (
        <Card className="border-primary/20 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">إدارة الفريق</h3>
                  <p className="text-[10px] text-muted-foreground">أدوات المشرف لفرعك فقط</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {canManageSchedule && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-border active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/roster")}
                >
                  <CalendarDays className="h-4 w-4 text-primary" />
                  جدول الدوام
                </Button>
              )}
              {canManageAttendance && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-border active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/team-attendance")}
                >
                  <ClipboardCheck className="h-4 w-4 text-emerald-500" />
                  حضور الفريق
                </Button>
              )}
              {canViewTeam && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-border active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/team")}
                >
                  <Users className="h-4 w-4 text-primary" />
                  فريقي
                </Button>
              )}
              {canManageSchedule && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-border active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/shift-swaps")}
                >
                  <Send className="h-4 w-4 text-warning" />
                  تبديل الورديات
                </Button>
              )}
              {canManageAttendance && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-border active:scale-[0.97] transition-transform col-span-2"
                  onClick={() => onOpenManagerRoute?.("/employee/team-requests")}
                >
                  <ClipboardList className="h-4 w-4 text-primary" />
                  اعتماد / رفض طلبات الفريق
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Clock */}
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-4 text-center">
          <div className="text-5xl font-bold tabular-nums text-primary tracking-tight" style={{ fontFeatureSettings: "'tnum' 1", fontFamily: "JetBrains Mono, monospace" }}>
            {format(currentTime, "HH:mm")}
            <span className="text-2xl text-primary/50">:{format(currentTime, "ss")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Today Status & Action */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
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
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    لم تسجّل بعد
                  </span>
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

          {/* Sessions Timeline — يعرض كل جلسات اليوم (دخول/خروج/مغادرة/رجوع) */}
          {sessions.length > 0 ? (
            <div className="bg-secondary/40 rounded-xl p-3 mb-3 space-y-2">
              <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
                <Timer className="h-3 w-3" />
                جلسات اليوم ({sessions.length})
              </div>
              {sessions.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      {s.checkOut && <div className="w-px h-3 bg-border" />}
                      {s.checkOut && <div className="w-2 h-2 rounded-full bg-destructive" />}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium tabular-nums text-foreground">
                        دخول {format(new Date(s.checkIn), "hh:mm a")}
                      </span>
                      {s.checkOut ? (
                        <span className="font-medium tabular-nums text-foreground">
                          خروج {format(new Date(s.checkOut), "hh:mm a")}
                        </span>
                      ) : (
                        <span className="text-emerald-500 text-[10px] font-semibold">
                          ● جلسة مفتوحة
                        </span>
                      )}
                    </div>
                  </div>
                  {s.checkOut && (
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {fmtDuration(s.durationMs)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-secondary/50 rounded-xl p-4 text-center text-xs text-muted-foreground mb-3">
              لم تُسجّل أي بصمة اليوم بعد
            </div>
          )}

          {/* Elapsed time */}
          {elapsed && (
            <p className="text-xs text-center text-muted-foreground mb-3 inline-flex items-center justify-center gap-1 w-full">
              <Timer className="h-3.5 w-3.5" />
              دخلت منذ {elapsed}
            </p>
          )}

          {/* Action Buttons */}
          {canCheckIn && (
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.97] transition-transform"
                onClick={onScanTap}
              >
                <LogIn className="h-5 w-5" />
                تسجيل دخول
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl active:scale-95 transition-transform"
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
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground active:scale-[0.97] transition-transform"
                onClick={onScanTap}
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl active:scale-95 transition-transform"
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
                انتهى يوم عملك
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
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            إحصائيات الشهر
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "حاضر", value: stats.present, Icon: CheckCircle2, color: "text-emerald-500" },
              { label: "متأخر", value: stats.late, Icon: AlertTriangle, color: "text-warning" },
              { label: "غياب", value: stats.absent, Icon: XCircle, color: "text-destructive" },
              { label: "ساعة", value: stats.totalHours.toFixed(0), Icon: Clock, color: "text-foreground" },
            ].map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => onNavigate("attendance")}
                aria-label={`فتح سجل دوامي - ${s.label === "ساعة" ? "الساعات" : s.label}`}
                className="text-center bg-secondary/30 rounded-xl p-2.5 cursor-pointer hover:bg-slate-50 hover:border-slate-300 border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.97]"
              >
                <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground inline-flex items-center justify-center gap-1">
                  <s.Icon className={`h-3 w-3 ${s.color}`} />
                  {s.label}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Last 5 Days */}
      {last5.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              آخر 5 أيام
            </h3>
            <div className="space-y-1.5">
              {last5.map(day => {
                const s = sessionsByDate.get(day.attendance_date);
                const inT = s?.firstIn ?? day.first_check_in;
                const outT = s?.lastOut ?? day.last_check_out;
                const hrs = s ? s.totalMs / 3_600_000 : (day.total_hours || 0);
                const sessCount = s?.count ?? 0;
                return (
                  <div key={day.id} className="flex items-center justify-between bg-secondary/30 rounded-xl p-2.5">
                    <div className="flex items-center gap-2">
                      {statusIcon(day.status)}
                      <span className="text-xs font-medium">
                        {format(new Date(day.attendance_date), "dd/MM EEEE", { locale: ar }).slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
                      {day.status === "absent" ? (
                        <span className="text-destructive text-xs">غياب</span>
                      ) : (
                        <>
                          <span>{inT ? new Date(inT).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hebron" }) : "—"}</span>
                          <ChevronLeft className="h-3 w-3" />
                          <span>{outT ? new Date(outT).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hebron" }) : "—"}</span>
                          {hrs > 0 && (
                            <span className="text-foreground font-medium">({hrs.toFixed(2)}h)</span>
                          )}
                          {sessCount > 1 && (
                            <span className="text-primary text-[10px]">· {sessCount} جلسات</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Receipt, label: "قسائم الراتب", tab: "payslips" },
          { icon: Wallet, label: "ملخصي المالي", tab: "financials" },
          { icon: CalendarDays, label: "سجل دوامي", tab: "attendance" },
          { icon: Calendar, label: "وردياتي", tab: "schedule" },
          { icon: Shield, label: "الإجراءات", tab: "actions" },
          { icon: Send, label: "النماذج والطلبات", tab: "forms" },
          { icon: AlertTriangle, label: "تنبيهات وتصحيحات", tab: "alerts" },
          { icon: User, label: "ملفي الشخصي", tab: "profile" },
        ].map(link => (
          <Button
            key={link.tab}
            variant="outline"
            className="h-14 rounded-2xl gap-2 text-xs border-border active:scale-[0.97] transition-transform"
            onClick={() => onNavigate(link.tab)}
          >
            <link.icon className="h-4 w-4 text-muted-foreground" />
            {link.label}
          </Button>
        ))}
      </div>

      {/* Geofence note */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 pb-2">
        <MapPin className="h-3 w-3 shrink-0" />
        <span>يتم التحقق من موقعك الجغرافي تلقائياً عند التسجيل</span>
      </div>
    </div>
  );
}
