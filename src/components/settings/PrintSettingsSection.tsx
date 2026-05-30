import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const PrintSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* Customization */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          تخصيص الفاتورة
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>اللون الرئيسي</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={e => onChange({ primary_color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer"
              />
              <Input
                value={settings.primary_color}
                onChange={e => onChange({ primary_color: e.target.value })}
                className="w-32"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>الخط</Label>
            <Select value={settings.invoice_font} onValueChange={v => onChange({ invoice_font: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">عربي كلاسيك</SelectItem>
                <SelectItem value="modern">عصري</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>حجم الورق</Label>
            <Select value={settings.paper_size} onValueChange={v => onChange({ paper_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="80mm">حراري 80mm</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {[
            { key: "show_logo_on_invoice" as const, label: "إظهار الشعار" },
            { key: "show_address_on_invoice" as const, label: "إظهار العنوان" },
            { key: "print_decorative_ornaments" as const, label: "زخارف تزيينية على الفاتورة" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <span className="text-sm">{item.label}</span>
                {item.key === "print_decorative_ornaments" && (
                  <p className="text-xs text-muted-foreground mt-0.5">أشكال هندسية شفافة تضيف لمسة جمالية للهيدر والفوتر</p>
                )}
              </div>
              <Switch checked={(settings as any)[item.key] ?? (item.key !== "print_decorative_ornaments")} onCheckedChange={v => onChange({ [item.key]: v } as any)} />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <Label>تذييل الفاتورة</Label>
          <Textarea
            value={settings.invoice_footer}
            onChange={e => onChange({ invoice_footer: e.target.value })}
            placeholder="شكراً لتعاملكم معنا"
            rows={2}
          />
        </div>
      </div>

      <Separator />

      {/* Templates Preview */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          القوالب الجاهزة
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "فاتورة مبيعات" },
            { name: "سند قبض" },
            { name: "سند صرف" },
            { name: "قسيمة راتب" },
            { name: "كشف حساب" },
          ].map(template => (
            <div
              key={template.name}
              className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">معاينة</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrintSettingsSection;
