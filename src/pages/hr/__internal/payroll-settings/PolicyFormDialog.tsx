import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { usePayrollPolicies, type PayrollPolicy, type PolicyFormInput } from "@/hooks/hr/usePayrollPolicies";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  policy: PayrollPolicy | null;
}

const EMPTY: PolicyFormInput = {
  name: "",
  description: "",
  salary_basis: "monthly",
  month_days_mode: "fixed_26",
  month_days_custom: null,
  daily_work_hours: 8,
  overtime_multiplier: 1.5,
  overtime_after_hours: 8,
  absence_calculation: "daily_rate",
  late_calculation: "none",
  late_grace_minutes: 0,
  late_per_minute_rate: 0,
  allowances_attendance_linked: false,
  deductions_mode: "mixed",
  is_active: true,
  is_default: false,
  engine_preset: "standard",
};

export default function PolicyFormDialog({ open, onOpenChange, policy }: Props) {
  const { create, update } = usePayrollPolicies();
  const [form, setForm] = useState<PolicyFormInput>(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(policy ? { ...EMPTY, ...policy } : EMPTY);
    }
  }, [open, policy]);

  const set = <K extends keyof PolicyFormInput>(k: K, v: PolicyFormInput[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const submitting = create.isPending || update.isPending;

  const onSubmit = async () => {
    if (!form.name?.trim()) return;
    const payload: PolicyFormInput = {
      ...form,
      month_days_custom: form.month_days_mode === "custom" ? Number(form.month_days_custom || 0) : null,
      late_grace_minutes: form.late_calculation === "none" ? 0 : Number(form.late_grace_minutes || 0),
      late_per_minute_rate: form.late_calculation === "none" ? 0 : Number(form.late_per_minute_rate || 0),
    };
    if (policy) await update.mutateAsync({ ...payload, id: policy.id });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{policy ? "تعديل سياسة الرواتب" : "إنشاء سياسة رواتب جديدة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basic info */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">المعلومات الأساسية</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>اسم السياسة *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="مثال: سياسة الإداريين" />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={!!form.is_active} onCheckedChange={v => set("is_active", v)} />
                  نشطة
                </label>
              </div>
              <div className="md:col-span-2">
                <Label>الوصف</Label>
                <Textarea rows={2} value={form.description || ""} onChange={e => set("description", e.target.value)} />
              </div>
            </div>
          </section>

          {/* Salary basis */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">أساس الحساب</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>أساس الراتب</Label>
                <Select value={form.salary_basis} onValueChange={v => set("salary_basis", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="daily">يومي</SelectItem>
                    <SelectItem value="hourly">بالساعة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>أيام الشهر</Label>
                <Select value={form.month_days_mode} onValueChange={v => set("month_days_mode", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_30">30 يوم</SelectItem>
                    <SelectItem value="fixed_28">28 يوم</SelectItem>
                    <SelectItem value="fixed_26">26 يوم</SelectItem>
                    <SelectItem value="calendar">حسب التقويم</SelectItem>
                    <SelectItem value="custom">مخصص</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.month_days_mode === "custom" && (
                <div>
                  <Label>عدد الأيام المخصص</Label>
                  <Input type="number" step="0.5" value={form.month_days_custom ?? ""} onChange={e => set("month_days_custom", Number(e.target.value))} />
                </div>
              )}
              <div>
                <Label>ساعات العمل اليومية</Label>
                <Input type="number" step="0.5" value={form.daily_work_hours} onChange={e => set("daily_work_hours", Number(e.target.value))} />
              </div>
              <div>
                <Label>ساعات قبل الأوفر</Label>
                <Input type="number" step="0.5" value={form.overtime_after_hours ?? ""} onChange={e => set("overtime_after_hours", Number(e.target.value))} />
              </div>
              <div>
                <Label>مضاعف الأوفر تايم</Label>
                <Input type="number" step="0.1" value={form.overtime_multiplier} onChange={e => set("overtime_multiplier", Number(e.target.value))} />
              </div>
            </div>
          </section>

          {/* Absence */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">احتساب الغياب</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>طريقة احتساب الغياب</Label>
                <Select value={form.absence_calculation} onValueChange={v => set("absence_calculation", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون خصم</SelectItem>
                    <SelectItem value="daily_rate">حسب الراتب اليومي</SelectItem>
                    <SelectItem value="hourly_rate">حسب راتب الساعة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Late */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">احتساب التأخير</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>طريقة الاحتساب</Label>
                <Select value={form.late_calculation} onValueChange={v => set("late_calculation", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">لا يوجد</SelectItem>
                    <SelectItem value="per_minute">حسب الدقيقة</SelectItem>
                    <SelectItem value="per_hour">حسب الساعة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.late_calculation !== "none" && (
                <>
                  <div>
                    <Label>دقائق السماح</Label>
                    <Input type="number" value={form.late_grace_minutes ?? 0} onChange={e => set("late_grace_minutes", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>سعر الدقيقة (₪)</Label>
                    <Input type="number" step="0.01" value={form.late_per_minute_rate ?? 0} onChange={e => set("late_per_minute_rate", Number(e.target.value))} />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Deductions & allowances */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">البدلات والخصومات</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>وضع الخصومات</Label>
                <Select value={form.deductions_mode} onValueChange={v => set("deductions_mode", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي</SelectItem>
                    <SelectItem value="manual">يدوي</SelectItem>
                    <SelectItem value="mixed">مختلط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm pt-7">
                <Switch checked={!!form.allowances_attendance_linked} onCheckedChange={v => set("allowances_attendance_linked", v)} />
                ربط البدلات بالحضور
              </label>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>إلغاء</Button>
          <Button onClick={onSubmit} disabled={submitting || !form.name?.trim()} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {policy ? "حفظ التغييرات" : "إنشاء السياسة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
