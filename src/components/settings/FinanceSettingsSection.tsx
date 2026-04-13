import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import TeamAccountManager from "./TeamAccountManager";
import FiscalPeriodsManager from "./FiscalPeriodsManager";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const accountOptions = [
  { code: "1110", name: "الصندوق" },
  { code: "1120", name: "البنك" },
  { code: "1130", name: "ذمم عملاء" },
  { code: "1140", name: "المخزون" },
  { code: "1150", name: "شيكات واردة" },
  { code: "2110", name: "ذمم موردين" },
  { code: "2130", name: "رواتب مستحقة" },
  { code: "2140", name: "ضرائب مستحقة" },
  { code: "4100", name: "إيرادات المبيعات" },
  { code: "5100", name: "تكلفة المبيعات" },
  { code: "5110", name: "المشتريات" },
  { code: "5150", name: "الرواتب والأجور" },
];

const AccountSelect = ({ value, onValueChange, label }: { value: string; onValueChange: (v: string) => void; label: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger><SelectValue placeholder="اختر حساب" /></SelectTrigger>
      <SelectContent>
        {accountOptions.map(a => (
          <SelectItem key={a.code} value={a.code}>{a.code} - {a.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const FinanceSettingsSection = ({ settings, onChange }: Props) => {
  const { user } = useAuth();
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("bank_accounts").select("id, name, bank_name")
      .eq("user_id", user.id).eq("is_active", true)
      .then(({ data }) => setBankAccounts(data || []));
  }, [user]);

  return (
    <div className="p-6 space-y-8">
      {/* Default Accounts */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الحسابات الافتراضية
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AccountSelect label="حساب الإيرادات الافتراضي" value={settings.default_revenue_account} onValueChange={v => onChange({ default_revenue_account: v })} />
          <AccountSelect label="حساب المصاريف الافتراضي" value={settings.default_expense_account} onValueChange={v => onChange({ default_expense_account: v })} />
          <AccountSelect label="حساب الصندوق" value={settings.default_cash_account} onValueChange={v => onChange({ default_cash_account: v })} />
          <AccountSelect label="حساب البنك الرئيسي" value={settings.default_bank_account} onValueChange={v => onChange({ default_bank_account: v })} />
          <AccountSelect label="حساب الذمم المدينة" value={settings.default_receivable_account} onValueChange={v => onChange({ default_receivable_account: v })} />
          <AccountSelect label="حساب الذمم الدائنة" value={settings.default_payable_account} onValueChange={v => onChange({ default_payable_account: v })} />
          {/* Card/Visa Bank Account */}
          <div className="space-y-2">
            <Label>حساب بنكي لجهاز البطاقة (Visa)</Label>
            <Select value={settings.card_bank_account_id || ""} onValueChange={v => onChange({ card_bank_account_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الحساب البنكي المرتبط بالفيزا" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map(ba => (
                  <SelectItem key={ba.id} value={ba.id}>{ba.name} - {ba.bank_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">يتم اختياره تلقائياً عند اختيار "بطاقة" في سندات القبض/الصرف ونقطة البيع</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Tax */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الضرائب
        </h3>
        <div className="space-y-5">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">ضريبة القيمة المضافة (VAT)</p>
              <p className="text-xs text-muted-foreground">تفعيل احتساب ضريبة القيمة المضافة</p>
            </div>
            <Switch checked={settings.vat_enabled} onCheckedChange={v => onChange({ vat_enabled: v })} />
          </div>

          {settings.vat_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
              <div className="space-y-2">
                <Label>نسبة الضريبة الافتراضية (%)</Label>
                <Input type="number" value={settings.vat_rate} onChange={e => onChange({ vat_rate: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>طريقة احتساب الضريبة</Label>
                <Select value={settings.vat_inclusive ? "inclusive" : "exclusive"} onValueChange={v => onChange({ vat_inclusive: v === "inclusive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inclusive">شاملة في السعر</SelectItem>
                    <SelectItem value="exclusive">تضاف فوق السعر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AccountSelect label="حساب ضريبة المبيعات" value={settings.vat_sales_account} onValueChange={v => onChange({ vat_sales_account: v })} />
              <AccountSelect label="حساب ضريبة المشتريات" value={settings.vat_purchases_account} onValueChange={v => onChange({ vat_purchases_account: v })} />
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">ضريبة الدخل</p>
              <p className="text-xs text-muted-foreground">تفعيل حساب ضريبة الدخل تلقائياً</p>
            </div>
            <Switch checked={settings.income_tax_enabled} onCheckedChange={v => onChange({ income_tax_enabled: v })} />
          </div>

          {settings.income_tax_enabled && (
            <div className="pr-4">
              <div className="space-y-2 max-w-xs">
                <Label>نسبة الاستقطاع (%)</Label>
                <Input type="number" value={settings.income_tax_rate} onChange={e => onChange({ income_tax_rate: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Document Numbering */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          ترقيم المستندات
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: "invoice_prefix" as const, label: "الفواتير", example: "INV" },
            { key: "receipt_prefix" as const, label: "سندات القبض", example: "REC" },
            { key: "payment_prefix" as const, label: "سندات الصرف", example: "PAY" },
            { key: "journal_prefix" as const, label: "سندات القيد", example: "JV" },
            { key: "purchase_order_prefix" as const, label: "أوامر الشراء", example: "PO" },
          ].map(item => (
            <div key={item.key} className="space-y-2">
              <Label>{item.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={settings[item.key]}
                  onChange={e => onChange({ [item.key]: e.target.value })}
                  className="w-24"
                  dir="ltr"
                />
                <span className="text-xs text-muted-foreground dir-ltr">-2026-0001</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Checkbox
            checked={settings.reset_numbering_yearly}
            onCheckedChange={v => onChange({ reset_numbering_yearly: !!v })}
          />
          <span className="text-sm">إعادة الترقيم من 0001 كل سنة جديدة</span>
        </div>
      </div>

      <Separator />

      <FiscalPeriodsManager />
      <TeamAccountManager type="accountant" />
    </div>
  );
};

export default FinanceSettingsSection;
