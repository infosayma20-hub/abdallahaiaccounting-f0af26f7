import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import { Link } from "react-router-dom";
import { FileBarChart } from "lucide-react";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const InventorySettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="space-y-4">
      <SettingsSection
        title="نظام الجرد وبضاعة آخر المدة (IAS 2)"
        description="اختر بين الجرد الدائم (احتساب COGS فوري مع كل بيع) والجرد الدوري (تسوية بضاعة آخر المدة في نهاية الفترة). يظهر في قائمة الدخل والميزانية العمومية حسب الاختيار."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
            <div>
              <p className="font-medium text-sm">تفعيل نظام الجرد الدوري</p>
              <p className="text-xs text-muted-foreground mt-1">
                عند التفعيل: تُضاف سطور «بضاعة أول المدة» و«بضاعة آخر المدة» في قائمة الدخل،
                ويظهر المخزون كأصل في الميزانية بناءً على قيود التسوية.
              </p>
            </div>
            <Switch
              checked={settings.periodic_inventory_enabled ?? false}
              onCheckedChange={v => onChange({
                periodic_inventory_enabled: v,
                inventory_system: v ? "periodic" : "perpetual",
              })}
            />
          </div>

          {settings.periodic_inventory_enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>طريقة تقييم المخزون للإفصاح (IAS 2)</Label>
                  <Select
                    value={settings.periodic_disclosure_method || "weighted_avg"}
                    onValueChange={v => onChange({ periodic_disclosure_method: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weighted_avg">المتوسط المرجّح</SelectItem>
                      <SelectItem value="fifo">الوارد أولاً صادر أولاً (FIFO)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    يظهر هذا في تذييل قائمة الدخل كإفصاح إلزامي.
                  </p>
                </div>
                <div className="flex items-end">
                  <Link
                    to="/periodic-inventory"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                  >
                    <FileBarChart className="h-4 w-4" />
                    الذهاب إلى شاشة جرد آخر المدة
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="إعدادات عامة للمخزون" description="طريقة احتساب التكلفة ووحدة القياس الافتراضية.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>طريقة التكلفة الافتراضية</Label>
            <Select value={settings.inventory_costing_method || "weighted_avg"} onValueChange={v => onChange({ inventory_costing_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weighted_avg">المتوسط المرجح</SelectItem>
                <SelectItem value="fifo">الوارد أولاً صادر أولاً (FIFO)</SelectItem>
                <SelectItem value="lifo">الوارد أخيراً صادر أولاً (LIFO)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>وحدة القياس الافتراضية</Label>
            <Select value={settings.inventory_default_unit || "piece"} onValueChange={v => onChange({ inventory_default_unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="piece">قطعة</SelectItem>
                <SelectItem value="kg">كيلوغرام</SelectItem>
                <SelectItem value="liter">لتر</SelectItem>
                <SelectItem value="meter">متر</SelectItem>
                <SelectItem value="box">صندوق</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="التنبيهات والحدود" description="تنبيهات نفاد المخزون وانتهاء الصلاحية.">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تنبيه الحد الأدنى للمخزون</p>
              <p className="text-xs text-muted-foreground">تنبيه عند وصول المنتج للحد الأدنى</p>
            </div>
            <Switch checked={settings.inventory_low_stock_alert ?? true} onCheckedChange={v => onChange({ inventory_low_stock_alert: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الحد الأدنى الافتراضي (كمية)</Label>
              <Input type="number" value={settings.inventory_default_min_qty ?? 5} onChange={e => onChange({ inventory_default_min_qty: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>الحد الأقصى الافتراضي (كمية)</Label>
              <Input type="number" value={settings.inventory_default_max_qty ?? 1000} onChange={e => onChange({ inventory_default_max_qty: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">تنبيه انتهاء الصلاحية</p>
              <p className="text-xs text-muted-foreground">تنبيه قبل انتهاء صلاحية المنتجات</p>
            </div>
            <Switch checked={settings.inventory_expiry_alert ?? false} onCheckedChange={v => onChange({ inventory_expiry_alert: v })} />
          </div>
          {(settings.inventory_expiry_alert) && (
            <div className="space-y-2 max-w-xs pr-4">
              <Label>أيام التنبيه قبل انتهاء الصلاحية</Label>
              <Input type="number" value={settings.inventory_expiry_days ?? 30} onChange={e => onChange({ inventory_expiry_days: Number(e.target.value) })} />
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="الباركود والتعريف" description="توليد الباركود وقواعد التعريف.">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">توليد باركود تلقائي للمنتجات الجديدة</span>
            <Switch checked={settings.inventory_auto_barcode ?? true} onCheckedChange={v => onChange({ inventory_auto_barcode: v })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">السماح بمنتجات بدون باركود</span>
            <Switch checked={settings.inventory_allow_no_barcode ?? true} onCheckedChange={v => onChange({ inventory_allow_no_barcode: v })} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="سياسة المخزون لبورتال المندوبين (Van Sales)"
        description="يخص بورتال المندوب فقط ولا يؤثر على POS أو فواتير المبيعات."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-lg">
            <div>
              <p className="font-medium text-sm">السماح بالبيع بالسالب للمندوبين</p>
              <p className="text-xs text-muted-foreground mt-1">
                عند التفعيل: لن يُمنع المندوب من حفظ الطلب إذا كانت الكمية المطلوبة أكبر من المتوفر، وسيظهر تنبيه فقط.
                هذا الإعداد يخص بورتال المندوب فقط ولا يؤثر على نقاط البيع (POS) ولا على فواتير المبيعات الرئيسية.
              </p>
            </div>
            <Switch
              checked={settings.rep_allow_negative_stock ?? false}
              onCheckedChange={v => onChange({ rep_allow_negative_stock: v })}
            />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

export default InventorySettingsSection;
