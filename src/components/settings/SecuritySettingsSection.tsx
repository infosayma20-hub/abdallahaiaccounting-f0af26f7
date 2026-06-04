import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Lock, Shield, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import AdvancedPermissionsSection from "./AdvancedPermissionsSection";
import PasswordManagementSection from "./PasswordManagementSection";

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

  return (
    <div className="p-6 space-y-8">
      {/* Password Management — smart: detects Google-only vs email account */}
      <PasswordManagementSection />

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
      <TooltipProvider delayDuration={150}>
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <Shield className="h-4 w-4 text-primary" />
          المصادقة
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60 mr-1">
            يتطلب Backend
          </Badge>
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg opacity-70">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-1.5">
                المصادقة الثنائية (2FA)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>قيد التحضير — تحتاج تفعيل Backend قبل الاستخدام</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-xs text-muted-foreground">قيد التحضير — تحتاج تفعيل Backend قبل الاستخدام</p>
            </div>
            <Switch checked={settings.security_2fa_enabled ?? false} disabled />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg opacity-70">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-1.5">
                مفاتيح المرور (Passkeys)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>قيد التحضير — غير مفعلة حالياً</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-xs text-muted-foreground">قيد التحضير — غير مفعلة حالياً</p>
            </div>
            <Switch checked={settings.security_passkeys_enabled ?? false} disabled />
          </div>
        </div>
      </div>

      <Separator />

      {/* Access Control */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          التحكم بالوصول
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60 mr-1">
            يتطلب Backend
          </Badge>
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg opacity-70">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-1.5">
                تقييد الوصول بحسب IP
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>يحتاج طبقة تحقق على الخادم قبل التفعيل</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-xs text-muted-foreground">يحتاج طبقة تحقق على الخادم قبل التفعيل</p>
            </div>
            <Switch checked={settings.security_ip_restrict ?? false} disabled />
          </div>
          <div className="space-y-2 pr-4 opacity-70">
            <Label className="flex items-center gap-1.5">
              عناوين IP المسموح بها
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>يتفعل بعد تفعيل تقييد IP</TooltipContent>
              </Tooltip>
            </Label>
            <Input value={settings.security_allowed_ips ?? ""} placeholder="192.168.1.1, 10.0.0.1" dir="ltr" disabled readOnly />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg opacity-70">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-1.5">
                قفل الحساب بعد محاولات فاشلة
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>قيد التحضير — لا يتم فرضه حالياً</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-xs text-muted-foreground">قيد التحضير — لا يتم فرضه حالياً</p>
            </div>
            <Switch checked={settings.security_lockout_enabled ?? false} disabled />
          </div>
          <div className="space-y-2 max-w-xs pr-4 opacity-70">
            <Label>عدد المحاولات قبل القفل</Label>
            <Input type="number" value={settings.security_max_attempts ?? 5} disabled readOnly />
          </div>
        </div>
      </div>
      </TooltipProvider>

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
