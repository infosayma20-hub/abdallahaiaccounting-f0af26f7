import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, MessageCircle, Table, Mail, Cloud, MessageSquare, Plug } from "lucide-react";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const integrations = [
  {
    id: "whatsapp",
    name: "واتساب",
    desc: "إرسال الفواتير والتذكيرات عبر واتساب",
    icon: MessageCircle,
    key: "integration_whatsapp",
  },
  {
    id: "google_sheets",
    name: "جوجل شيتس",
    desc: "تصدير البيانات تلقائياً لجداول بيانات Google",
    icon: Table,
    key: "integration_google_sheets",
  },
  {
    id: "email_smtp",
    name: "البريد الإلكتروني (SMTP)",
    desc: "إرسال الفواتير والتقارير بالبريد الإلكتروني",
    icon: Mail,
    key: "integration_email_smtp",
  },
  {
    id: "cloud_backup",
    name: "النسخ الاحتياطي السحابي",
    desc: "نسخ احتياطي تلقائي يومي للبيانات",
    icon: Cloud,
    key: "integration_cloud_backup",
  },
  {
    id: "sms",
    name: "الرسائل النصية (SMS)",
    desc: "إرسال تذكيرات الدفع والتنبيهات عبر SMS",
    icon: MessageSquare,
    key: "integration_sms",
  },
];

const IntegrationsSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* Connected Services */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الخدمات المتصلة
        </h3>
        <div className="space-y-3">
          {integrations.map(item => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
              <Switch checked={(settings as any)[item.key] ?? false} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* API */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          واجهة برمجة التطبيقات (API)
        </h3>
        <div className="bg-muted/40 rounded-lg p-4 border border-border">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🔌</span>
            <div>
              <p className="font-medium text-sm">AMWALI API</p>
              <p className="text-xs text-muted-foreground">دمج AMWALI مع أنظمتك الخارجية</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span>التوثيق والمفاتيح متاحة قريباً</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Import/Export */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الاستيراد والتصدير
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تصدير تلقائي نهاية الشهر</p>
              <p className="text-xs text-muted-foreground">تصدير Excel تلقائي للتقارير الشهرية</p>
            </div>
            <Switch checked={(settings as any).integration_auto_export ?? false} onCheckedChange={v => onChange({ integration_auto_export: v } as any)} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">صيغة التصدير الافتراضية</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx) أو PDF</p>
            </div>
            <div className="flex gap-2">
              {["xlsx", "pdf"].map(fmt => (
                <button
                  key={fmt}
                  onClick={() => onChange({ integration_export_format: fmt } as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    ((settings as any).integration_export_format ?? "xlsx") === fmt
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationsSettingsSection;
