import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import PushNotificationCard from "./PushNotificationCard";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const NotificationsSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <SettingsSection title="تنبيهات مالية" description="إشعارات تتعلق بالسيولة والذمم والشيكات.">
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
      </SettingsSection>

      <SettingsSection title="تنبيهات تشغيلية" description="إشعارات المخزون والورديات والطلبات.">
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
      </SettingsSection>

      <SettingsSection
        title="طريقة التوصيل"
        description="القنوات التي تصل عبرها الإشعارات للمستخدمين."
        action={
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">
            بعض القنوات تتطلب Backend
          </Badge>
        }
      >
        <div className="space-y-3">
          {[
            { key: "notify_via_app", label: "داخل التطبيق", desc: "إشعارات داخل النظام", disabled: false },
            { key: "notify_via_sound", label: "صوت التنبيه", desc: "تشغيل صوت عند وصول إشعار", disabled: false },
            {
              key: "notify_via_email",
              label: "البريد الإلكتروني",
              desc: "قيد التحضير — يحتاج تكامل SMTP/Email",
              disabled: true,
              tip: "غير مفعّل — يتطلب ربط مزود بريد على الخادم",
            },
          ].map(item => (
            <div
              key={item.key}
              className={`flex items-center justify-between p-3 bg-muted/40 rounded-lg ${item.disabled ? "opacity-70" : ""}`}
            >
              <div className="flex-1">
                <p className="font-medium text-sm flex items-center gap-1.5">
                  {item.label}
                  {item.disabled && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>{item.tip}</TooltipContent>
                    </Tooltip>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={item.disabled ? false : ((settings as any)[item.key] ?? (item.key === "notify_via_app"))}
                onCheckedChange={v => !item.disabled && onChange({ [item.key]: v })}
                disabled={item.disabled}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      <PushNotificationCard />
    </div>
    </TooltipProvider>
  );
};

export default NotificationsSettingsSection;
