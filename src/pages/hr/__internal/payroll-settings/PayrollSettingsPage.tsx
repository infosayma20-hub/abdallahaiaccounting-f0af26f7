/**
 * Payroll Settings UI (S2-A.3 — Internal/Admin only, READ-ONLY engine)
 *
 * Route: /hr/__payroll-settings
 *
 * Strict scope:
 *   - Manage hr_payroll_policies (CRUD)
 *   - Manage hr_payroll_components per policy (CRUD)
 *   - Assign employees.payroll_policy_id + payroll_overrides
 *   - Live preview of Standard preset for any employee + month
 *
 * EXPLICITLY NOT IN SCOPE:
 *   - PayrollPage.tsx is NOT touched
 *   - employee_payroll table is NEVER written
 *   - No formula evaluation (calculation_type='formula' shown disabled)
 *
 * Linked from nowhere. Admin-only. Internal tooling.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Star, AlertTriangle, Info, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  calculateStandardPreset,
  type StandardComponent,
} from "@/lib/payroll-engine/presets/standard";
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPolicy,
} from "@/lib/payroll-engine/types";

// ─────────────────────────── Types ────────────────────────────────

interface Policy {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  salary_basis: "monthly" | "daily" | "hourly";
  month_days_mode: "fixed_26" | "fixed_28" | "fixed_30" | "actual" | "custom";
  month_days_custom: number | null;
  daily_work_hours: number;
  overtime_multiplier: number;
  overtime_after_hours: number;
  absence_calculation: string;
  late_calculation: string;
  late_grace_minutes: number;
  late_per_minute_rate: number;
  allowances_attendance_linked: boolean;
  deductions_mode: string;
  is_active: boolean;
  is_default: boolean;
  engine_preset: string;
}

interface ComponentRow {
  id: string;
  company_id: string;
  policy_id: string;
  code: string;
  name_ar: string | null;
  name_en: string | null;
  kind: "allowance" | "deduction";
  calculation_type: string;
  value: number;
  formula_expression: string | null;
  is_taxable: boolean;
  is_attendance_linked: boolean;
  affects_eos: boolean;
  is_active: boolean;
  sort_order: number;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  base_salary: number;
  hourly_rate: number;
  payroll_policy_id: string | null;
  payroll_overrides: Record<string, number> | null;
}

// ─────────────────────────── Defaults ────────────────────────────

const blankPolicy: Omit<Policy, "id" | "company_id"> = {
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

const blankComponent: Omit<ComponentRow, "id" | "company_id" | "policy_id"> = {
  code: "",
  name_ar: "",
  name_en: "",
  kind: "allowance",
  calculation_type: "fixed_amount",
  value: 0,
  formula_expression: null,
  is_taxable: false,
  is_attendance_linked: false,
  affects_eos: false,
  is_active: true,
  sort_order: 0,
};

// ────────────────────────── Page ─────────────────────────────────

export default function PayrollSettingsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">إعدادات الرواتب (Standard Preset)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تعريف السياسات والمكوّنات وملفات الموظفين. هذه الإعدادات Read-only للمحرك حالياً —
            لا تربط بـ شاشة الرواتب الإنتاجية ولا تكتب في <code>employee_payroll</code>.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Info className="h-3 w-3" />
          S2-A.3 · Internal · Admin
        </Badge>
      </div>

      <Tabs defaultValue="policies" className="w-full">
        <TabsList>
          <TabsTrigger value="policies">السياسات</TabsTrigger>
          <TabsTrigger value="components">المكوّنات</TabsTrigger>
          <TabsTrigger value="employees">ملفات الموظفين + معاينة</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="components" className="mt-4">
          <ComponentsTab />
        </TabsContent>
        <TabsContent value="employees" className="mt-4">
          <EmployeesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────── Policies Tab ─────────────────────────

function PoliciesTab() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Policy | null>(null);
  const [open, setOpen] = useState(false);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["payroll-policies", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("*")
        .eq("company_id", company.id)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Policy[];
    },
    enabled: !!company.id,
  });

  const upsertMut = useMutation({
    mutationFn: async (p: Partial<Policy>) => {
      const payload = { ...p, company_id: company.id };
      const { error } = p.id
        ? await supabase.from("hr_payroll_policies").update(payload).eq("id", p.id)
        : await supabase.from("hr_payroll_policies").insert([payload as any]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-policies", company.id] });
      toast.success("تم الحفظ");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الحفظ"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_payroll_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-policies", company.id] });
      toast.success("تم الحذف");
    },
    onError: (e: any) => toast.error(e.message ?? "تعذّر الحذف — قد تكون مرتبطة بمكوّنات/موظفين"),
  });

  const setDefaultMut = useMutation({
    mutationFn: async (id: string) => {
      // Single-default invariant handled client-side (no DB constraint)
      await supabase
        .from("hr_payroll_policies")
        .update({ is_default: false })
        .eq("company_id", company.id);
      const { error } = await supabase
        .from("hr_payroll_policies")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-policies", company.id] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>سياسات الرواتب</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ ...blankPolicy, id: "", company_id: company.id } as Policy)}>
              <Plus className="h-4 w-4 ms-1" /> سياسة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "تعديل سياسة" : "سياسة جديدة"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <PolicyForm
                value={editing}
                onChange={setEditing}
                onSubmit={() => {
                  const { id, ...rest } = editing;
                  upsertMut.mutate(id ? editing : (rest as any));
                }}
                saving={upsertMut.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            لا توجد سياسات. أنشئ سياسة لتبدأ.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الأساس</TableHead>
                <TableHead>أيام الشهر</TableHead>
                <TableHead>OT ×</TableHead>
                <TableHead>افتراضية</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {!p.is_active && <Badge variant="secondary" className="me-2">معطّلة</Badge>}
                  </TableCell>
                  <TableCell>{p.salary_basis}</TableCell>
                  <TableCell>{p.month_days_mode}{p.month_days_mode === "custom" ? ` (${p.month_days_custom})` : ""}</TableCell>
                  <TableCell>{p.overtime_multiplier}</TableCell>
                  <TableCell>
                    {p.is_default ? (
                      <Badge className="gap-1"><Star className="h-3 w-3" /> نعم</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setDefaultMut.mutate(p.id)}>
                        تعيين كافتراضية
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-end space-x-1 space-x-reverse">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`حذف السياسة "${p.name}"؟`)) deleteMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyForm({
  value,
  onChange,
  onSubmit,
  saving,
}: {
  value: Policy;
  onChange: (p: Policy) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>الاسم</Label>
        <Input value={value.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="col-span-2">
        <Label>الوصف</Label>
        <Textarea value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
      </div>
      <div>
        <Label>أساس الراتب</Label>
        <Select value={value.salary_basis} onValueChange={(v: any) => set("salary_basis", v)}>
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
        <Select value={value.month_days_mode} onValueChange={(v: any) => set("month_days_mode", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed_26">ثابت 26</SelectItem>
            <SelectItem value="fixed_28">ثابت 28</SelectItem>
            <SelectItem value="fixed_30">ثابت 30</SelectItem>
            <SelectItem value="actual">الفعلي</SelectItem>
            <SelectItem value="custom">مخصّص</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.month_days_mode === "custom" && (
        <div>
          <Label>عدد الأيام المخصّص</Label>
          <Input type="number" value={value.month_days_custom ?? 0}
            onChange={(e) => set("month_days_custom", Number(e.target.value))} />
        </div>
      )}
      <div>
        <Label>ساعات العمل اليومية</Label>
        <Input type="number" step="0.5" value={value.daily_work_hours}
          onChange={(e) => set("daily_work_hours", Number(e.target.value))} />
      </div>
      <div>
        <Label>معامل الإضافي ×</Label>
        <Input type="number" step="0.1" value={value.overtime_multiplier}
          onChange={(e) => set("overtime_multiplier", Number(e.target.value))} />
      </div>
      <div>
        <Label>إضافي بعد (ساعة)</Label>
        <Input type="number" value={value.overtime_after_hours}
          onChange={(e) => set("overtime_after_hours", Number(e.target.value))} />
      </div>
      <div>
        <Label>حساب الغياب</Label>
        <Select value={value.absence_calculation} onValueChange={(v) => set("absence_calculation", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily_rate">معدل يومي</SelectItem>
            <SelectItem value="hourly_rate">معدل بالساعة</SelectItem>
            <SelectItem value="none">لا يحتسب</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>حساب التأخير</Label>
        <Select value={value.late_calculation} onValueChange={(v) => set("late_calculation", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">لا يحتسب</SelectItem>
            <SelectItem value="per_minute">لكل دقيقة</SelectItem>
            <SelectItem value="hourly_proration">احتساب بالساعة</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>دقائق سماح التأخير</Label>
        <Input type="number" value={value.late_grace_minutes}
          onChange={(e) => set("late_grace_minutes", Number(e.target.value))} />
      </div>
      <div>
        <Label>سعر دقيقة التأخير</Label>
        <Input type="number" step="0.01" value={value.late_per_minute_rate}
          onChange={(e) => set("late_per_minute_rate", Number(e.target.value))} />
      </div>
      <div className="flex items-center gap-2 col-span-2">
        <Switch checked={value.allowances_attendance_linked}
          onCheckedChange={(v) => set("allowances_attendance_linked", v)} />
        <Label>ربط البدلات بالحضور</Label>
      </div>
      <div className="flex items-center gap-2 col-span-2">
        <Switch checked={value.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label>مفعّلة</Label>
      </div>

      <DialogFooter className="col-span-2">
        <Button onClick={onSubmit} disabled={saving || !value.name.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin ms-1" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

// ────────────────────────── Components Tab ───────────────────────

function ComponentsTab() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ComponentRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: policies = [] } = useQuery({
    queryKey: ["payroll-policies", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("id,name,is_default")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; is_default: boolean }[];
    },
    enabled: !!company.id,
  });

  const effectivePolicyId = policyId ?? policies[0]?.id ?? null;

  const { data: components = [], isLoading } = useQuery({
    queryKey: ["payroll-components", effectivePolicyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_components")
        .select("*")
        .eq("policy_id", effectivePolicyId!)
        .order("kind")
        .order("sort_order");
      if (error) throw error;
      return data as ComponentRow[];
    },
    enabled: !!effectivePolicyId,
  });

  const upsertMut = useMutation({
    mutationFn: async (c: Partial<ComponentRow>) => {
      const payload = { ...c, company_id: company.id, policy_id: effectivePolicyId };
      const { error } = c.id
        ? await supabase.from("hr_payroll_components").update(payload).eq("id", c.id)
        : await supabase.from("hr_payroll_components").insert([payload as any]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-components", effectivePolicyId] });
      toast.success("تم الحفظ");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الحفظ"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_payroll_components").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-components", effectivePolicyId] });
      toast.success("تم الحذف");
    },
  });

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          أنشئ سياسة من تبويب "السياسات" أولاً ثم عرّف مكوّناتها.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CardTitle>المكوّنات</CardTitle>
          <Select value={effectivePolicyId ?? ""} onValueChange={setPolicyId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="اختر سياسة" /></SelectTrigger>
            <SelectContent>
              {policies.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.is_default ? " ★" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ ...blankComponent, id: "", company_id: company.id, policy_id: effectivePolicyId! } as ComponentRow)}>
              <Plus className="h-4 w-4 ms-1" /> مكوّن جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "تعديل مكوّن" : "مكوّن جديد"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <ComponentForm
                value={editing}
                onChange={setEditing}
                onSubmit={() => {
                  const { id, ...rest } = editing;
                  upsertMut.mutate(id ? editing : (rest as any));
                }}
                saving={upsertMut.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : components.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            لا مكوّنات لهذه السياسة بعد.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>طريقة الحساب</TableHead>
                <TableHead>القيمة</TableHead>
                <TableHead>مرتبط بالحضور</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c) => {
                const unsupported = c.calculation_type === "formula";
                return (
                  <TableRow key={c.id} className={unsupported ? "bg-yellow-500/5" : ""}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>{c.name_ar || c.name_en}</TableCell>
                    <TableCell>
                      <Badge variant={c.kind === "allowance" ? "default" : "destructive"}>
                        {c.kind === "allowance" ? "بدل" : "خصم"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.calculation_type}
                      {unsupported && (
                        <Badge variant="outline" className="ms-1 gap-1">
                          <AlertTriangle className="h-3 w-3" /> غير مدعوم
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{c.value}</TableCell>
                    <TableCell>{c.is_attendance_linked ? "نعم" : "—"}</TableCell>
                    <TableCell>{c.is_active ? "مفعّل" : "معطّل"}</TableCell>
                    <TableCell className="text-end space-x-1 space-x-reverse">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm(`حذف "${c.code}"؟`)) deleteMut.mutate(c.id);
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ComponentForm({
  value,
  onChange,
  onSubmit,
  saving,
}: {
  value: ComponentRow;
  onChange: (c: ComponentRow) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof ComponentRow>(k: K, v: ComponentRow[K]) => onChange({ ...value, [k]: v });
  const isFormula = value.calculation_type === "formula";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>الكود</Label>
        <Input value={value.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
      </div>
      <div>
        <Label>النوع</Label>
        <Select value={value.kind} onValueChange={(v: any) => set("kind", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="allowance">بدل</SelectItem>
            <SelectItem value="deduction">خصم</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>الاسم (عربي)</Label>
        <Input value={value.name_ar ?? ""} onChange={(e) => set("name_ar", e.target.value)} />
      </div>
      <div>
        <Label>الاسم (إنجليزي)</Label>
        <Input value={value.name_en ?? ""} onChange={(e) => set("name_en", e.target.value)} />
      </div>
      <div>
        <Label>طريقة الحساب</Label>
        <Select value={value.calculation_type} onValueChange={(v) => set("calculation_type", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed_amount">مبلغ ثابت</SelectItem>
            <SelectItem value="percent_of_basic">% من الأساسي</SelectItem>
            <SelectItem value="percent_of_gross">% من الإجمالي</SelectItem>
            <SelectItem value="per_day">عن كل يوم</SelectItem>
            <SelectItem value="per_hour">عن كل ساعة</SelectItem>
            <SelectItem value="formula" disabled>صيغة (غير مدعومة)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>القيمة</Label>
        <Input type="number" step="0.01" value={value.value}
          onChange={(e) => set("value", Number(e.target.value))} disabled={isFormula} />
      </div>
      {isFormula && (
        <div className="col-span-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
          <AlertTriangle className="inline h-3 w-3 me-1" />
          صيغ التعبيرات غير مدعومة في هذا الإصدار. سيُحتسب هذا المكوّن بصفر مع تحذير
          <code className="ms-1">formula_not_supported_yet</code>.
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch checked={value.is_attendance_linked}
          onCheckedChange={(v) => set("is_attendance_linked", v)} />
        <Label>مرتبط بالحضور</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={value.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label>مفعّل</Label>
      </div>
      <div>
        <Label>الترتيب</Label>
        <Input type="number" value={value.sort_order}
          onChange={(e) => set("sort_order", Number(e.target.value))} />
      </div>

      <DialogFooter className="col-span-2">
        <Button onClick={onSubmit} disabled={saving || !value.code.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin ms-1" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

// ────────────────────────── Employees Tab + Preview ──────────────

function EmployeesTab() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [workingDays, setWorkingDays] = useState(26);
  const [workingHours, setWorkingHours] = useState(208);
  const [overtimeHours, setOvertimeHours] = useState(0);
  // When true, working_hours is auto-derived from working_days × policy.daily_work_hours
  const [autoHours, setAutoHours] = useState(true);

  const { data: employees = [] } = useQuery({
    queryKey: ["payroll-settings-employees", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,full_name,base_salary,hourly_rate,payroll_policy_id,payroll_overrides")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data as EmployeeRow[];
    },
    enabled: !!company.id,
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["payroll-policies", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("*")
        .eq("company_id", company.id)
        .eq("is_active", true);
      if (error) throw error;
      return data as Policy[];
    },
    enabled: !!company.id,
  });

  const assignMut = useMutation({
    mutationFn: async ({ id, payroll_policy_id }: { id: string; payroll_policy_id: string | null }) => {
      const { error } = await supabase
        .from("employees")
        .update({ payroll_policy_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-settings-employees", company.id] });
      toast.success("تم تحديث السياسة");
    },
    onError: (e: any) => toast.error(e.message ?? "فشل التحديث"),
  });

  const overrideMut = useMutation({
    mutationFn: async ({ id, payroll_overrides }: { id: string; payroll_overrides: Record<string, number> }) => {
      const { error } = await supabase
        .from("employees")
        .update({ payroll_overrides })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-settings-employees", company.id] });
      toast.success("تم حفظ القيم الخاصة");
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الحفظ"),
  });

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId]
  );
  const policy = useMemo(
    () => policies.find((p) => p.id === selected?.payroll_policy_id) ?? null,
    [policies, selected]
  );

  const { data: previewComponents = [] } = useQuery({
    queryKey: ["payroll-components", policy?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_components")
        .select("*")
        .eq("policy_id", policy!.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as ComponentRow[];
    },
    enabled: !!policy?.id,
  });

  const previewResult = useMemo(() => {
    if (!selected || !policy) return null;
    try {
      const dailyHrs = Number(policy.daily_work_hours || 8);
      const effectiveHours = autoHours ? workingDays * dailyHrs : workingHours;
      const emp: PayrollEmployeeData = {
        id: selected.id,
        full_name: selected.full_name,
        start_date: new Date().toISOString().slice(0, 10),
        hourly_rate: Number(selected.hourly_rate || 0),
        base_salary: Number(selected.base_salary || 0),
        admin_allowance: 0,
        transfer_allowance: 0,
        food_transport_override: null,
        wives_count: 0,
        children_count: 0,
        other_allowances: 0,
        special_work_allowance: 0,
        annual_leave_balance: 0,
        annual_leave_days: 0,
        is_terminated: false,
        terminated_at: null,
      };
      const inputs: PayrollMonthInputs = {
        working_days: workingDays,
        working_hours: effectiveHours,
        overtime_hours: overtimeHours,
        holiday_overtime_hours: 0,
        vacation_hours: 0,
        annual_leave_days: 0,
        sick_leave_days: 0,
        opening_advance_balance: 0,
        loan_installment: 0,
        new_advance: 0,
        cash_advances: 0,
        food_total: 0,
        food_individual: 0,
        cash_shortage: 0,
        cash_surplus: 0,
        delivery: 0,
        purchases: 0,
        other_deduction: 0,
        violations: 0,
        deduction_notes: "",
        special_allowance: 0,
        extra_work_allowance: 0,
        has_termination_pay: false,
      };
      const overrides = (selected.payroll_overrides ?? {}) as Record<string, number>;
      const stdComponents: StandardComponent[] = previewComponents.map((c) => ({
        id: c.id,
        code: c.code,
        name_ar: c.name_ar,
        kind: c.kind,
        calculation_type: c.calculation_type,
        value: overrides[c.code] != null ? Number(overrides[c.code]) : Number(c.value || 0),
        formula_expression: c.formula_expression,
        is_attendance_linked: c.is_attendance_linked,
        is_active: c.is_active,
      }));
      const policyForEngine: PayrollPolicy = {
        id: policy.id,
        company_id: policy.company_id,
        name: policy.name,
        preset: "standard",
        salary_basis: policy.salary_basis,
        month_days_mode: policy.month_days_mode,
        month_days_custom: policy.month_days_custom ?? 0,
        daily_work_hours: policy.daily_work_hours,
        overtime_multiplier: policy.overtime_multiplier,
        overtime_after_hours: policy.overtime_after_hours,
        absence_calculation: policy.absence_calculation,
        late_calculation: policy.late_calculation,
        late_grace_minutes: policy.late_grace_minutes,
        late_per_minute_rate: policy.late_per_minute_rate,
        allowances_attendance_linked: policy.allowances_attendance_linked,
        deductions_mode: policy.deductions_mode,
        is_default: policy.is_default,
      };
      return calculateStandardPreset(emp, inputs, { year, month }, policyForEngine, {
        components: stdComponents,
      });
    } catch (e: any) {
      return { _error: e.message ?? String(e) } as any;
    }
  }, [selected, policy, previewComponents, year, month, workingDays, workingHours, overtimeHours, autoHours]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>ربط الموظفين بالسياسات</CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا يوجد موظفون نشطون.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الراتب الأساسي</TableHead>
                  <TableHead>السياسة</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id} className={selectedId === e.id ? "bg-muted/50" : ""}>
                    <TableCell className="font-medium">{e.full_name}</TableCell>
                    <TableCell>{Number(e.base_salary || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Select
                        value={e.payroll_policy_id ?? "__none"}
                        onValueChange={(v) =>
                          assignMut.mutate({ id: e.id, payroll_policy_id: v === "__none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— بدون —</SelectItem>
                          {policies.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant={selectedId === e.id ? "default" : "ghost"}
                        onClick={() => setSelectedId(e.id)}>
                        <PlayCircle className="h-4 w-4 ms-1" /> معاينة
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>معاينة الراتب — Standard Preset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selected ? (
            <p className="text-sm text-muted-foreground text-center py-6">اختر موظفاً لرؤية المعاينة.</p>
          ) : !policy ? (
            <p className="text-sm text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded">
              الموظف غير مرتبط بأي سياسة. اربطه أولاً.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>السنة</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
                <div>
                  <Label>الشهر</Label>
                  <Input type="number" min={1} max={12} value={month}
                    onChange={(e) => setMonth(Number(e.target.value))} />
                </div>
                <div>
                  <Label>أيام العمل</Label>
                  <Input type="number" value={workingDays}
                    onChange={(e) => setWorkingDays(Number(e.target.value))} />
                </div>
                <div>
                  <Label>ساعات العمل</Label>
                  <Input type="number" value={workingHours}
                    onChange={(e) => setWorkingHours(Number(e.target.value))} />
                </div>
                <div>
                  <Label>ساعات إضافية</Label>
                  <Input type="number" value={overtimeHours}
                    onChange={(e) => setOvertimeHours(Number(e.target.value))} />
                </div>
              </div>

              {previewComponents.length > 0 && (
                <div className="border rounded p-2 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">قيم خاصة بالموظف (Override)</div>
                  {previewComponents.map((c) => {
                    const overrides = (selected.payroll_overrides ?? {}) as Record<string, number>;
                    const current = overrides[c.code] ?? "";
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs w-20">{c.code}</span>
                        <span className="flex-1">{c.name_ar || c.name_en}</span>
                        <span className="text-xs text-muted-foreground">افتراضي: {c.value}</span>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-7 w-24"
                          placeholder="—"
                          defaultValue={current}
                          onBlur={(e) => {
                            const next = { ...overrides };
                            const v = e.target.value.trim();
                            if (v === "") delete next[c.code];
                            else next[c.code] = Number(v);
                            if (JSON.stringify(next) !== JSON.stringify(overrides)) {
                              overrideMut.mutate({ id: selected.id, payroll_overrides: next });
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {previewResult && "_error" in previewResult ? (
                <div className="text-sm text-destructive p-3 rounded bg-destructive/10">
                  خطأ: {String((previewResult as any)._error)}
                </div>
              ) : previewResult ? (
                <PreviewResult result={previewResult as any} />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewResult({ result }: { result: any }) {
  const fmt = (n: number) => Number(n || 0).toFixed(2);
  const eng = result._engine ?? {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Row label="راتب الحضور" value={fmt(result.attendance_salary)} />
        <Row label="مجموع البدلات" value={fmt(result.other_allowances)} />
        <Row label="الإجمالي" value={fmt(result.total_earnings)} bold />
        <Row label="مجموع الخصومات" value={fmt(result.total_deductions)} negative />
        <Row label="الصافي" value={fmt(result.net_salary)} bold />
      </div>
      {(eng.component_breakdown?.length ?? 0) > 0 && (
        <div className="border rounded">
          <div className="text-xs font-medium px-2 py-1 bg-muted">تفصيل المكوّنات</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>المصدر</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eng.component_breakdown.map((b: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{b.code}</TableCell>
                  <TableCell>{b.kind}</TableCell>
                  <TableCell>{fmt(b.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {(eng.warnings?.length ?? 0) > 0 && (
        <div className="text-xs bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded space-y-1">
          <div className="font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> تحذيرات
          </div>
          {eng.warnings.map((w: string, i: number) => <div key={i}>• {w}</div>)}
        </div>
      )}
      {(eng.rules_applied?.length ?? 0) > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">القواعد المطبّقة</summary>
          <pre className="whitespace-pre-wrap mt-1">{eng.rules_applied.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between p-2 rounded ${bold ? "bg-muted font-semibold" : ""}`}>
      <span>{label}</span>
      <span className={negative ? "text-destructive" : ""}>{value}</span>
    </div>
  );
}