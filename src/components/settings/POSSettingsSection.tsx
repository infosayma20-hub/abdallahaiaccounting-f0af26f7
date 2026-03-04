import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const paymentMethods = [
  { code: "cash", label: "نقدي" },
  { code: "network", label: "شبكة" },
  { code: "transfer", label: "تحويل" },
  { code: "credit", label: "آجل" },
  { code: "employee", label: "حساب موظف" },
];

const POSSettingsSection = ({ settings, onChange }: Props) => {
  const togglePayment = (code: string) => {
    const current = settings.pos_payment_methods;
    if (current.includes(code)) {
      onChange({ pos_payment_methods: current.filter(c => c !== code) });
    } else {
      onChange({ pos_payment_methods: [...current, code] });
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* General */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الإعداد العام
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>اسم نقطة البيع</Label>
            <Input value={settings.pos_name} onChange={e => onChange({ pos_name: e.target.value })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Payment */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          طرق الدفع المقبولة
        </h3>
        <div className="space-y-2">
          {paymentMethods.map(pm => (
            <div key={pm.code} className="flex items-center gap-2">
              <Checkbox
                checked={settings.pos_payment_methods.includes(pm.code)}
                onCheckedChange={() => togglePayment(pm.code)}
              />
              <span className="text-sm">{pm.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Shift */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الوردية
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">فتح وردية إلزامي قبل البيع</span>
            <Switch checked={settings.pos_require_shift} onCheckedChange={v => onChange({ pos_require_shift: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>رصيد افتتاحي افتراضي (₪)</Label>
              <Input type="number" value={settings.pos_default_opening_balance} onChange={e => onChange({ pos_default_opening_balance: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>حد التنبيه للعجز (₪)</Label>
              <Input type="number" value={settings.pos_deficit_threshold} onChange={e => onChange({ pos_deficit_threshold: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">إشعار عند عجز الصندوق</span>
            <Switch checked={settings.pos_deficit_alert} onCheckedChange={v => onChange({ pos_deficit_alert: v })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Receipt */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الطباعة والفاتورة
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>حجم الفاتورة</Label>
            <Select value={settings.pos_receipt_size} onValueChange={v => onChange({ pos_receipt_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80mm">80mm (حرارية)</SelectItem>
                <SelectItem value="58mm">58mm (حرارية صغيرة)</SelectItem>
                <SelectItem value="A4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>نسخ الفاتورة</Label>
            <Select value={String(settings.pos_receipt_copies)} onValueChange={v => onChange({ pos_receipt_copies: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {[
            { key: "pos_auto_print" as const, label: "طباعة تلقائية بعد كل بيع" },
            { key: "pos_show_tax" as const, label: "إظهار الضريبة في الفاتورة" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <span className="text-sm">{item.label}</span>
              <Switch checked={settings[item.key]} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Stock */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          المخزون
        </h3>
        <div className="space-y-3">
          {[
            { key: "pos_auto_update_stock" as const, label: "تحديث المخزون تلقائياً عند البيع" },
            { key: "pos_warn_out_of_stock" as const, label: "تحذير عند نفاد المخزون" },
            { key: "pos_prevent_zero_stock" as const, label: "منع البيع إذا المخزون = 0" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <span className="text-sm">{item.label}</span>
              <Switch checked={settings[item.key]} onCheckedChange={v => onChange({ [item.key]: v })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default POSSettingsSection;
