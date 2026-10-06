import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, FileBarChart, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";

type Sys = "perpetual" | "periodic";
type Method = "moving_avg" | "weighted_avg_period" | "fifo";

const SYSTEMS: { value: Sys; title: string; desc: string }[] = [
  { value: "perpetual", title: "جرد مستمر (Perpetual)", desc: "المخزون وتكلفة المبيعات يتحدثان مع كل حركة شراء وبيع لحظيًا." },
  { value: "periodic", title: "جرد دوري (Periodic)", desc: "المشتريات تُسجل كمشتريات، وتكلفة المبيعات تُحسب آخر الفترة: أول المدة + المشتريات − آخر المدة." },
];

const METHODS: Record<Method, { title: string; desc: string; example: string }> = {
  moving_avg: {
    title: "المتوسط المتحرك (Moving W/A)",
    desc: "تكلفة الصنف تُعاد حسابها بعد كل شراء.",
    example: "شراء 10 بـ10 ثم 10 بـ20 ← التكلفة 15. بيع 15 ← تكلفة 225.",
  },
  weighted_avg_period: {
    title: "المتوسط المرجّح للفترة (W/A)",
    desc: "متوسط واحد للفترة كاملة يُحسب في تسوية آخر المدة.",
    example: "(أول المدة + كل مشتريات الشهر) ÷ مجموع الكميات.",
  },
  fifo: {
    title: "الوارد أولًا صادر أولًا (FIFO)",
    desc: "البيع يأخذ من أقدم دفعة بسعرها، وآخر المدة يُقيَّم بأحدث الأسعار.",
    example: "شراء 10 بـ10 ثم 10 بـ20. بيع 15 ← 10×10 + 5×20 = 200.",
  },
};

const allowed = (s: Sys): Method[] => (s === "perpetual" ? ["moving_avg", "fifo"] : ["weighted_avg_period", "fifo"]);

interface Props { settings: CompanySettings }

const InventoryCostingSection = ({ settings }: Props) => {
  const enabled = !!settings.costing_engine_enabled;
  const [sys, setSys] = useState<Sys>((settings.inventory_system as Sys) || "perpetual");
  const [method, setMethod] = useState<Method>((settings.inventory_valuation_method as Method) || "moving_avg");
  const [readiness, setReadiness] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<{ enabled: boolean; from?: string } | null>(null);

  const isOn = done?.enabled ?? enabled;
  const effectiveFrom = done?.from ?? settings.costing_effective_from;

  useEffect(() => {
    if (!allowed(sys).includes(method)) setMethod(allowed(sys)[0]);
  }, [sys]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOn) return;
    (supabase.rpc as any)("inventory_costing_readiness").then(({ data }: any) => setReadiness(data));
  }, [isOn]);

  const saveChoice = async () => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("set_inventory_costing_choice", { _system: sys, _method: method });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الاختيار (لم يُفعّل بعد)");
  };

  const activate = async () => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("initialize_inventory_costing", { _system: sys, _method: method });
    setBusy(false);
    setConfirm(false);
    if (error) return toast.error(error.message);
    setDone({ enabled: true, from: data?.effective_from });
    toast.success(`تم التفعيل: ${data?.opening_lines ?? 0} رصيد افتتاحي`);
  };

  return (
    <SettingsSection
      title="نظام الجرد وطريقة تقييم المخزون (IAS 2)"
      description="يحدد كيف تُحسب تكلفة الأصناف وتكلفة المبيعات وقيمة المخزون في التقارير."
    >
      <div dir="rtl" className="space-y-5">
        {isOn && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <Lock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">
                مفعّل: {SYSTEMS.find(s => s.value === sys)?.title} — {METHODS[method].title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ساري منذ {effectiveFrom ? new Date(effectiveFrom).toLocaleString("ar") : "—"}. الطريقة مقفلة لحماية التكلفة التاريخية؛
                تغييرها يتم فقط عبر معالج تغيير الطريقة مع قيد تسوية موثّق.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-semibold">1) نظام الجرد</Label>
          <RadioGroup dir="rtl" value={sys} onValueChange={v => setSys(v as Sys)} disabled={isOn} className="grid gap-2 md:grid-cols-2">
            {SYSTEMS.map(s => (
              <label key={s.value} className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${sys === s.value ? "border-primary bg-primary/5" : "border-border"} ${isOn ? "opacity-70 cursor-not-allowed" : ""}`}>
                <RadioGroupItem value={s.value} className="mt-1" />
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">2) طريقة التقييم</Label>
          <RadioGroup dir="rtl" value={method} onValueChange={v => setMethod(v as Method)} disabled={isOn} className="grid gap-2 md:grid-cols-2">
            {allowed(sys).map(m => (
              <label key={m} className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${method === m ? "border-primary bg-primary/5" : "border-border"} ${isOn ? "opacity-70 cursor-not-allowed" : ""}`}>
                <RadioGroupItem value={m} className="mt-1" />
                <div>
                  <p className="text-sm font-medium">{METHODS[m].title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{METHODS[m].desc}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">مثال: {METHODS[m].example}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
          <p className="text-[11px] text-muted-foreground">
            LIFO غير متاحة لأنها ممنوعة في المعايير الدولية (IAS 2). الجرد المستمر لا يُستخدم مع المتوسط المرجّح للفترة، والدوري لا يُستخدم مع المتوسط المتحرك.
          </p>
        </div>

        {!isOn && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">3) التفعيل</p>
            {readiness ? (
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>أرصدة أصناف بكميات موجبة: {readiness.positive_lines}</li>
                <li>قيمة افتتاحية تقديرية (الكمية × آخر سعر شراء): {Number(readiness.opening_value || 0).toLocaleString("ar", { maximumFractionDigits: 2 })} ₪</li>
                <li className={readiness.zero_cost_lines > 0 ? "text-destructive" : ""}>
                  أصناف لها كمية بدون سعر شراء: {readiness.zero_cost_lines}
                </li>
                <li className={readiness.negative_lines > 0 ? "text-destructive" : ""}>
                  أرصدة سالبة: {readiness.negative_lines}
                </li>
              </ul>
            ) : <p className="text-xs text-muted-foreground">جاري فحص الجاهزية…</p>}
            {(readiness?.zero_cost_lines > 0 || readiness?.negative_lines > 0) && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> يُنصح بمعالجة الأصناف بلا سعر والأرصدة السالبة قبل التفعيل.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              التفعيل يبني رصيدًا افتتاحيًا للتكلفة من اليوم، ولا يغيّر أي فاتورة أو قيد سابق. بعده تُقفل الطريقة.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={saveChoice} disabled={busy}>حفظ الاختيار فقط</Button>
              <Button size="sm" onClick={() => setConfirm(true)} disabled={busy}>تفعيل محرك التكلفة</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link to="/inventory/valuation" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
            <FileBarChart className="h-4 w-4" /> تقرير تقييم المخزون
          </Link>
          {sys === "periodic" && (
            <Link to="/periodic-inventory" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <CheckCircle2 className="h-4 w-4" /> جرد وتسوية آخر المدة
            </Link>
          )}
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تفعيل محرك التكلفة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم اعتماد «{SYSTEMS.find(s => s.value === sys)?.title}» مع «{METHODS[method].title}» من الآن،
              وبناء رصيد افتتاحي لكل صنف ومستودع. لا يمكن تغيير الطريقة لاحقًا إلا بقيد تسوية موثّق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={activate} disabled={busy}>تفعيل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
};

export default InventoryCostingSection;
