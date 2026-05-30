import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InvoiceTemplateCustomizer from "./InvoiceTemplateCustomizer";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const InvoiceSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-6">
      <Tabs defaultValue="template" dir="rtl">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="template">تصميم الفاتورة</TabsTrigger>
          <TabsTrigger value="defaults">إعدادات عامة</TabsTrigger>
          <TabsTrigger value="advanced">متقدم</TabsTrigger>
        </TabsList>

        {/* Tab 1: Template Customizer */}
        <TabsContent value="template">
          <InvoiceTemplateCustomizer settings={settings} onChange={onChange} />
        </TabsContent>

        {/* Tab 2: General Defaults */}
        <TabsContent value="defaults" className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              إعدادات الفاتورة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>شروط الدفع الافتراضية</Label>
                <Select value={settings.default_payment_terms} onValueChange={v => onChange({ default_payment_terms: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="30days">30 يوم</SelectItem>
                    <SelectItem value="60days">60 يوم</SelectItem>
                    <SelectItem value="90days">90 يوم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>عملة الفاتورة الافتراضية</Label>
                <Select value={settings.default_invoice_currency} onValueChange={v => onChange({ default_invoice_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ شيكل</SelectItem>
                    <SelectItem value="USD">$ دولار</SelectItem>
                    <SelectItem value="JOD">د.أ دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>لغة الفاتورة الافتراضية</Label>
                <Select value={settings.default_invoice_language} onValueChange={v => onChange({ default_invoice_language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">عربي</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="both">كلاهما</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label>ملاحظات افتراضية للفاتورة</Label>
              <Textarea
                value={settings.invoice_default_notes}
                onChange={e => onChange({ invoice_default_notes: e.target.value })}
                placeholder="شكراً لتعاملكم معنا"
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Discounts */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              الحسومات
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <span className="text-sm">السماح بإعطاء حسم على الفاتورة</span>
                <Switch checked={settings.allow_discount} onCheckedChange={v => onChange({ allow_discount: v })} />
              </div>
              {settings.allow_discount && (
                <div className="space-y-2 max-w-xs pr-4">
                  <Label>الحد الأقصى للحسم (%)</Label>
                  <Input type="number" value={settings.max_discount_percent} onChange={e => onChange({ max_discount_percent: Number(e.target.value) })} />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Advanced */}
        <TabsContent value="advanced" className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              الفاتورة الإلكترونية
            </h3>
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="text-sm font-medium">تفعيل الفاتورة الإلكترونية (e-Invoice)</p>
                <p className="text-xs text-muted-foreground">وزارة المالية الفلسطينية</p>
              </div>
              <Switch checked={settings.e_invoice_enabled} onCheckedChange={v => onChange({ e_invoice_enabled: v })} />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            {[
              { key: "allow_invoice_edit_after_approval" as const, label: "السماح بتعديل الفاتورة بعد اعتمادها (يتطلب صلاحية مدير)" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <span className="text-sm">{item.label}</span>
                <Switch checked={settings[item.key]} onCheckedChange={v => onChange({ [item.key]: v })} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InvoiceSettingsSection;
