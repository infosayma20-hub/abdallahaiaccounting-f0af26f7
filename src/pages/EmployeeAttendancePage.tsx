import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay } from "@/lib/utils";
import {
  Clock, LogIn, LogOut, MapPin, QrCode, Calendar, AlertTriangle,
  CheckCircle2, XCircle, Timer, FileText, Send, Loader2, Coffee, Undo2
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getOpenAttendanceSession } from "@/lib/attendance-session";

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
  total_break_minutes?: number;
  net_work_minutes?: number;
};

type BreakRecord = {
  id: string;
  break_out: string;
  break_in: string | null;
  reason: string;
  duration_minutes: number | null;
};

type CorrectionRequest = {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  review_notes: string | null;
  created_at: string;
};

const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  present: { label: "حاضر", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: <CheckCircle2 className="h-4 w-4" /> },
  late: { label: "متأخر", color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: <Clock className="h-4 w-4" /> },
  absent: { label: "غائب", color: "bg-red-500/10 text-red-600 border-red-200", icon: <XCircle className="h-4 w-4" /> },
  incomplete: { label: "بصمة ناقصة", color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: <AlertTriangle className="h-4 w-4" /> },
  leave: { label: "إجازة", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: <Calendar className="h-4 w-4" /> },
  holiday: { label: "عطلة", color: "bg-purple-500/10 text-purple-600 border-purple-200", icon: <Calendar className="h-4 w-4" /> },
};

export default function EmployeeAttendancePage() {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<AttendanceDay | null>(null);
  const [todayEvents, setTodayEvents] = useState<{ event_type: string; event_time: string }[]>([]);
  const [recentEvents, setRecentEvents] = useState<{ event_type: string; event_time: string }[]>([]);
  const [todayBreaks, setTodayBreaks] = useState<BreakRecord[]>([]);
  const [history, setHistory] = useState<AttendanceDay[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [pendingAction, setPendingAction] = useState<"checkin" | "checkout" | "break_out" | "break_in" | null>(null);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ date: "", type: "missing_checkout", reason: "" });
  const [employee, setEmployee] = useState<{ id: string; full_name: string; branch_id: string | null } | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showBreakSheet, setShowBreakSheet] = useState(false);
  const [breakReason, setBreakReason] = useState("استراحة");
  const [breakElapsed, setBreakElapsed] = useState(0);

  // Live clock + break timer
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date());
      // Update break elapsed time
      const openBreak = todayBreaks.find(b => !b.break_in);
      if (openBreak) {
        const elapsed = Math.round((Date.now() - new Date(openBreak.break_out).getTime()) / 60000);
        setBreakElapsed(elapsed);
      } else {
        setBreakElapsed(0);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [todayBreaks]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get employee
      const { data: emp } = await supabase
        .from("employees_safe")
        .select("id, full_name, branch_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      setEmployee(emp);

      if (!emp) { setLoading(false); return; }

      // Get branches
      const { data: br } = await supabase.from("branches_safe").select("id, name").eq("is_active", true);
      setBranches(br || []);

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const since = new Date(Date.now() - 60 * 86400_000).toISOString();

      // Today's record
      const { data: todayData } = await supabase
        .from("attendance_days")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("attendance_date", today)
        .single();
      setTodayRecord(todayData);

      // Today's events for determining current state
      const { data: eventsData } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", emp.id)
        .gte("event_time", `${today}T00:00:00+03:00`)
        .lte("event_time", `${today}T23:59:59+03:00`)
        .eq("status", "valid")
        .order("event_time", { ascending: true });
      setTodayEvents(eventsData || []);

      const { data: recentEventsData } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", emp.id)
        .gte("event_time", since)
        .eq("status", "valid")
        .order("event_time", { ascending: true });
      setRecentEvents(recentEventsData || []);

      // Today's breaks
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      try {
        const breaksResp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/attendance?action=breaks`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const breaksData = await breaksResp.json();
        setTodayBreaks(Array.isArray(breaksData) ? breaksData : []);
      } catch {
        setTodayBreaks([]);
      }

      // History (last 30 days)
      const { data: histData } = await supabase
        .from("attendance_days")
        .select("*")
        .eq("employee_id", emp.id)
        .order("attendance_date", { ascending: false })
        .limit(30);
      setHistory(histData || []);

      // Corrections
      const { data: corrData } = await supabase
        .from("correction_requests")
        .select("*")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setCorrections(corrData || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAttendanceAction = (action: "checkin" | "checkout" | "break_out" | "break_in") => {
    setPendingAction(action);
    setShowQRDialog(true);
    setQrInput("");
  };

  const handleBreakRequest = () => {
    setShowBreakSheet(true);
  };

  const confirmBreakOut = () => {
    setShowBreakSheet(false);
    setPendingAction("break_out");
    setShowQRDialog(true);
    setQrInput("");
  };

  const processAttendance = async () => {
    if (!pendingAction || !qrInput.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال رمز QR", variant: "destructive" });
      return;
    }
    setCheckingIn(true);
    try {
      // Parse QR: format is "BRANCH_ID:TOKEN"
      const parts = qrInput.trim().split(":");
      if (parts.length < 2) {
        toast({ title: "خطأ", description: "صيغة رمز QR غير صحيحة", variant: "destructive" });
        setCheckingIn(false);
        return;
      }
      const branchId = parts[0];
      const token = parts.slice(1).join(":");

      // GPS معطّل عالمياً — لا نطلب الموقع من المتصفح.
      let lat = 0, lng = 0;

      const actionMap: Record<string, string> = {
        checkin: "checkin",
        checkout: "checkout",
        break_out: "break_out",
        break_in: "break_in",
      };
      const endpoint = actionMap[pendingAction] || pendingAction;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      const bodyPayload: any = {
        action: endpoint,
        branch_id: branchId,
        qr_token: token,
        latitude: lat,
        longitude: lng,
        device_info: navigator.userAgent.substring(0, 100),
      };
      if (pendingAction === "break_out") {
        bodyPayload.reason = breakReason;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/attendance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(bodyPayload),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "خطأ", description: result.error || "حدث خطأ", variant: "destructive" });
      } else {
        toast({ title: "نجاح ✅", description: result.message });
        setShowQRDialog(false);
        setQrInput("");
        fetchData();
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
    setCheckingIn(false);
  };

  const submitCorrection = async () => {
    if (!employee || !correctionForm.reason.trim() || !correctionForm.date) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("correction_requests").insert({
      employee_id: employee.id,
      auth_user_id: user!.id,
      attendance_date: correctionForm.date,
      request_type: correctionForm.type,
      reason: correctionForm.reason,
      status: "pending",
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال", description: "تم إرسال طلب التعديل بنجاح" });
      setShowCorrectionDialog(false);
      setCorrectionForm({ date: "", type: "missing_checkout", reason: "" });
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
        <AlertTriangle className="h-16 w-16 text-warning mx-auto" />
        <h2 className="text-xl font-bold">لم يتم ربط حسابك بسجل موظف</h2>
        <p className="text-muted-foreground">تواصل مع مسؤول الموارد البشرية لربط حسابك.</p>
      </div>
    );
  }

  // Multi check-in/out: determine state from TODAY's events only.
  // An orphan check_in from a previous day (missing check-out) must NOT block
  // a new check-in today — it stays as an alert under "بصمات ناقصة" and the
  // employee/HR submit a correction request. The system never auto-stamps a
  // check-out on behalf of the employee.
  const lastEvent = todayEvents.length > 0 ? todayEvents[todayEvents.length - 1] : null;
  const todayOpenSession = getOpenAttendanceSession(todayEvents);
  const isTodayOpen = !!todayOpenSession || lastEvent?.event_type === "check_in";
  const isOnBreak = todayBreaks.some(b => !b.break_in);
  const canCheckIn = !isOnBreak && !isTodayOpen;
  const canCheckOut = !isOnBreak && isTodayOpen;
  const canBreakOut = !isOnBreak && isTodayOpen;
  const sessionCount = todayEvents.filter(e => e.event_type === "check_in").length;
  const todayStatus = todayRecord ? statusMap[todayRecord.status] || statusMap.absent : statusMap.absent;
  const totalBreakMinutes = todayRecord?.total_break_minutes || todayBreaks.filter(b => b.duration_minutes).reduce((s, b) => s + (b.duration_minutes || 0), 0);

  const incompleteCount = history.filter(d => d.status === "incomplete").length;

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <PageHeader title="نظام الحضور والانصراف" breadcrumb={["الموارد البشرية", "الحضور والانصراف"]} />
      <div className="flex items-center justify-end">
        <div className="text-left">
          <div className="text-3xl font-bold tabular-nums text-primary">
            {format(currentTime, "HH:mm:ss")}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
          </div>
        </div>
      </div>

      {/* Today's Status Card */}
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Timer className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">حالة اليوم</h3>
                {isOnBreak ? (
                  <Badge className="bg-orange-500/10 text-orange-600 border-orange-200 mt-1">
                    <Coffee className="h-4 w-4" />
                    <span className="mr-1">مغادرة مؤقتة ({breakElapsed} دقيقة)</span>
                  </Badge>
                ) : (
                  <Badge className={`${todayStatus.color} mt-1`}>
                    {todayStatus.icon}
                    <span className="mr-1">{todayStatus.label}</span>
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-left">
              {todayRecord?.total_hours ? (
                <div>
                  <span className="text-3xl font-bold tabular-nums">{todayRecord.total_hours.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground mr-1">ساعة</span>
                </div>
              ) : null}
              {totalBreakMinutes > 0 && (
                <div className="text-xs text-orange-500 mt-1">
                  استراحات: {totalBreakMinutes} دقيقة
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <LogIn className="h-4 w-4 mx-auto mb-1 text-emerald-600" />
              <div className="text-xs text-muted-foreground">وقت الدخول</div>
              <div className="font-bold">
                {todayRecord?.first_check_in
                  ? format(new Date(todayRecord.first_check_in), "hh:mm a")
                  : "—"}
              </div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <LogOut className="h-4 w-4 mx-auto mb-1 text-destructive" />
              <div className="text-xs text-muted-foreground">وقت الخروج</div>
              <div className="font-bold">
                {todayRecord?.last_check_out
                  ? format(new Date(todayRecord.last_check_out), "hh:mm a")
                  : "—"}
              </div>
            </div>
          </div>

          {/* Break Timer Banner */}
          {isOnBreak && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 text-center">
              <Coffee className="h-8 w-8 text-orange-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-600 tabular-nums">{breakElapsed} دقيقة</div>
              <div className="text-sm text-orange-500">منذ المغادرة المؤقتة</div>
              <Button
                size="lg"
                className="mt-3 w-full h-14 text-base rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleAttendanceAction("break_in")}
              >
                <Undo2 className="h-5 w-5" />
                ↩️ عودة للعمل
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          {!isOnBreak && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  className="h-14 text-base rounded-xl gap-2"
                  disabled={!canCheckIn}
                  onClick={() => handleAttendanceAction("checkin")}
                >
                  <LogIn className="h-5 w-5" />
                  تسجيل دخول
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base rounded-xl gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                  disabled={!canCheckOut}
                  onClick={() => handleAttendanceAction("checkout")}
                >
                  <LogOut className="h-5 w-5" />
                  تسجيل خروج نهائي
                </Button>
              </div>
              {canBreakOut && (
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 text-base rounded-xl gap-2 border-orange-200 text-orange-600 hover:bg-orange-50"
                  onClick={handleBreakRequest}
                >
                  <Coffee className="h-5 w-5" />
                  🚶 مغادرة مؤقتة
                </Button>
              )}
            </div>
          )}

          {/* Today's breaks summary */}
          {todayBreaks.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <div className="text-xs font-semibold text-muted-foreground mb-2">استراحات اليوم ({todayBreaks.length})</div>
              <div className="space-y-1">
                {todayBreaks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-1.5">
                    <span className="text-muted-foreground">{b.reason || "استراحة"}</span>
                    <div className="flex items-center gap-2">
                      <span>{format(new Date(b.break_out), "hh:mm a")}</span>
                      <span>←</span>
                      <span>{b.break_in ? format(new Date(b.break_in), "hh:mm a") : "مفتوح"}</span>
                      {b.duration_minutes != null && (
                        <Badge variant="outline" className="text-[10px] px-1.5">{b.duration_minutes} د</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Tabs */}
      <Tabs defaultValue="history" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="history" className="gap-1">
            <Calendar className="h-3.5 w-3.5" /> السجل
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1 relative">
            <AlertTriangle className="h-3.5 w-3.5" /> الاستثناءات
            {incompleteCount > 0 && (
              <span className="absolute -top-1 -left-1 h-4 w-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center">
                {incompleteCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1">
            <FileText className="h-3.5 w-3.5" /> الطلبات
          </TabsTrigger>
        </TabsList>

        {/* History */}
        <TabsContent value="history" className="space-y-2 mt-4">
          {history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد سجلات حضور</p>
          ) : (
            history.map(day => {
              const s = statusMap[day.status] || statusMap.absent;
              return (
                <Card key={day.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={s.color}>
                        {s.icon} <span className="mr-1">{s.label}</span>
                      </Badge>
                      <span className="text-sm font-medium">
                        {format(new Date(day.attendance_date), "EEEE d/M", { locale: ar })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {day.first_check_in ? format(new Date(day.first_check_in), "hh:mm a") : "—"}
                        {" ← "}
                        {day.last_check_out ? format(new Date(day.last_check_out), "hh:mm a") : "—"}
                      </span>
                      <span className="font-bold text-foreground">{day.total_hours?.toFixed(1) || "0"} س</span>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions" className="space-y-2 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm">البصمات الناقصة</h3>
            <Button size="sm" variant="outline" onClick={() => setShowCorrectionDialog(true)} className="gap-1">
              <Send className="h-3 w-3" /> طلب تعديل
            </Button>
          </div>
          {history.filter(d => d.status === "incomplete").length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد بصمات ناقصة 🎉</p>
          ) : (
            history.filter(d => d.status === "incomplete").map(day => (
              <Card key={day.id} className="p-3 border-orange-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">{format(new Date(day.attendance_date), "EEEE d/M", { locale: ar })}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    دخول: {day.first_check_in ? format(new Date(day.first_check_in), "hh:mm a") : "مفقود"}
                    {" | "}
                    خروج: {day.last_check_out ? format(new Date(day.last_check_out), "hh:mm a") : "مفقود"}
                  </span>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Correction Requests */}
        <TabsContent value="requests" className="space-y-2 mt-4">
          {corrections.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد طلبات تعديل</p>
          ) : (
            corrections.map(req => (
              <Card key={req.id} className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{fmtDateDisplay(req.attendance_date)}</span>
                  <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "outline"}>
                    {req.status === "pending" ? "قيد المراجعة" : req.status === "approved" ? "مقبول" : "مرفوض"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{req.reason}</p>
                {req.review_notes && (
                  <p className="text-xs text-primary mt-1">ملاحظة HR: {req.review_notes}</p>
                )}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* QR Scan Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              مسح رمز QR
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              امسح رمز QR الخاص بالفرع أو أدخله يدوياً
            </p>
            <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-center">
              <QrCode className="h-20 w-20 text-muted-foreground/30" />
            </div>
            <Input
              placeholder="أدخل رمز QR..."
              value={qrInput}
              onChange={e => setQrInput(e.target.value)}
              dir="ltr"
              className="text-center font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>سيتم التحقق من فرعك تلقائياً</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={processAttendance} disabled={checkingIn || !qrInput.trim()} className="w-full gap-2">
              {checkingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              {pendingAction === "checkin" ? "تأكيد الدخول" : pendingAction === "checkout" ? "تأكيد الخروج" : pendingAction === "break_out" ? "تأكيد المغادرة المؤقتة" : "تأكيد العودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Request Dialog */}
      <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>طلب تعديل بصمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input
                type="date"
                value={correctionForm.date}
                onChange={e => setCorrectionForm(p => ({ ...p, date: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع التعديل</label>
              <Select value={correctionForm.type} onValueChange={v => setCorrectionForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing_checkin">بصمة دخول مفقودة</SelectItem>
                  <SelectItem value="missing_checkout">بصمة خروج مفقودة</SelectItem>
                  <SelectItem value="wrong_time">وقت خاطئ</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
              <Textarea
                placeholder="اشرح سبب طلب التعديل..."
                value={correctionForm.reason}
                onChange={e => setCorrectionForm(p => ({ ...p, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitCorrection} className="w-full">إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Break Reason Bottom Sheet */}
      <Dialog open={showBreakSheet} onOpenChange={setShowBreakSheet}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-orange-500" />
              مغادرة مؤقتة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">اختر سبب المغادرة (اختياري):</p>
            <div className="grid grid-cols-2 gap-2">
              {["استراحة", "صلاة", "شخصي", "أخرى"].map(r => (
                <Button
                  key={r}
                  variant={breakReason === r ? "default" : "outline"}
                  className={`h-12 rounded-xl ${breakReason === r ? "" : "border-orange-200 text-orange-600 hover:bg-orange-50"}`}
                  onClick={() => setBreakReason(r)}
                >
                  {r === "استراحة" && "☕ "}
                  {r === "صلاة" && "🕌 "}
                  {r === "شخصي" && "👤 "}
                  {r === "أخرى" && "📝 "}
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={confirmBreakOut} className="w-full gap-2 bg-orange-500 hover:bg-orange-600">
              <Coffee className="h-4 w-4" />
              تأكيد المغادرة المؤقتة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
