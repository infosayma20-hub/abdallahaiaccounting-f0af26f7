import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import KitchenStationsManager from "./KitchenStationsManager";
import NetworkPrintersManager from "./NetworkPrintersManager";
import DeliveryAppsManager from "./DeliveryAppsManager";
import KdsDisplaySection from "./KdsDisplaySection";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId(data || user.id);
    });
  }, [user?.id]);

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
      {/* Onboarding shortcut */}
      <button
        type="button"
        onClick={() => navigate("/onboarding/new-device")}
        className="w-full rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 text-right hover:bg-primary/10 transition-colors"
      >
        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">معالج تجهيز جهاز نقطة بيع جديد</div>
          <div className="text-[11px] text-muted-foreground">يربط الجهاز بفرع ومحطة وصندوق، ويعرّف الطابعات في أقل من 10 دقائق.</div>
        </div>
        <span className="text-xs text-primary shrink-0">فتح المعالج ←</span>
      </button>

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
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <span className="text-sm font-medium">اختيار الصندوق إلزامي قبل فتح الوردية</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">عند التفعيل، لن يتمكن الكاشير من فتح وردية دون اختيار صندوق</p>
            </div>
            <Switch checked={settings.pos_require_cash_box} onCheckedChange={v => onChange({ pos_require_cash_box: v })} />
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
          <div className="space-y-2">
            <Label>ساعة قطع اليوم المحاسبي</Label>
            <Select value={String(settings.pos_day_cutoff_hour)} onValueChange={v => onChange({ pos_day_cutoff_hour: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0,1,2,3,4,5,6,7,8].map(h => (
                  <SelectItem key={h} value={String(h)}>{h === 0 ? "منتصف الليل (12:00 AM)" : `${h}:00 صباحاً`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              الورديات التي تُفتح قبل هذه الساعة تُسجَّل محاسبياً على اليوم السابق
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between p-3 bg-muted/40 rounded-lg">
          <div>
            <span className="text-sm font-medium">السماح بنقل الطلب بين الموظفين</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">يتيح نقل فاتورة من كاشير لآخر في أوقات الذروة</p>
          </div>
          <Switch checked={settings.pos_allow_order_transfer} onCheckedChange={v => onChange({ pos_allow_order_transfer: v })} />
        </div>
      </div>

      <Separator />

      {/* Receipt - Customer */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          وصل الزبون (الفاتورة)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>حجم ورقة وصل الزبون</Label>
            <Select value={settings.pos_receipt_size} onValueChange={v => onChange({ pos_receipt_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80mm">80mm (حرارية عريضة)</SelectItem>
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

      {/* Kitchen Tickets */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          تذاكر المطبخ / المحطات
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          تذاكر المحطات أصغر من وصل الزبون وتحتوي فقط على اسم المحطة ورقم الطلب والأصناف. يتم إرسالها مباشرة لطابعة المحطة المربوطة.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>حجم ورقة تذكرة المحطة</Label>
            <Select value={settings.pos_kitchen_ticket_size} onValueChange={v => onChange({ pos_kitchen_ticket_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm (مربعة صغيرة - موصى بها)</SelectItem>
                <SelectItem value="80mm">80mm (عريضة)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <span className="text-sm font-medium">طباعة تلقائية لتذاكر المطبخ</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">عند التفعيل، تُرسل التذاكر مباشرة للطابعة بدون معاينة</p>
            </div>
            <Switch checked={settings.pos_kitchen_auto_print} onCheckedChange={v => onChange({ pos_kitchen_auto_print: v })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Return Policy */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          سياسة المرتجعات
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <span className="text-sm">إظهار سياسة المرتجعات على الإيصال</span>
            <Switch checked={settings.pos_show_return_policy} onCheckedChange={v => onChange({ pos_show_return_policy: v })} />
          </div>
          {settings.pos_show_return_policy && (
            <div className="space-y-2">
              <Label>مدة المرتجعات (أيام)</Label>
              <Input type="number" min={0} value={settings.pos_return_policy_days} onChange={e => onChange({ pos_return_policy_days: Number(e.target.value) })} />
            </div>
          )}
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

      <Separator />

      {/* Accounting Impact */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-destructive rounded-full" />
          التأثير المحاسبي
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          تحكّم في تأثير نقطة البيع على القيود المحاسبية والمخزون. تعطيل هذه الخيارات يعني أن عمليات البيع لن تولّد قيوداً تلقائية.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
            <div>
              <span className="text-sm font-medium">عدم توليد قيد تكلفة البضاعة المباعة (COGS)</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">عند التفعيل، لن يتم إنشاء قيد تكلفة المبيعات تلقائياً عند إتمام الطلب</p>
            </div>
            <Switch checked={settings.pos_disable_cogs} onCheckedChange={v => onChange({ pos_disable_cogs: v })} />
          </div>
          <div className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
            <div>
              <span className="text-sm font-medium">عدم خصم الكميات من المخزون</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">عند التفعيل، لن يتم تقليل كمية المنتجات تلقائياً عند البيع</p>
            </div>
            <Switch checked={settings.pos_disable_stock_deduction} onCheckedChange={v => onChange({ pos_disable_stock_deduction: v })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Device Fingerprint */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          بصمة الجهاز
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <span className="text-sm font-medium">تفعيل بصمة الجهاز</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">عند التفعيل، يُسمح بالدخول فقط من الأجهزة المسجلة في إدارة المستخدمين</p>
            </div>
            <Switch checked={settings.pos_require_device_fingerprint} onCheckedChange={v => onChange({ pos_require_device_fingerprint: v })} />
          </div>
        </div>
      </div>

      {/* Kitchen Stations */}
      <KitchenStationsManager />

      <Separator />

      {/* Network Printers */}
      <NetworkPrintersManager />

      <Separator />

      {/* Delivery Apps */}
      {dataOwnerId && <DeliveryAppsManager userId={dataOwnerId} />}

      <Separator />

      {/* KDS & Customer Display */}
      <KdsDisplaySection settings={settings} onChange={onChange} ownerId={dataOwnerId} />
    </div>
  );
};

export default POSSettingsSection;
