import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogIn, LogOut, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Timer, MapPin, QrCode, ClipboardList, Send, User, ChevronLeft, ShoppingCart,
  Users, CalendarDays, ClipboardCheck, Shield, Receipt, Wallet, BarChart3, CalendarRange, ChevronLeft as ChevLeft, FileText, Bell
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
  todayEvents?: { event_type: string; event_time: string }[];
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

export default function EmployeeHomeTab({ employeeName, todayRecord, todayEvents = [], history, onScanTap, onNavigate, isCashier, onOpenPOS, canViewTeam, canManageSchedule, canManageAttendance, isManager, branchName, companyLogo, onOpenManagerRoute }: Props) {
  const hasMgmt = !!(canViewTeam || canManageSchedule || canManageAttendance);
  const mgmtBadge = isManager ? "مدير فرع" : (canManageSchedule ? "مشرف دوام" : "مشرف");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Multi check-in/out: use events to determine current state
  const lastEvent = todayEvents.length > 0 ? todayEvents[todayEvents.length - 1] : null;
  const canCheckIn = !lastEvent || lastEvent.event_type === "check_out";
  const canCheckOut = !!lastEvent && lastEvent.event_type === "check_in";
  const dayComplete = !!(todayRecord?.total_hours && todayRecord.total_hours > 0 && canCheckIn && todayEvents.length >= 2);
  const status = todayRecord ? statusMap[todayRecord.status] || null : null;

  const elapsed = useMemo(() => {
    if (!todayRecord?.first_check_in || todayRecord?.last_check_out) return null;
    const mins = differenceInMinutes(currentTime, new Date(todayRecord.first_check_in));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [todayRecord, currentTime]);

  const completedSummary = useMemo(() => {
    if (!dayComplete || !todayRecord) return null;
    const totalMins = differenceInMinutes(new Date(todayRecord.last_check_out!), new Date(todayRecord.first_check_in!));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }, [dayComplete, todayRecord]);

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
    <div
      className="space-y-4 px-4 pt-4"
      dir="rtl"
      style={{ paddingBottom: bottomPad, background: "#f6f8fb", minHeight: "100dvh" }}
    >
      {/* Welcome Banner — Dynamics navy */}
      <div
        className="rounded-[20px] p-5 relative overflow-hidden shadow-sm"
        style={{ background: "#002050" }}
      >
        <div className="relative z-10 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-white/70">مرحباً بك،</p>
            <h1 className="text-lg font-bold text-white truncate leading-tight">{employeeName}</h1>
            <p className="text-[10px] mt-1 text-white/60">
              {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
            </p>
          {hasMgmt && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15">
              <Shield className="h-3 w-3 text-white" />
              <span className="text-[10px] font-semibold text-white">
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
              className="h-12 w-12 rounded-xl bg-white object-contain p-1 shrink-0 shadow"
            />
          )}
        </div>
      </div>

      {/* Manager Section */}
      {hasMgmt && (
        <Card className="border border-slate-200 bg-white rounded-[20px] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Users className="h-4 w-4" style={{ color: "#002050" }} />
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
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-slate-200 bg-white active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/roster")}
                >
                  <CalendarDays className="h-4 w-4" style={{ color: "#002050" }} />
                  جدول الدوام
                </Button>
              )}
              {canManageAttendance && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-slate-200 bg-white active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/team-attendance")}
                >
                  <ClipboardCheck className="h-4 w-4 text-emerald-500" />
                  حضور الفريق
                </Button>
              )}
              {canViewTeam && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-slate-200 bg-white active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/team")}
                >
                  <Users className="h-4 w-4" style={{ color: "#002050" }} />
                  فريقي
                </Button>
              )}
              {canManageSchedule && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-slate-200 bg-white active:scale-[0.97] transition-transform"
                  onClick={() => onOpenManagerRoute?.("/employee/shift-swaps")}
                >
                  <Send className="h-4 w-4 text-orange-500" />
                  تبديل الورديات
                </Button>
              )}
              {canManageAttendance && (
                <Button
                  variant="outline"
                  className="h-14 rounded-2xl gap-2 text-xs justify-start px-3 border-slate-200 bg-white active:scale-[0.97] transition-transform col-span-2"
                  onClick={() => onOpenManagerRoute?.("/employee/team-requests")}
                >
                  <ClipboardList className="h-4 w-4" style={{ color: "#002050" }} />
                  اعتماد / رفض طلبات الفريق
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section: الدوام والحضور */}
      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1 pt-1">الدوام والحضور</h4>

      {/* Live Clock */}
      <Card className="border border-slate-200 bg-white rounded-[20px] shadow-sm overflow-hidden">
        <CardContent className="p-5 text-center">
          <div className="text-5xl font-bold tabular-nums tracking-tight" style={{ color: "#002050", fontFeatureSettings: "'tnum' 1", fontFamily: "JetBrains Mono, monospace" }}>
            {format(currentTime, "HH:mm")}
            <span className="text-2xl text-slate-400">:{format(currentTime, "ss")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Today Status & Action */}
      <Card className="border border-slate-200 bg-white rounded-[20px] shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Timer className="h-5 w-5" style={{ color: "#002050" }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">حالة اليوم</h3>
                {status ? (
                  <Badge variant="outline" className={`${status.color} mt-0.5 text-[10px]`}>
                    {status.icon}
                    <span className="mr-1">{status.label}</span>
                  </Badge>
                ) : (
                  <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    لم تسجّل بعد
                  </span>
                )}
              </div>
            </div>
            {todayRecord?.total_hours ? (
              <div className="text-left">
                <span className="text-2xl font-bold tabular-nums" style={{ color: "#002050" }}>{todayRecord.total_hours.toFixed(1)}</span>
                <span className="text-xs text-slate-500 mr-1">ساعة</span>
              </div>
            ) : null}
          </div>

          {/* Check-in / Check-out times */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
              <LogIn className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
              <div className="text-[10px] text-slate-500">دخول</div>
              <div className="font-semibold text-sm tabular-nums">
                {todayRecord?.first_check_in
                  ? format(new Date(todayRecord.first_check_in), "hh:mm a")
                  : "—"}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
              <LogOut className="h-4 w-4 mx-auto mb-1 text-rose-500" />
              <div className="text-[10px] text-slate-500">خروج</div>
              <div className="font-semibold text-sm tabular-nums">
                {todayRecord?.last_check_out
                  ? format(new Date(todayRecord.last_check_out), "hh:mm a")
                  : "—"}
              </div>
            </div>
          </div>

          {/* Elapsed time */}
          {elapsed && (
            <p className="text-xs text-center text-slate-500 mb-3 inline-flex items-center justify-center gap-1 w-full">
              <Timer className="h-3.5 w-3.5" />
              دخلت منذ {elapsed}
            </p>
          )}

          {/* Action Buttons */}
          {canCheckIn && (
            <div className="flex gap-2.5">
              <Button
                size="lg"
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.97] transition-transform shadow-md shadow-emerald-600/20"
                onClick={onScanTap}
              >
                <LogIn className="h-5 w-5" />
                تسجيل دخول
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl active:scale-95 transition-transform border-slate-200 bg-white"
                onClick={onScanTap}
              >
                <QrCode className="h-5 w-5" />
              </Button>
            </div>
          )}

          {canCheckOut && (
            <div className="flex gap-2.5">
              <Button
                size="lg"
                className="flex-1 h-14 text-base rounded-2xl gap-2 font-bold bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.97] transition-transform shadow-md shadow-rose-600/20"
                onClick={onScanTap}
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-14 rounded-2xl active:scale-95 transition-transform border-slate-200 bg-white"
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
              <p className="text-xs text-slate-500">
                إجمالي العمل: {completedSummary}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      <div className="pt-1">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">إحصائيات الشهر</h4>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "حاضر", value: stats.present, color: "text-emerald-600" },
            { label: "متأخر", value: stats.late, color: "text-orange-500" },
            { label: "غياب", value: stats.absent, color: "text-rose-600" },
            { label: "ساعة", value: stats.totalHours.toFixed(0), color: "" },
          ].map(s => (
            <button
              key={s.label}
              type="button"
              onClick={() => onNavigate("attendance")}
              aria-label={`فتح سجل دوامي - ${s.label === "ساعة" ? "الساعات" : s.label}`}
              className="text-center bg-white rounded-2xl p-3 border border-slate-200 shadow-sm hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.97]"
            >
              <div className={`text-lg font-bold tabular-nums ${s.color}`} style={s.color ? undefined : { color: "#002050" }}>{s.value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Last 5 Days */}
      {last5.length > 0 && (
        <Card className="border border-slate-200 bg-white rounded-[20px] shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-slate-500" />
              آخر 5 أيام
            </h3>
            <div className="space-y-1.5">
              {last5.map(day => (
                <div key={day.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    {statusIcon(day.status)}
                    <span className="text-xs font-medium">
                      {format(new Date(day.attendance_date), "dd/MM EEEE", { locale: ar }).slice(0, 12)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-slate-500">
                    {day.status === "absent" ? (
                      <span className="text-rose-600 text-xs">غياب</span>
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

      {/* Quick services grid — grouped by section */}
      {(() => {
        const sections: { title: string; items: { icon: any; label: string; tab: string; iconColor: string; iconBg: string; }[] }[] = [
          {
            title: "المالي",
            items: [
              { icon: Receipt, label: "قسائم الراتب", tab: "payslips", iconColor: "#002050", iconBg: "#f0f4f9" },
              { icon: Wallet, label: "ملخصي المالي", tab: "financials", iconColor: "#002050", iconBg: "#f0f4f9" },
            ],
          },
          {
            title: "الدوام",
            items: [
              { icon: CalendarDays, label: "سجل دوامي", tab: "attendance", iconColor: "#1f4d8a", iconBg: "#eaf2fb" },
              { icon: Calendar, label: "وردياتي", tab: "schedule", iconColor: "#1f4d8a", iconBg: "#eaf2fb" },
            ],
          },
          {
            title: "الطلبات والنماذج",
            items: [
              { icon: FileText, label: "النماذج والطلبات", tab: "forms", iconColor: "#5c2d91", iconBg: "#f3edff" },
              { icon: ClipboardList, label: "طلباتي السابقة", tab: "requests", iconColor: "#5c2d91", iconBg: "#f3edff" },
              { icon: Shield, label: "السياسات واللوائح", tab: "actions", iconColor: "#7a5900", iconBg: "#fff9e6" },
              { icon: Bell, label: "تنبيهات وتصحيحات", tab: "alerts", iconColor: "#c2410c", iconBg: "#fff1e6" },
            ],
          },
          {
            title: "حسابي",
            items: [
              { icon: User, label: "ملفي الشخصي", tab: "profile", iconColor: "#323130", iconBg: "#f3f2f1" },
            ],
          },
        ];
        return (
          <div className="space-y-4 pt-1">
            {sections.map(sec => (
              <div key={sec.title}>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">{sec.title}</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {sec.items.map(link => (
                    <button
                      key={link.tab}
                      type="button"
                      onClick={() => onNavigate(link.tab)}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-right"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: link.iconBg }}
                      >
                        <link.icon className="h-5 w-5" style={{ color: link.iconColor }} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate flex-1">{link.label}</span>
                      <ChevLeft className="h-4 w-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Geofence note */}
      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 px-1 pt-2 pb-2">
        <MapPin className="h-3 w-3 shrink-0" />
        <span>يتم التحقق من موقعك الجغرافي تلقائياً عند التسجيل</span>
      </div>
    </div>
  );
}
