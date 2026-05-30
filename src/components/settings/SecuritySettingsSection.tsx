import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Lock, Shield, Eye, EyeOff, KeyRound, Check, Loader2 } from "lucide-react";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import AdvancedPermissionsSection from "./AdvancedPermissionsSection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const SecuritySettingsSection = ({ settings, onChange }: Props) => {
  const timeoutValue = settings.security_session_timeout ?? 30;
  const warningValue = settings.security_warning_minutes ?? 2;

  const handleTimeoutChange = (v: string) => {
    const num = Number(v);
    onChange({ security_session_timeout: num });
    // Sync to SessionManager via event
    const s = { timeout: num, warning: warningValue };
    localStorage.setItem("session_timeout_settings", JSON.stringify(s));
    window.dispatchEvent(new Event("session_settings_updated"));
  };

  const handleWarningChange = (v: string) => {
    const num = Number(v);
    onChange({ security_warning_minutes: num });
    const s = { timeout: timeoutValue, warning: num };
    localStorage.setItem("session_timeout_settings", JSON.stringify(s));
    window.dispatchEvent(new Event("session_settings_updated"));
  };

  // Password change state
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const pwdValid = newPwd.length >= 6 && newPwd === confirmPwd;

  const handleChangePassword = async () => {
    if (!pwdValid) return;
    setChangingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("تم تغيير كلمة المرور بنجاح");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Change Password */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <KeyRound className="h-4 w-4 text-primary" />
          تغيير كلمة المرور
        </h3>
        <div className="space-y-4 p-4 bg-muted/20 rounded-xl border border-border/30 max-w-md">
          <div className="space-y-2">
            <Label className="font-medium">كلمة المرور الجديدة</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="pl-10"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="font-medium">تأكيد كلمة المرور</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="أعد كتابة كلمة المرور"
            />
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-[11px] text-destructive">كلمتا المرور غير متطابقتين</p>
            )}
          </div>
          <Button onClick={handleChangePassword} disabled={!pwdValid || changingPwd} className="w-full gap-2">
            {changingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            حفظ كلمة المرور الجديدة
          </Button>
        </div>
      </div>

      <Separator />

      {/* Session Timeout */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <Lock className="h-4 w-4 text-primary" />
          انتهاء الجلسة التلقائي
        </h3>

        <div className="space-y-4 p-4 bg-muted/20 rounded-xl border border-border/30">
          <div className="space-y-2">
            <Label className="font-medium">مدة الخمول قبل تسجيل الخروج</Label>
            <Select value={String(timeoutValue)} onValueChange={handleTimeoutChange}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 دقيقة</SelectItem>
                <SelectItem value="30">
                  <span className="flex items-center gap-2">
                    30 دقيقة
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-bold">موصى به</span>
                  </span>
                </SelectItem>
                <SelectItem value="60">60 دقيقة</SelectItem>
                <SelectItem value="120">ساعتان</SelectItem>
                <SelectItem value="0">لا تسجيل خروج تلقائي</SelectItem>
              </SelectContent>
            </Select>

            {timeoutValue === 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  غير موصى به — بياناتك المالية قد تكون في خطر إذا تركت الجهاز مفتوحاً دون رقابة
                </AlertDescription>
              </Alert>
            )}
          </div>

          {timeoutValue > 0 && (
            <div className="space-y-2">
              <Label className="font-medium">تنبيه قبل الخروج بـ</Label>
              <Select value={String(warningValue)} onValueChange={handleWarningChange}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">لا تنبيه</SelectItem>
                  <SelectItem value="2">دقيقتان</SelectItem>
                  <SelectItem value="5">5 دقائق</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                ستظهر نافذة تحذير قبل انتهاء الجلسة بالمدة المحددة
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Auth */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <Shield className="h-4 w-4 text-primary" />
          المصادقة
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">المصادقة الثنائية (2FA)</p>
              <p className="text-xs text-muted-foreground">طلب رمز إضافي عند تسجيل الدخول</p>
            </div>
            <Switch checked={settings.security_2fa_enabled ?? false} onCheckedChange={v => onChange({ security_2fa_enabled: v })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">مفاتيح المرور (Passkeys)</p>
              <p className="text-xs text-muted-foreground">تسجيل دخول ببصمة الإصبع أو الوجه</p>
            </div>
            <Switch checked={settings.security_passkeys_enabled ?? false} onCheckedChange={v => onChange({ security_passkeys_enabled: v })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Access Control */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          التحكم بالوصول
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تقييد الوصول بحسب IP</p>
              <p className="text-xs text-muted-foreground">السماح فقط لعناوين IP محددة</p>
            </div>
            <Switch checked={settings.security_ip_restrict ?? false} onCheckedChange={v => onChange({ security_ip_restrict: v })} />
          </div>
          {(settings.security_ip_restrict) && (
            <div className="space-y-2 pr-4">
              <Label>عناوين IP المسموح بها (سطر لكل عنوان)</Label>
              <Input value={settings.security_allowed_ips ?? ""} onChange={e => onChange({ security_allowed_ips: e.target.value })} placeholder="192.168.1.1, 10.0.0.1" dir="ltr" />
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">قفل الحساب بعد محاولات فاشلة</p>
              <p className="text-xs text-muted-foreground">قفل تلقائي بعد عدد محاولات خاطئة</p>
            </div>
            <Switch checked={settings.security_lockout_enabled ?? true} onCheckedChange={v => onChange({ security_lockout_enabled: v })} />
          </div>
          {(settings.security_lockout_enabled ?? true) && (
            <div className="space-y-2 max-w-xs pr-4">
              <Label>عدد المحاولات قبل القفل</Label>
              <Input type="number" value={settings.security_max_attempts ?? 5} onChange={e => onChange({ security_max_attempts: Number(e.target.value) })} />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Advanced Permissions */}
      <AdvancedPermissionsSection settings={settings} onChange={onChange} />

      <Separator />

      {/* Audit */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          سجل المراجعة
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تسجيل جميع العمليات</p>
              <p className="text-xs text-muted-foreground">حفظ سجل لكل إنشاء وتعديل وحذف</p>
            </div>
            <Switch checked={settings.security_audit_log ?? true} onCheckedChange={v => onChange({ security_audit_log: v })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تنبيه تسجيل دخول من جهاز جديد</p>
              <p className="text-xs text-muted-foreground">إشعار عند الدخول من جهاز غير معروف</p>
            </div>
            <Switch checked={settings.security_new_device_alert ?? true} onCheckedChange={v => onChange({ security_new_device_alert: v })} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettingsSection;
