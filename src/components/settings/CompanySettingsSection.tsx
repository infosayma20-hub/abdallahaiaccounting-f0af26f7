import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const CompanySettingsSection = ({ settings, onChange }: Props) => {
  const toggleCurrency = (code: string) => {
    const current = settings.extra_currencies;
    if (current.includes(code)) {
      onChange({ extra_currencies: current.filter(c => c !== code) });
    } else {
      onChange({ extra_currencies: [...current, code] });
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Company Info */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          معلومات الشركة
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>اسم الشركة *</Label>
            <Input value={settings.company_name} onChange={e => onChange({ company_name: e.target.value })} placeholder="اسم الشركة" />
          </div>
          <div className="space-y-2">
            <Label>الشعار</Label>
            <Input value={settings.logo_url} onChange={e => onChange({ logo_url: e.target.value })} placeholder="رابط الشعار (URL)" />
            <p className="text-xs text-muted-foreground">يظهر في الفواتير والتقارير</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>العنوان الكامل</Label>
            <Input value={settings.address} onChange={e => onChange({ address: e.target.value })} placeholder="الشارع، المبنى..." />
          </div>
          <div className="space-y-2">
            <Label>المحافظة / المدينة</Label>
            <Input value={settings.city} onChange={e => onChange({ city: e.target.value })} placeholder="رام الله" />
          </div>
          <div className="space-y-2">
            <Label>رقم الهاتف / الجوال</Label>
            <Input value={settings.phone} onChange={e => onChange({ phone: e.target.value })} placeholder="+970 XX XXX XXXX" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>رقم الهاتف / الجوال الثاني</Label>
            <Input value={settings.phone2 || ""} onChange={e => onChange({ phone2: e.target.value })} placeholder="+970 XX XXX XXXX" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>البريد الإلكتروني الرسمي</Label>
            <Input value={settings.email} onChange={e => onChange({ email: e.target.value })} placeholder="info@company.com" dir="ltr" type="email" />
          </div>
          <div className="space-y-2">
            <Label>الموقع الإلكتروني</Label>
            <Input value={settings.website} onChange={e => onChange({ website: e.target.value })} placeholder="https://company.com" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>الرقم الضريبي</Label>
            <Input value={settings.tax_number} onChange={e => onChange({ tax_number: e.target.value })} placeholder="رقم التسجيل في الضريبة" />
          </div>
          <div className="space-y-2">
            <Label>رقم السجل التجاري</Label>
            <Input value={settings.commercial_register} onChange={e => onChange({ commercial_register: e.target.value })} placeholder="رقم السجل" />
          </div>
          <div className="space-y-2">
            <Label>رقم المشتغل المرخص</Label>
            <Input value={settings.licensed_dealer_number} onChange={e => onChange({ licensed_dealer_number: e.target.value })} placeholder="رقم الترخيص حسب القانون الفلسطيني" />
            <p className="text-xs text-muted-foreground">يظهر إلزامياً على الفواتير حسب القانون</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Currency & Market */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          العملة والسوق
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>العملة الأساسية</Label>
            <Select value={settings.base_currency} onValueChange={v => onChange({ base_currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ILS">₪ شيكل إسرائيلي</SelectItem>
                <SelectItem value="USD">$ دولار أمريكي</SelectItem>
                <SelectItem value="JOD">د.أ دينار أردني</SelectItem>
                <SelectItem value="EUR">€ يورو</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>مصدر أسعار الصرف</Label>
            <Select value={settings.exchange_rate_source} onValueChange={v => onChange({ exchange_rate_source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تلقائي (يتحدث يومياً)</SelectItem>
                <SelectItem value="manual">يدوي (أدخله بنفسك)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>العملات الإضافية</Label>
            <div className="space-y-2">
              {[
                { code: "USD", label: "دولار أمريكي ($)" },
                { code: "JOD", label: "دينار أردني (د.أ)" },
                { code: "EUR", label: "يورو (€)" },
              ].map(c => (
                <div key={c.code} className="flex items-center gap-2">
                  <Checkbox
                    checked={settings.extra_currencies.includes(c.code)}
                    onCheckedChange={() => toggleCurrency(c.code)}
                  />
                  <span className="text-sm">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>التقويم المستخدم</Label>
            <Select value={settings.calendar_type} onValueChange={v => onChange({ calendar_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gregorian">ميلادي</SelectItem>
                <SelectItem value="hijri">هجري</SelectItem>
                <SelectItem value="both">كلاهما</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>بداية السنة المالية</Label>
            <Select value={String(settings.fiscal_year_start)} onValueChange={v => onChange({ fiscal_year_start: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"].map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettingsSection;
