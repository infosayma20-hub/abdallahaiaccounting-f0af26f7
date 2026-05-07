import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const InventorySettingsSection = ({ settings, onChange }: Props) => {
  return (
    <div className="p-6 space-y-8">
      {/* General */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          إعدادات عامة للمخزون
        </h3>
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
      </div>

      <Separator />

      {/* Alerts */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          التنبيهات والحدود
        </h3>
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
      </div>

      <Separator />

      {/* Barcode */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          الباركود والتعريف
        </h3>
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
      </div>

      <Separator />

      {/* Sales Reps (Van Sales) Stock Policy */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          سياسة المخزون لبورتال المندوبين (Van Sales)
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
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
      </div>
    </div>
  );
};

export default InventorySettingsSection;
