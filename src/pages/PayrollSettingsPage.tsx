import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, RotateCcw, Settings2 } from "lucide-react";
import BackButton from "@/components/BackButton";

interface PayrollSettings {
  id: string;
  company_id: string;
  base_month_days: number;
  default_hourly_rate: number;
  overtime_multiplier: number;
  food_group_percentage: number;
  food_individual_percentage: number;
  food_transport_base: number;
  food_transport_start_months: number;
  family_allowance_start_months: number;
  wife_allowance: number;
  child_allowance: number;
  annual_increment_per_year: number;
  attendance_bonus_max_absent: number;
  attendance_bonus_rate: number;
  min_deduction_threshold: number;
  full_attendance_days: number;
  currency: string;
  currency_symbol: string;
  // Meal discount module (Phase 2/3)
  meal_discount_mode?: "single" | "dual";
  meal_monthly_cap_family?: number;
  meal_monthly_cap_individual?: number;
  meal_monthly_warn_at_pct?: number;
  auto_journal_for_meals?: boolean;
  meal_company_share_account_code?: string | null;
  meal_employee_payable_account_code?: string | null;
}

const DEFAULTS: Omit<PayrollSettings, "id" | "company_id"> = {
  base_month_days: 28,
  default_hourly_rate: 9.6,
  overtime_multiplier: 1.5,
  food_group_percentage: 90,
  food_individual_percentage: 50,
  food_transport_base: 600,
  food_transport_start_months: 3,
  family_allowance_start_months: 6,
  wife_allowance: 200,
  child_allowance: 70,
  annual_increment_per_year: 100,
  attendance_bonus_max_absent: 4,
  attendance_bonus_rate: 9.6,
  min_deduction_threshold: 20,
  full_attendance_days: 25,
  currency: "ILS",
  currency_symbol: "₪",
};

export default function PayrollSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    setLoading(true);
    // Get company for this user
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", user!.id)
      .maybeSingle();

    if (!company) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("payroll_settings" as any)
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      // Create default if missing
      const { data: newData } = await supabase
        .from("payroll_settings" as any)
        .insert({ company_id: company.id } as any)
        .select()
        .single();
      setSettings(newData as any);
    } else if (data) {
      setSettings(data as any);
    } else {
      // No settings yet, create defaults
      const { data: newData } = await supabase
        .from("payroll_settings" as any)
        .insert({ company_id: company.id } as any)
        .select()
        .single();
      setSettings(newData as any);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { id, company_id, ...updates } = settings;
    const { error } = await supabase
      .from("payroll_settings" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("خطأ في الحفظ");
    else toast.success("تم حفظ الإعدادات بنجاح");
    setSaving(false);
  };

  const handleReset = () => {
    if (!settings) return;
    setSettings({ ...settings, ...DEFAULTS });
    toast.info("تم إعادة القيم للافتراضي — اضغط حفظ للتأكيد");
  };

  const updateField = (field: keyof PayrollSettings, value: number | string) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-muted-foreground">لم يتم العثور على إعدادات. تأكد من تسجيل شركتك أولاً.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground">إعدادات الرواتب</h1>
            <p className="text-sm text-muted-foreground">تخصيص قواعد الحساب لشركتك</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
            <RotateCcw className="h-4 w-4" /> إعادة للافتراضي
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الإعدادات
          </Button>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid gap-6">
        {/* Base Calculation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> أساس الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">أيام الشهر الأساسية</Label>
              <Input type="number" value={settings.base_month_days} onChange={e => updateField("base_month_days", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">معدل الساعة الافتراضي ({settings.currency_symbol})</Label>
              <Input type="number" step="0.1" value={settings.default_hourly_rate} onChange={e => updateField("default_hourly_rate", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">نسبة الأوفر تايم (×)</Label>
              <Input type="number" step="0.1" value={settings.overtime_multiplier} onChange={e => updateField("overtime_multiplier", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Food & Transport */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">بدل الأكل والمواصلات</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">المبلغ الأساسي ({settings.currency_symbol})</Label>
              <Input type="number" value={settings.food_transport_base} onChange={e => updateField("food_transport_base", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">يبدأ بعد (أشهر)</Label>
              <Input type="number" value={settings.food_transport_start_months} onChange={e => updateField("food_transport_start_months", Number(e.target.value))} />
            </div>
            <div className="md:col-span-1" />
            <div>
              <Label className="text-xs text-muted-foreground">خصم أكل جماعي (%)</Label>
              <Input type="number" value={settings.food_group_percentage} onChange={e => updateField("food_group_percentage", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">خصم أكل فردي (%)</Label>
              <Input type="number" value={settings.food_individual_percentage} onChange={e => updateField("food_individual_percentage", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Family Allowances */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">علاوة الزوجة والأبناء</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">يبدأ بعد (أشهر)</Label>
              <Input type="number" value={settings.family_allowance_start_months} onChange={e => updateField("family_allowance_start_months", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">علاوة الزوجة ({settings.currency_symbol})</Label>
              <Input type="number" value={settings.wife_allowance} onChange={e => updateField("wife_allowance", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">علاوة الطفل ({settings.currency_symbol})</Label>
              <Input type="number" value={settings.child_allowance} onChange={e => updateField("child_allowance", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Annual Increment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">العلاوة السنوية</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">زيادة لكل سنة ({settings.currency_symbol})</Label>
              <Input type="number" value={settings.annual_increment_per_year} onChange={e => updateField("annual_increment_per_year", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Attendance Bonus */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">مكافأة الحضور</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">الحد الأقصى للغياب (أيام)</Label>
              <Input type="number" value={settings.attendance_bonus_max_absent} onChange={e => updateField("attendance_bonus_max_absent", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">معدل المكافأة ({settings.currency_symbol})</Label>
              <Input type="number" step="0.1" value={settings.attendance_bonus_rate} onChange={e => updateField("attendance_bonus_rate", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">الحضور الكامل (أيام)</Label>
              <Input type="number" value={settings.full_attendance_days} onChange={e => updateField("full_attendance_days", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Deduction Rules */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">قواعد الخصم</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">أقل مبلغ للخصم ({settings.currency_symbol})</Label>
              <Input type="number" value={settings.min_deduction_threshold} onChange={e => updateField("min_deduction_threshold", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        {/* Currency */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">عملة الرواتب</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">رمز العملة</Label>
              <Input value={settings.currency} onChange={e => updateField("currency", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">رمز العملة (عرض)</Label>
              <Input value={settings.currency_symbol} onChange={e => updateField("currency_symbol", e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
