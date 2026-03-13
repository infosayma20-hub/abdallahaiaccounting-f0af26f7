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

const AISettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* AI Assistant */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          المحاسب الذكي
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تفعيل المحاسب الذكي</p>
              <p className="text-xs text-muted-foreground">مساعد ذكي للاستفسارات المالية والمحاسبية</p>
            </div>
            <Switch checked={(settings as any).ai_assistant_enabled ?? true} onCheckedChange={v => onChange({ ai_assistant_enabled: v } as any)} />
          </div>
          <div className="space-y-2">
            <Label>لغة الردود</Label>
            <Select value={(settings as any).ai_response_language ?? "ar"} onValueChange={v => onChange({ ai_response_language: v } as any)}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">تلقائي (حسب السؤال)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>أسلوب الردود</Label>
            <Select value={(settings as any).ai_response_style ?? "professional"} onValueChange={v => onChange({ ai_response_style: v } as any)}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">مهني ورسمي</SelectItem>
                <SelectItem value="friendly">ودود ومبسّط</SelectItem>
                <SelectItem value="concise">مختصر ومباشر</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Smart Features */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الميزات الذكية
        </h3>
        <div className="space-y-3">
          {[
            { key: "ai_auto_categorize", label: "تصنيف تلقائي للمعاملات", desc: "تصنيف المعاملات تلقائياً بناءً على الوصف" },
            { key: "ai_anomaly_detection", label: "كشف الأنماط غير العادية", desc: "تنبيه عند وجود معاملات غير معتادة" },
            { key: "ai_smart_predictions", label: "التنبؤ المالي", desc: "توقع التدفقات النقدية والمبيعات المستقبلية" },
            { key: "ai_daily_summary", label: "ملخص يومي ذكي", desc: "إعداد ملخص يومي تلقائي للنشاط المالي" },
            { key: "ai_document_scan", label: "قراءة المستندات (OCR)", desc: "استخراج البيانات من الفواتير والإيصالات تلقائياً" },
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

      {/* Data & Privacy */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          البيانات والخصوصية
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">حفظ سجل المحادثات</p>
              <p className="text-xs text-muted-foreground">الاحتفاظ بتاريخ المحادثات مع المحاسب الذكي</p>
            </div>
            <Switch checked={(settings as any).ai_save_history ?? true} onCheckedChange={v => onChange({ ai_save_history: v } as any)} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">الذاكرة الذكية</p>
              <p className="text-xs text-muted-foreground">تذكّر تفضيلاتك وأنماطك لتحسين الاقتراحات</p>
            </div>
            <Switch checked={(settings as any).ai_smart_memory ?? true} onCheckedChange={v => onChange({ ai_smart_memory: v } as any)} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AISettingsSection;
