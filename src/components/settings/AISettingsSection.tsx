import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const AISettingsSection = ({ settings, onChange }: Props) => {
  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <SettingsSection
        title="المحاسب الذكي (حسيب)"
        description="مدعوم عبر Lovable AI Gateway — لا يحتاج مفاتيح إضافية."
        action={
          <Badge variant="outline" className="text-[10px] font-normal border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            مفعّل
          </Badge>
        }
      >
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
      </SettingsSection>

      <SettingsSection
        title="الميزات الذكية"
        description="ميزات إضافية للمحاسب الذكي."
        action={
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">
            بعض الميزات قيد التحضير
          </Badge>
        }
      >
        <div className="space-y-3">
          {[
            { key: "ai_auto_categorize", label: "تصنيف تلقائي للمعاملات", desc: "تصنيف المعاملات تلقائياً بناءً على الوصف", disabled: false, tip: "" },
            { key: "ai_anomaly_detection", label: "كشف الأنماط غير العادية", desc: "قيد التحضير — يحتاج محرك تحليل على الخادم", disabled: true, tip: "غير مفعّل حالياً" },
            { key: "ai_smart_predictions", label: "التنبؤ المالي", desc: "قيد التحضير — يحتاج Backend Job مجدول", disabled: true, tip: "غير مفعّل حالياً" },
            { key: "ai_daily_summary", label: "ملخص يومي ذكي", desc: "قيد التحضير — يحتاج Cron Job لإرسال الملخص", disabled: true, tip: "غير مفعّل حالياً" },
            { key: "ai_document_scan", label: "قراءة المستندات (OCR)", desc: "قيد التحضير — يحتاج تكامل OCR", disabled: true, tip: "غير مفعّل حالياً" },
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
                checked={item.disabled ? false : ((settings as any)[item.key] ?? true)}
                onCheckedChange={v => !item.disabled && onChange({ [item.key]: v })}
                disabled={item.disabled}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="البيانات والخصوصية" description="إدارة سجل المحادثات والذاكرة الذكية.">
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
      </SettingsSection>
    </div>
    </TooltipProvider>
  );
};

export default AISettingsSection;
