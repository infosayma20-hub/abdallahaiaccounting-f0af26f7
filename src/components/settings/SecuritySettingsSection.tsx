import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const SecuritySettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* Session */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الجلسة والمصادقة
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>مدة الجلسة قبل تسجيل الخروج التلقائي</Label>
            <Select value={String(settings.security_session_timeout ?? 60)} onValueChange={v => onChange({ security_session_timeout: Number(v) })}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 دقيقة</SelectItem>
                <SelectItem value="30">30 دقيقة</SelectItem>
                <SelectItem value="60">ساعة واحدة</SelectItem>
                <SelectItem value="120">ساعتان</SelectItem>
                <SelectItem value="480">8 ساعات</SelectItem>
                <SelectItem value="0">بدون حد</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
