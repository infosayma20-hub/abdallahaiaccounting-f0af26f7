import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const NotificationsSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* Financial Alerts */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          تنبيهات مالية
        </h3>
        <div className="space-y-3">
          {[
            { key: "notify_low_cash", label: "تنبيه انخفاض السيولة", desc: "عندما ينخفض رصيد الصندوق عن الحد" },
            { key: "notify_overdue_receivables", label: "تنبيه الذمم المتأخرة", desc: "ذمم مستحقة تجاوزت تاريخ الاستحقاق" },
            { key: "notify_cheque_due", label: "تنبيه استحقاق شيكات", desc: "قبل يوم من موعد الشيك" },
            { key: "notify_large_transaction", label: "تنبيه المعاملات الكبيرة", desc: "عند تسجيل معاملة تتجاوز المبلغ المحدد" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked={(settings as any)[item.key] ?? true} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Operational Alerts */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          تنبيهات تشغيلية
        </h3>
        <div className="space-y-3">
          {[
            { key: "notify_inventory_low", label: "تنبيه نقص المخزون", desc: "عند وصول منتج للحد الأدنى" },
            { key: "notify_shift_end", label: "تنبيه انتهاء الوردية", desc: "تذكير بإغلاق الوردية" },
            { key: "notify_new_order", label: "تنبيه طلب جديد", desc: "عند استلام طلب جديد في نقطة البيع" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked={(settings as any)[item.key] ?? true} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Delivery Method */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          طريقة التوصيل
        </h3>
        <div className="space-y-3">
          {[
            { key: "notify_via_app", label: "داخل التطبيق", desc: "إشعارات داخل النظام" },
            { key: "notify_via_email", label: "البريد الإلكتروني", desc: "إرسال نسخة على الإيميل" },
            { key: "notify_via_sound", label: "صوت التنبيه", desc: "تشغيل صوت عند وصول إشعار" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked={(settings as any)[item.key] ?? (item.key === "notify_via_app")} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotificationsSettingsSection;
