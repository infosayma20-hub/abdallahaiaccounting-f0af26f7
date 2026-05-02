import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Plus, Trash2, AlertTriangle, Shield } from "lucide-react";

interface Props { ownerId: string; }

interface TaxSettings {
  id?: string;
  tax_name?: string;
  tax_number?: string;
  tax_rate?: number;
  registration_type?: string;
  fiscal_year_start?: number;
  report_due_day?: number;
  prices_include_tax?: boolean;
  output_tax_account_code?: string;
  input_tax_account_code?: string;
  payable_tax_account_code?: string;
  refundable_tax_account_code?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

interface TaxCategory {
  id: string;
  name: string;
  code: string;
  tax_type: "standard" | "zero" | "exempt";
  rate: number | null;
  description?: string | null;
  is_active?: boolean | null;
}

const defaultCategories = [
  { name: "خاضع للضريبة 16%", code: "STD", tax_type: "standard", rate: 16, description: "صفقات خاضعة بالنسبة العامة", is_default: true },
  { name: "بنسبة صفر - تصدير", code: "ZERO-EXP", tax_type: "zero", rate: 0, description: "صادرات بنسبة صفر" },
  { name: "بنسبة صفر - منتجات نباتية", code: "ZERO-VEG", tax_type: "zero", rate: 0, description: "منتجات نباتية وخضراوات" },
  { name: "معفى - إيجار عقاري", code: "EXM-RENT", tax_type: "exempt", rate: null, description: "إيجار عقاري سكني" },
  { name: "معفى - تعليم", code: "EXM-EDU", tax_type: "exempt", rate: null, description: "خدمات تعليمية" },
  { name: "معفى - خدمة طبية", code: "EXM-MED", tax_type: "exempt", rate: null, description: "خدمات طبية وعلاجية" },
  { name: "معفى - بيع شقق ومحلات", code: "EXM-REAL", tax_type: "exempt", rate: null, description: "بيع عقارات جديدة" },
];

export default function TaxSettingsSection({ ownerId }: Props) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [categories, setCategories] = useState<TaxCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    loadData();
  }, [ownerId]);

  const loadData = async () => {
    setLoading(true);
    const [settingsRes, categoriesRes, companyRes] = await Promise.all([
      supabase.from("tax_settings").select("*").eq("user_id", ownerId).maybeSingle(),
      supabase.from("tax_categories").select("*").eq("user_id", ownerId).order("created_at"),
      supabase.from("company_settings").select("vat_enabled").eq("user_id", ownerId).maybeSingle(),
    ]);

    setVatEnabled(companyRes.data?.vat_enabled ?? true);

    if (settingsRes.data) {
      setSettings(settingsRes.data);
    } else {
      setSettings({
        tax_name: "ضريبة القيمة المضافة",
        tax_number: "",
        tax_rate: 16,
        registration_type: "licensed",
        fiscal_year_start: 1,
        report_due_day: 15,
        prices_include_tax: false,
        output_tax_account_code: "2190",
        input_tax_account_code: "1180",
        payable_tax_account_code: "2142",
        refundable_tax_account_code: "1442",
        is_active: true,
      });
    }

    setCategories(categoriesRes.data || []);
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!ownerId || !user) return;
    setSaving(true);
    try {
      const { data: updatedCompany, error: updateCompanyError } = await supabase
        .from("company_settings")
        .update({ vat_enabled: vatEnabled, updated_by: user.id } as any)
        .eq("user_id", ownerId)
        .select("id");

      if (updateCompanyError) throw updateCompanyError;

      if (!updatedCompany?.length) {
        const { error: insertCompanyError } = await supabase
          .from("company_settings")
          .insert({ user_id: ownerId, vat_enabled: vatEnabled, updated_by: user.id } as any);

        if (insertCompanyError) throw insertCompanyError;
      }

      if (vatEnabled) {
        const payload = { ...settings, user_id: ownerId, updated_at: new Date().toISOString() };
        delete payload.created_at;

        if (settings.id) {
          const { error } = await supabase.from("tax_settings").update(payload).eq("id", settings.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("tax_settings").insert(payload).select().single();
          if (error) throw error;
          if (data) setSettings(data);
        }
      }

      toast.success("تم حفظ الإعدادات الضريبية");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ إعدادات الضريبة");
    } finally {
      setSaving(false);
    }
  };

  const initDefaultCategories = async () => {
    if (!ownerId) return;
    const inserts = defaultCategories.map(c => ({ ...c, user_id: ownerId }));
    const { error } = await supabase.from("tax_categories").insert(inserts);
    if (error) { toast.error("خطأ في إضافة التصنيفات"); return; }
    toast.success("تم إضافة التصنيفات الافتراضية");
    loadData();
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">جارِ التحميل...</div>;

  const disabledStyle = !vatEnabled ? { opacity: 0.4, pointerEvents: "none" as const, transition: "all 0.3s ease" } : { transition: "all 0.3s ease" };

  return (
    <div className="space-y-6">
      {/* VAT Enable/Disable Toggle */}
      <Card className="p-6 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <p className="font-bold text-sm text-foreground">تفعيل نظام الضريبة (VAT)</p>
              <p className="text-xs text-muted-foreground">عند الإيقاف، لن تظهر الضريبة في أي فاتورة أو مستند</p>
            </div>
          </div>
          <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
        </div>
        {!vatEnabled && (
          <div className="mt-4 p-3 rounded-lg flex items-start gap-2" style={{ background: "#FFF8E1", border: "1px solid #F59E0B" }}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#92400E" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
              تنبيه: عند إيقاف الضريبة، لن تُحتسب أي ضريبة في الفواتير والمشتريات وسندات القيد. يمكنك إعادة التفعيل في أي وقت.
            </p>
          </div>
        )}
      </Card>

      {/* Registration Info */}
      <Card className="p-6 border border-border" style={disabledStyle}>
        <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          بيانات التسجيل الضريبي
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الرقم الضريبي للمنشأة</Label>
            <Input value={settings?.tax_number || ""} onChange={e => setSettings({ ...settings, tax_number: e.target.value })} placeholder="أدخل الرقم الضريبي" />
          </div>
          <div>
            <Label>نوع التسجيل</Label>
            <Select value={settings?.registration_type || "licensed"} onValueChange={v => setSettings({ ...settings, registration_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="licensed">مشتغل مرخص</SelectItem>
                <SelectItem value="exempt">مشتغل معفى</SelectItem>
                <SelectItem value="unregistered">غير مسجل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>نسبة الضريبة الافتراضية (%)</Label>
            <Input type="number" value={settings?.tax_rate || 16} onChange={e => setSettings({ ...settings, tax_rate: Number(e.target.value) })} />
          </div>
          <div>
            <Label>يوم تقديم التقرير الشهري</Label>
            <Input type="number" value={settings?.report_due_day || 15} onChange={e => setSettings({ ...settings, report_due_day: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch checked={settings?.prices_include_tax || false} onCheckedChange={v => setSettings({ ...settings, prices_include_tax: v })} />
            <Label>الأسعار شاملة الضريبة</Label>
          </div>
        </div>
      </Card>

      {/* Account Mapping */}
      <Card className="p-6 border border-border" style={disabledStyle}>
        <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-emerald-500 rounded-full" />
          ربط الحسابات المحاسبية
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>حساب ضريبة المبيعات المستحقة</Label>
            <Input value={settings?.output_tax_account_code || "2190"} onChange={e => setSettings({ ...settings, output_tax_account_code: e.target.value })} />
          </div>
          <div>
            <Label>حساب ضريبة المدخلات القابلة للخصم</Label>
            <Input value={settings?.input_tax_account_code || "1180"} onChange={e => setSettings({ ...settings, input_tax_account_code: e.target.value })} />
          </div>
          <div>
            <Label>حساب ضريبة واجبة التوريد</Label>
            <Input value={settings?.payable_tax_account_code || "2142"} onChange={e => setSettings({ ...settings, payable_tax_account_code: e.target.value })} />
          </div>
          <div>
            <Label>حساب ضريبة زائدة قابلة للاسترداد</Label>
            <Input value={settings?.refundable_tax_account_code || "1442"} onChange={e => setSettings({ ...settings, refundable_tax_account_code: e.target.value })} />
          </div>
        </div>
      </Card>




      {/* Tax Categories */}
      <Card className="p-6 border border-border" style={disabledStyle}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-foreground flex items-center gap-2">
            <span className="w-1 h-5 bg-amber-500 rounded-full" />
            تصنيفات الضريبة
          </h4>
          {categories.length === 0 && (
            <Button variant="outline" size="sm" onClick={initDefaultCategories} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              إضافة التصنيفات الافتراضية
            </Button>
          )}
        </div>

        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">لا توجد تصنيفات — اضغط "إضافة التصنيفات الافتراضية" لبدء الإعداد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0D1B2E", color: "#fff" }}>
                  <th className="px-3 py-2 text-right text-xs font-medium">الاسم</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">الكود</th>
                  <th className="px-3 py-2 text-center text-xs font-medium">النوع</th>
                  <th className="px-3 py-2 text-center text-xs font-medium">النسبة</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">الوصف</th>
                  <th className="px-3 py-2 text-center text-xs font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "" : "bg-muted/20"} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.tax_type === "standard" ? "bg-blue-50 text-blue-700" : c.tax_type === "zero" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                        {c.tax_type === "standard" ? "خاضع" : c.tax_type === "zero" ? "صفري" : "معفى"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{c.rate != null ? `${c.rate}%` : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{c.description}</td>
                    <td className="px-3 py-2 text-center">
                      {c.is_active ? <span className="text-emerald-600 text-xs">مفعّل</span> : <span className="text-red-500 text-xs">معطّل</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={saveSettings} disabled={saving} className="gap-2 min-w-32">
          <Save className="h-4 w-4" />
          {saving ? "جارِ الحفظ..." : "حفظ إعدادات الضريبة"}
        </Button>
      </div>
    </div>
  );
}
