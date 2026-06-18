import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, User, Building2, Briefcase, Phone, Mail, Cake, IdCard,
  Heart, Users as UsersIcon, GraduationCap, Calendar, Clock, MessageSquare,
  PenLine, Image as ImageIcon, KeyRound, Eye, EyeOff, Bell, Smartphone
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  enablePushNotifications,
  isIos,
  isIosStandalone,
  pushSupported,
} from "@/lib/push-notifications";
import { isFirebaseConfigured } from "@/lib/firebase-config";

interface Employee {
  full_name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  branch_id: string | null;
  date_of_birth?: string | null;
  id_number?: string | null;
  marital_status?: string | null;
  children_count?: number | null;
  start_date?: string | null;
  photo_url?: string | null;
  address?: string | null;
  notes?: string | null;
  shift_id?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
}

interface Props {
  employee: Employee;
  branchName?: string;
  latestInfoForm?: Record<string, any> | null;
  onUpdateInfo?: () => void;
}

const PLACEHOLDER = "غير مضاف";

function fmtDate(v?: string | null) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("ar-EG-u-ca-gregory", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return String(v); }
}

function pick<T = any>(...vals: (T | null | undefined | "")[]): T | undefined {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return undefined;
}

function tMarital(v?: string | null) {
  if (!v) return null;
  const map: Record<string, string> = {
    single: "أعزب", married: "متزوج", divorced: "مطلق", widowed: "أرمل",
  };
  return map[v] || v;
}

export default function EmployeeProfileTab({ employee, branchName, latestInfoForm, onUpdateInfo }: Props) {
  const { signOut, user } = useAuth();
  const f = latestInfoForm || {};
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Push notifications state
  const [pushReady, setPushReady] = useState<boolean | null>(null);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    pushSupported().then(setPushReady);
  }, []);

  const handleEnablePush = async () => {
    setPushLoading(true);
    const res = await enablePushNotifications();
    setPushLoading(false);
    if (res.ok === true) {
      setPushPerm("granted");
      toast.success("تم تفعيل الإشعارات على هذا الجهاز ✓");
    } else {
      toast.error(res.reason);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd) {
      toast.error("أدخل كلمة المرور الحالية");
      return;
    }
    if (newPwd.length < 8) {
      toast.error("كلمة المرور لازم تكون 8 أحرف على الأقل");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("كلمة المرور غير متطابقة");
      return;
    }
    if (newPwd === oldPwd) {
      toast.error("كلمة المرور الجديدة لازم تكون مختلفة عن الحالية");
      return;
    }
    const email = user?.email;
    if (!email) {
      toast.error("لا يوجد بريد إلكتروني مرتبط بحسابك");
      return;
    }
    setSaving(true);
    // 1) تحقق من كلمة المرور الحالية عبر تسجيل دخول صامت
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPwd,
    });
    if (verifyError) {
      setSaving(false);
      toast.error("كلمة المرور الحالية غير صحيحة");
      return;
    }
    // 2) تحديث كلمة المرور
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSaving(false);
    if (error) {
      toast.error(error.message || "فشل تغيير كلمة المرور");
      return;
    }
    toast.success("تم تغيير كلمة المرور بنجاح");
    setPwdOpen(false);
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
  };

  // Merge: employees row first, then last submitted employee_info
  const merged = {
    full_name: pick<string>(employee.full_name, f.full_name, f.name),
    position: pick<string>(employee.position),
    department: pick<string>(employee.department, f.department),
    branch: pick<string>(branchName, f.branch_name, f.branch),
    phone: pick<string>(employee.phone, f.phone, f.whatsapp),
    email: pick<string>(employee.email, f.email, user?.email || undefined),
    date_of_birth: pick<string>(employee.date_of_birth, f.date_of_birth, f.birth_date),
    whatsapp: pick<string>(f.whatsapp, employee.phone),
    id_number: pick<string>(employee.id_number, f.id_number),
    marital_status: pick<string>(tMarital(employee.marital_status), f.marital_status),
    spouse_name: pick<string>(f.spouse_name),
    children_count:
      employee.children_count != null ? String(employee.children_count) :
      f.children_count != null ? String(f.children_count) : undefined,
    education: pick<string>(f.education),
    shift: pick<string>(
      f.shift,
      employee.shift_start && employee.shift_end ? `${employee.shift_start} → ${employee.shift_end}` : undefined,
    ),
    start_date: pick<string>(employee.start_date, f.work_start_date),
    notes: pick<string>(employee.notes, f.notes),
  };

  const photoUrl = pick<string>(employee.photo_url, f.attachment_url, f.photo_url);

  const fields: { icon: any; label: string; value?: string }[] = [
    { icon: Briefcase, label: "المنصب", value: merged.position },
    { icon: Building2, label: "القسم", value: merged.department },
    { icon: Building2, label: "الفرع", value: merged.branch },
    { icon: Phone, label: "الهاتف", value: merged.phone },
    { icon: Phone, label: "واتساب", value: merged.whatsapp },
    { icon: Mail, label: "البريد", value: merged.email },
    { icon: Cake, label: "تاريخ الميلاد", value: fmtDate(merged.date_of_birth) || undefined },
    { icon: IdCard, label: "رقم الهوية", value: merged.id_number },
    { icon: Heart, label: "الحالة الاجتماعية", value: merged.marital_status },
    { icon: User, label: "اسم الزوج/الزوجة", value: merged.spouse_name },
    { icon: UsersIcon, label: "عدد الأطفال", value: merged.children_count },
    { icon: GraduationCap, label: "المستوى التعليمي", value: merged.education },
    { icon: Clock, label: "الشفت", value: merged.shift },
    { icon: Calendar, label: "تاريخ بدء العمل", value: fmtDate(merged.start_date) || undefined },
  ];

  const bottomPad = "calc(72px + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: bottomPad }}>
      {/* Avatar & Name */}
      <div className="relative text-center pt-4">
        {/* Sign out (top-right next to name in RTL) */}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="absolute top-2 right-0 h-9 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl px-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-xs">خروج</span>
        </Button>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={merged.full_name || "موظف"}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border border-border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <User className="h-10 w-10 text-primary" />
          </div>
        )}
        <h2 className="text-lg font-bold text-foreground">{merged.full_name || PLACEHOLDER}</h2>
        <Badge variant="outline" className="mt-1 text-[10px]">موظف</Badge>
      </div>

      {/* Update info CTA */}
      {onUpdateInfo && (
        <Button
          variant="outline"
          className="w-full h-11 rounded-2xl gap-2 border-primary/30 text-primary bg-card hover:bg-slate-50 hover:text-primary hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
          onClick={onUpdateInfo}
        >
          <PenLine className="h-4 w-4" />
          تحديث معلوماتي
        </Button>
      )}

      {/* Change Password CTA */}
      <Button
        variant="outline"
        className="w-full h-11 rounded-2xl gap-2 border-primary/30 text-primary bg-card hover:bg-slate-50 hover:text-primary hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
        onClick={() => setPwdOpen(true)}
      >
        <KeyRound className="h-4 w-4" />
        تغيير كلمة المرور
      </Button>

      {/* Push Notifications CTA */}
      {isFirebaseConfigured() && pushReady !== false && (
        <div className="space-y-2">
          <Button
            variant="outline"
            disabled={
              pushLoading ||
              pushReady === null ||
              (isIos() && !isIosStandalone()) ||
              pushPerm === "denied"
            }
            className="w-full h-11 rounded-2xl gap-2 border-primary/30 text-primary bg-card hover:bg-slate-50 hover:text-primary hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
            onClick={handleEnablePush}
          >
            <Bell className="h-4 w-4" />
            {pushLoading
              ? "جارٍ التفعيل..."
              : pushPerm === "granted"
                ? "الإشعارات مفعّلة ✓ — إعادة التسجيل"
                : "تفعيل الإشعارات"}
          </Button>
          {isIos() && !isIosStandalone() && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] leading-relaxed">
              <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                على iPhone: افتح Safari ← مشاركة ← <strong>إضافة إلى الشاشة الرئيسية</strong>،
                ثم افتح التطبيق من الأيقونة وفعّل الإشعارات من هنا.
              </div>
            </div>
          )}
          {pushPerm === "denied" && (
            <p className="text-[11px] text-muted-foreground px-1">
              الإشعارات مرفوضة — فعّلها من إعدادات المتصفح/النظام ثم أعد المحاولة.
            </p>
          )}
        </div>
      )}

      {/* Info Card */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          {fields.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <row.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-muted-foreground">{row.label}</div>
                <div className={`text-sm font-medium truncate ${row.value ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {row.value || PLACEHOLDER}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>


      <Dialog open={pwdOpen} onOpenChange={(o) => { if (!saving) setPwdOpen(o); }}>
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور الحالية</Label>
              <Input
                type={showPwd ? "text" : "password"}
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="كلمة المرور الحالية"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  className="pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5 space-y-1.5 mt-2">
                <p className="text-[11px] font-semibold text-foreground">💡 مثال على كلمة مرور قوية:</p>
                <div className="flex flex-wrap gap-1.5" dir="ltr">
                  <code className="text-[11px] bg-background border border-border/50 rounded px-1.5 py-0.5 font-mono">Ahmad@2026</code>
                  <code className="text-[11px] bg-background border border-border/50 rounded px-1.5 py-0.5 font-mono">Sara#Work99</code>
                  <code className="text-[11px] bg-background border border-border/50 rounded px-1.5 py-0.5 font-mono">MyCat$Blue7</code>
                </div>
                <ul className="text-[10.5px] text-muted-foreground space-y-0.5 list-disc pr-4 leading-relaxed">
                  <li>8 أحرف على الأقل</li>
                  <li>حروف كبيرة وصغيرة + أرقام + رمز (@ # $ !)</li>
                  <li>تجنّب: 12345678 — password — اسمك — رقم جوالك</li>
                </ul>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">تأكيد كلمة المرور</Label>
              <Input
                type={showPwd ? "text" : "password"}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              لا تشارك كلمة المرور مع أي شخص.
            </p>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleChangePassword} disabled={saving} className="flex-1">
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setPwdOpen(false)} disabled={saving} className="flex-1">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
