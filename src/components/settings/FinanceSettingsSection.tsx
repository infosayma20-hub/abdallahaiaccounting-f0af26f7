import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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

      {/* Tax — link to dedicated section */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الضرائب
        </h3>
        <button
          type="button"
          onClick={() => navigate("/settings?section=tax")}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">إعدادات الضريبة</p>
              <p className="text-[11px] text-muted-foreground">VAT، ضريبة الدخل، حسابات الضريبة والتقارير الدورية</p>
            </div>
          </div>
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
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
