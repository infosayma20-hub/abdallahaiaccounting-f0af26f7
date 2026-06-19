/**
 * AddWidgetDialog — اختيار نوع العنصر وإعداده قبل الإضافة.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KPI_METRICS } from "./KpiWidget";
import type { WidgetType, DashboardWidget } from "@/hooks/useCustomDashboards";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { TrendingUp, FileBarChart, Type, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DashboardWidget | null;
  onSave: (w: { widget_type: WidgetType; title?: string | null; config: any; width?: number; height?: number }) => void;
}

export default function AddWidgetDialog({ open, onOpenChange, initial, onSave }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<WidgetType>("kpi");
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<any>({});
  const [reports, setReports] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setType(initial.widget_type);
      setTitle(initial.title || "");
      setConfig(initial.config || {});
    } else {
      setType("kpi");
      setTitle("");
      setConfig({ metric: "sales_total", period: "month" });
    }
    if (user) {
      supabase.from("custom_reports").select("id, name").eq("user_id", dataOwnerId!).order("name").then(({ data }) => {
        setReports((data as any) || []);
      });
    }
  }, [open, initial, user]);

  const handleTypeChange = (t: WidgetType) => {
    setType(t);
    if (t === "kpi") setConfig({ metric: "sales_total", period: "month" });
    else if (t === "report") setConfig({ reportId: "", mode: "kpi" });
    else if (t === "text") setConfig({ text: "ملاحظة", align: "right", size: "md" });
    else if (t === "insights") setConfig({ period: "month" });
  };

  const save = () => {
    const defaults: Record<WidgetType, { w: number; h: number }> = {
      kpi: { w: 3, h: 3 }, report: { w: 6, h: 5 }, text: { w: 4, h: 2 },
      chart: { w: 6, h: 5 }, insights: { w: 4, h: 5 },
    };
    const d = defaults[type];
    onSave({ widget_type: type, title: title.trim() || null, config, width: d.w, height: d.h });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "تعديل العنصر" : "إضافة عنصر جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {!initial && (
            <div>
              <Label className="text-xs mb-2 block">نوع العنصر</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "kpi" as WidgetType, label: "مؤشر KPI", icon: TrendingUp },
                  { v: "report" as WidgetType, label: "تقرير محفوظ", icon: FileBarChart },
                  { v: "insights" as WidgetType, label: "رؤى ذكية AI", icon: Sparkles },
                  { v: "text" as WidgetType, label: "نص/ملاحظة", icon: Type },
                ].map(o => (
                  <button
                    key={o.v}
                    onClick={() => handleTypeChange(o.v)}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${type === o.v ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
                  >
                    <o.icon className={`h-4 w-4 ${type === o.v ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-[11px] font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">العنوان (اختياري)</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان مخصص" />
          </div>

          {type === "kpi" && (
            <>
              <div>
                <Label className="text-xs">المؤشر</Label>
                <Select value={config.metric} onValueChange={v => setConfig({ ...config, metric: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KPI_METRICS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">الفترة الزمنية</Label>
                <Select value={config.period} onValueChange={v => setConfig({ ...config, period: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">اليوم</SelectItem>
                    <SelectItem value="week">آخر 7 أيام</SelectItem>
                    <SelectItem value="month">هذا الشهر</SelectItem>
                    <SelectItem value="year">هذه السنة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "report" && (
            <>
              <div>
                <Label className="text-xs">التقرير المحفوظ</Label>
                <Select value={config.reportId} onValueChange={v => setConfig({ ...config, reportId: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر تقرير..." /></SelectTrigger>
                  <SelectContent>
                    {reports.length === 0 ? (
                      <SelectItem value="__none" disabled>لا توجد تقارير محفوظة</SelectItem>
                    ) : reports.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">طريقة العرض</Label>
                <Select value={config.mode} onValueChange={v => setConfig({ ...config, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kpi">ملخص KPI</SelectItem>
                    <SelectItem value="chart">رسم بياني</SelectItem>
                    <SelectItem value="table">جدول مصغر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "text" && (
            <>
              <div>
                <Label className="text-xs">النص</Label>
                <Textarea value={config.text || ""} onChange={e => setConfig({ ...config, text: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">المحاذاة</Label>
                  <Select value={config.align || "right"} onValueChange={v => setConfig({ ...config, align: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="right">يمين</SelectItem>
                      <SelectItem value="center">وسط</SelectItem>
                      <SelectItem value="left">يسار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">الحجم</Label>
                  <Select value={config.size || "md"} onValueChange={v => setConfig({ ...config, size: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sm">صغير</SelectItem>
                      <SelectItem value="md">متوسط</SelectItem>
                      <SelectItem value="lg">كبير</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {type === "insights" && (
            <div>
              <Label className="text-xs">الفترة الزمنية</Label>
              <Select value={config.period || "month"} onValueChange={v => setConfig({ ...config, period: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="week">آخر 7 أيام</SelectItem>
                  <SelectItem value="month">هذا الشهر</SelectItem>
                  <SelectItem value="year">هذه السنة</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-2">يستخدم الذكاء الاصطناعي لتحليل بياناتك المالية وعرض ملاحظات تشغيلية.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
