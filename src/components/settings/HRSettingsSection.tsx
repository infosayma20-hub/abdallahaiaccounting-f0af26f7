import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import TeamAccountManager from "./TeamAccountManager";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const HRSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="space-y-4">
      <SettingsSection title="جدول العمل" description="أيام وساعات وأوقات الدوام الافتراضية.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>أيام العمل في الأسبوع</Label>
            <Select value={String(settings.hr_work_days_per_week ?? 6)} onValueChange={v => onChange({ hr_work_days_per_week: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 أيام</SelectItem>
                <SelectItem value="6">6 أيام</SelectItem>
                <SelectItem value="7">7 أيام</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ساعات العمل اليومية</Label>
            <Input type="number" value={settings.hr_daily_hours ?? 8} onChange={e => onChange({ hr_daily_hours: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>بداية الدوام</Label>
            <Input type="time" value={settings.hr_shift_start ?? "08:00"} onChange={e => onChange({ hr_shift_start: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>نهاية الدوام</Label>
            <Input type="time" value={settings.hr_shift_end ?? "16:00"} onChange={e => onChange({ hr_shift_end: e.target.value })} dir="ltr" />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="الحضور والانصراف" description="قواعد التأخير وآلية تسجيل الحضور.">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">السماح بالتأخير (دقائق)</p>
              <p className="text-xs text-muted-foreground">فترة سماح قبل احتساب التأخير</p>
            </div>
            <Input type="number" className="w-20" value={settings.hr_late_grace_minutes ?? 15} onChange={e => onChange({ hr_late_grace_minutes: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">تسجيل الحضور بـ QR فقط</span>
            <Switch checked={settings.hr_require_qr ?? false} onCheckedChange={v => onChange({ hr_require_qr: v })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">التحقق من الموقع الجغرافي (GPS)</span>
            <Switch checked={settings.hr_require_gps ?? true} onCheckedChange={v => onChange({ hr_require_gps: v })} />
          </div>
          <div className="p-3 bg-muted/40 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">سقف المغادرات اليومي (الوقت بين الجلسات)</p>
                <p className="text-xs text-muted-foreground">
                  احتساب مجموع الخروج والعودة خلال اليوم (صلاة/أكل/تدخين…) وتنبيه عند التجاوز — لا يشمل الإجازات ولا البصمات المفتوحة
                </p>
              </div>
              <Switch
                checked={settings.hr_departure_cap_enabled ?? false}
                onCheckedChange={v => onChange({ hr_departure_cap_enabled: v })}
              />
            </div>
            {(settings.hr_departure_cap_enabled ?? false) && (
              <div className="flex items-center justify-between">
                <span className="text-sm">الحد المسموح يومياً (دقائق)</span>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={settings.hr_departure_cap_minutes ?? 30}
                  onChange={e => onChange({ hr_departure_cap_minutes: Math.max(1, Number(e.target.value) || 30) })}
                />
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="الإجازات" description="رصيد الإجازات السنوية والمرضية وقواعد الترحيل.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>رصيد الإجازات السنوية (أيام)</Label>
            <Input type="number" value={settings.hr_annual_leave_days ?? 14} onChange={e => onChange({ hr_annual_leave_days: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>رصيد الإجازات المرضية (أيام)</Label>
            <Input type="number" value={settings.hr_sick_leave_days ?? 14} onChange={e => onChange({ hr_sick_leave_days: Number(e.target.value) })} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between p-3 bg-muted/40 rounded-lg">
          <span className="text-sm">ترحيل الإجازات غير المستخدمة للسنة التالية</span>
          <Switch checked={settings.hr_carry_over_leave ?? false} onCheckedChange={v => onChange({ hr_carry_over_leave: v })} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="استقبال طلبات الموظفين"
        description="تحكم دائرة الموارد البشرية بفتح أو إغلاق تقديم طلبات السلف والإجازات من قبل الموظفين."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">السماح بتقديم طلبات السلف</p>
              <p className="text-xs text-muted-foreground">عند الإغلاق، لن يتمكن الموظفون من إرسال طلبات سلفة جديدة.</p>
            </div>
            <Switch
              checked={settings.hr_allow_advance_requests !== false}
              onCheckedChange={v => onChange({ hr_allow_advance_requests: v })}
            />
          </div>
          {settings.hr_allow_advance_requests === false && (
            <div className="space-y-2 pr-3">
              <Label className="text-xs">رسالة تظهر للموظف عند محاولة تقديم سلفة (اختياري)</Label>
              <Textarea
                rows={2}
                placeholder="مثال: تم إغلاق استقبال طلبات السلف حتى نهاية الشهر."
                value={settings.hr_advance_requests_closed_message ?? ""}
                onChange={e => onChange({ hr_advance_requests_closed_message: e.target.value })}
              />
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">السماح بتقديم طلبات الإجازات</p>
              <p className="text-xs text-muted-foreground">عند الإغلاق، لن يتمكن الموظفون من إرسال طلبات إجازة جديدة.</p>
            </div>
            <Switch
              checked={settings.hr_allow_leave_requests !== false}
              onCheckedChange={v => onChange({ hr_allow_leave_requests: v })}
            />
          </div>
          {settings.hr_allow_leave_requests === false && (
            <div className="space-y-2 pr-3">
              <Label className="text-xs">رسالة تظهر للموظف عند محاولة تقديم إجازة (اختياري)</Label>
              <Textarea
                rows={2}
                placeholder="مثال: تم إغلاق استقبال طلبات الإجازات مؤقتاً."
                value={settings.hr_leave_requests_closed_message ?? ""}
                onChange={e => onChange({ hr_leave_requests_closed_message: e.target.value })}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="الرواتب" description="موعد الصرف والعملة وخصومات افتراضية.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>يوم صرف الرواتب الشهري</Label>
            <Select value={String(settings.hr_salary_day ?? 28)} onValueChange={v => onChange({ hr_salary_day: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1,5,10,15,20,25,28,30].map(d => (
                  <SelectItem key={d} value={String(d)}>يوم {d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>عملة الرواتب</Label>
            <Select value={settings.hr_salary_currency ?? "ILS"} onValueChange={v => onChange({ hr_salary_currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ILS">₪ شيكل</SelectItem>
                <SelectItem value="USD">$ دولار</SelectItem>
                <SelectItem value="JOD">د.أ دينار</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between p-3 bg-muted/40 rounded-lg">
          <div>
            <p className="font-medium text-sm">خصم التأمين الاجتماعي</p>
            <p className="text-xs text-muted-foreground">خصم تلقائي من الراتب</p>
          </div>
          <Switch checked={settings.hr_social_security ?? false} onCheckedChange={v => onChange({ hr_social_security: v })} />
        </div>
      </SettingsSection>

      <SettingsSection title="حساب مدير الموارد البشرية" description="إنشاء حساب مدير HR مرتبط بالشركة.">
        <TeamAccountManager type="hr_manager" />
      </SettingsSection>
    </div>
  );
};

export default HRSettingsSection;
