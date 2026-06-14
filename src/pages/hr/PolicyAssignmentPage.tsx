import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { UserCog, Plus, Search, Loader2, Star, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Policy {
  id: string;
  name: string;
  description: string | null;
  salary_basis: string;
  month_days_mode: string;
  month_days_custom: number | null;
  daily_work_hours: number;
  overtime_multiplier: number;
  late_calculation: string;
  absence_calculation: string;
  is_default: boolean;
  is_active: boolean;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  job_title: string | null;
  branch_id: string | null;
  policy_id: string | null;
}

const BLANK_POLICY: Omit<Policy, "id" | "is_default" | "is_active"> = {
  name: "",
  description: null,
  salary_basis: "monthly",
  month_days_mode: "fixed_30",
  month_days_custom: null,
  daily_work_hours: 8,
  overtime_multiplier: 1.5,
  late_calculation: "none",
  absence_calculation: "per_day",
};

export default function PolicyAssignmentPage() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPolicy, setBulkPolicy] = useState<string>("");
  const [policyDialog, setPolicyDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Partial<Policy> | null>(null);

  /* ───────── Queries ───────── */

  const policiesQ = useQuery({
    queryKey: ["policies-assign", company.id],
    enabled: !!company.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("id,name,description,salary_basis,month_days_mode,month_days_custom,daily_work_hours,overtime_multiplier,late_calculation,absence_calculation,is_default,is_active")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data || []) as Policy[];
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-policy-assign", company.id],
    enabled: !!company.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, job_title, branch_id, is_active, is_terminated")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      const rows = (data || []).filter((e: any) => !e.is_terminated);
      const ids = rows.map((r: any) => r.id);
      if (!ids.length) return [] as EmployeeRow[];
      const { data: profiles } = await supabase
        .from("employee_payroll_profile")
        .select("employee_id, policy_id")
        .in("employee_id", ids);
      const map = new Map<string, string>();
      (profiles || []).forEach((p: any) => map.set(p.employee_id, p.policy_id));
      return rows.map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        job_title: r.job_title,
        branch_id: r.branch_id,
        policy_id: map.get(r.id) || null,
      })) as EmployeeRow[];
    },
  });

  const branchesQ = useQuery({
    queryKey: ["branches-min"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id,name");
      return (data || []) as { id: string; name: string }[];
    },
  });

  /* ───────── Mutations ───────── */

  const assignMut = useMutation({
    mutationFn: async ({ employeeIds, policyId }: { employeeIds: string[]; policyId: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      // Upsert one row per employee; employee_id is UNIQUE
      const rows = employeeIds.map((eid) => ({
        employee_id: eid,
        company_id: company.id,
        policy_id: policyId,
        effective_from: today,
      }));
      const { error } = await supabase
        .from("employee_payroll_profile")
        .upsert(rows, { onConflict: "employee_id" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["employees-policy-assign", company.id] });
      setSelected(new Set());
      toast.success(`تم ربط ${vars.employeeIds.length} موظف بالسياسة`);
    },
    onError: (e: any) => toast.error(e.message || "فشل الربط"),
  });

  const upsertPolicyMut = useMutation({
    mutationFn: async (p: Partial<Policy>) => {
      const payload: any = {
        ...BLANK_POLICY,
        ...p,
        company_id: company.id,
        is_active: true,
      };
      delete payload.id;
      if (p.id) {
        const { error } = await supabase.from("hr_payroll_policies").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        // Never create as default; existing default stays
        payload.is_default = false;
        const { error } = await supabase.from("hr_payroll_policies").insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies-assign", company.id] });
      toast.success("تم حفظ السياسة");
      setPolicyDialog(false);
      setEditingPolicy(null);
    },
    onError: (e: any) => toast.error(e.message || "فشل حفظ السياسة"),
  });

  const deletePolicyMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_payroll_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies-assign", company.id] });
      toast.success("تم حذف السياسة");
    },
    onError: (e: any) =>
      toast.error(e.message || "تعذّر الحذف — قد تكون السياسة مرتبطة بموظفين"),
  });

  const setDefaultMut = useMutation({
    mutationFn: async (id: string) => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies-assign", company.id] });
      toast.success("تم تعيين السياسة الافتراضية");
    },
  });

  /* ───────── Derived ───────── */

  const policies = policiesQ.data || [];
  const employees = employeesQ.data || [];
  const branchNameById = useMemo(() => {
    const m = new Map<string, string>();
    (branchesQ.data || []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branchesQ.data]);
  const policyNameById = useMemo(() => {
    const m = new Map<string, string>();
    policies.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [policies]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.includes(q) ||
        (e.job_title || "").includes(q) ||
        (e.branch_id && (branchNameById.get(e.branch_id) || "").includes(q)),
    );
  }, [employees, search, branchNameById]);

  const allVisibleChecked =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => selected.has(e.id));
  const someChecked = selected.size > 0;

  const toggleAllVisible = (checked: boolean) => {
    const next = new Set(selected);
    filteredEmployees.forEach((e) => {
      if (checked) next.add(e.id);
      else next.delete(e.id);
    });
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  /* ───────── Render ───────── */

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ربط الموظفين بسياسات الرواتب</h1>
          <p className="text-sm text-muted-foreground">
            أنشئ عدة سياسات راتب وعيّن كل موظف لسياسته. تقدر تختار مجموعة موظفين وتربطهم بسياسة واحدة بضغطة زر.
          </p>
        </div>
      </div>

      {/* Policies bar */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">السياسات المتاحة</h2>
            <Button
              size="sm"
              onClick={() => {
                setEditingPolicy({ ...BLANK_POLICY });
                setPolicyDialog(true);
              }}
            >
              <Plus className="h-4 w-4 ml-1" /> سياسة جديدة
            </Button>
          </div>
          {policiesQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
            </div>
          ) : policies.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا توجد سياسات. أنشئ أول سياسة.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {policies.map((p) => {
                const count = employees.filter((e) => e.policy_id === p.id).length;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-card hover:bg-muted/40"
                  >
                    {p.is_default && (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                    )}
                    <span className="font-medium text-sm">{p.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {count} موظف
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditingPolicy(p);
                        setPolicyDialog(true);
                      }}
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!p.is_default && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="تعيين كافتراضية"
                        onClick={() => setDefaultMut.mutate(p.id)}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!p.is_default && count === 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        title="حذف"
                        onClick={() => {
                          if (confirm(`حذف السياسة "${p.name}"؟`)) deletePolicyMut.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toolbar */}
      <Card className="mb-3">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الموظف، المسمى، أو الفرع..."
              className="pr-9"
            />
          </div>
          {someChecked && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selected.size} محدد</Badge>
              <Select value={bulkPolicy} onValueChange={setBulkPolicy}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="اختر سياسة..." />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!bulkPolicy || assignMut.isPending}
                onClick={() =>
                  assignMut.mutate({
                    employeeIds: Array.from(selected),
                    policyId: bulkPolicy,
                  })
                }
              >
                {assignMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                ربط المحددين
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                إلغاء
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employees table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {employeesQ.isLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل الموظفين...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد موظفون مطابقون.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={allVisibleChecked}
                      onCheckedChange={(v) => toggleAllVisible(!!v)}
                    />
                  </th>
                  <th className="p-3 text-right">الموظف</th>
                  <th className="p-3 text-right">المسمى الوظيفي</th>
                  <th className="p-3 text-right">الفرع</th>
                  <th className="p-3 text-right">السياسة الحالية</th>
                  <th className="p-3 text-right w-[220px]">تغيير السياسة</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <Checkbox
                        checked={selected.has(e.id)}
                        onCheckedChange={() => toggleOne(e.id)}
                      />
                    </td>
                    <td className="p-3 font-medium">{e.full_name}</td>
                    <td className="p-3 text-muted-foreground">{e.job_title || "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {e.branch_id ? branchNameById.get(e.branch_id) || "—" : "—"}
                    </td>
                    <td className="p-3">
                      {e.policy_id ? (
                        <Badge variant="outline">
                          {policyNameById.get(e.policy_id) || "سياسة محذوفة"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          بدون
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <Select
                        value={e.policy_id || ""}
                        onValueChange={(v) =>
                          assignMut.mutate({ employeeIds: [e.id], policyId: v })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="اختر..." />
                        </SelectTrigger>
                        <SelectContent>
                          {policies.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Policy create/edit dialog */}
      <Dialog
        open={policyDialog}
        onOpenChange={(v) => {
          setPolicyDialog(v);
          if (!v) setEditingPolicy(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPolicy?.id ? "تعديل سياسة" : "سياسة جديدة"}</DialogTitle>
          </DialogHeader>
          {editingPolicy && (
            <div className="space-y-3">
              <div>
                <Label>اسم السياسة</Label>
                <Input
                  value={editingPolicy.name || ""}
                  onChange={(e) =>
                    setEditingPolicy({ ...editingPolicy, name: e.target.value })
                  }
                  placeholder="مثلاً: سياسة الإدارة، سياسة الكاشير..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>نوع الراتب</Label>
                  <Select
                    value={editingPolicy.salary_basis || "monthly"}
                    onValueChange={(v) =>
                      setEditingPolicy({ ...editingPolicy, salary_basis: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">شهري</SelectItem>
                      <SelectItem value="daily">يومي</SelectItem>
                      <SelectItem value="hourly">بالساعة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>أيام الشهر</Label>
                  <Select
                    value={editingPolicy.month_days_mode || "fixed_30"}
                    onValueChange={(v) =>
                      setEditingPolicy({ ...editingPolicy, month_days_mode: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_26">26 يوم</SelectItem>
                      <SelectItem value="fixed_28">28 يوم</SelectItem>
                      <SelectItem value="fixed_30">30 يوم</SelectItem>
                      <SelectItem value="actual">الفعلي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ساعات العمل/يوم</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={editingPolicy.daily_work_hours ?? 8}
                    onChange={(e) =>
                      setEditingPolicy({
                        ...editingPolicy,
                        daily_work_hours: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>مضاعف الأوفر تايم</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editingPolicy.overtime_multiplier ?? 1.5}
                    onChange={(e) =>
                      setEditingPolicy({
                        ...editingPolicy,
                        overtime_multiplier: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>احتساب التأخير</Label>
                  <Select
                    value={editingPolicy.late_calculation || "none"}
                    onValueChange={(v) =>
                      setEditingPolicy({ ...editingPolicy, late_calculation: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      <SelectItem value="per_minute">لكل دقيقة</SelectItem>
                      <SelectItem value="per_hour">لكل ساعة</SelectItem>
                      <SelectItem value="full_day">يوم كامل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>احتساب الغياب</Label>
                  <Select
                    value={editingPolicy.absence_calculation || "per_day"}
                    onValueChange={(v) =>
                      setEditingPolicy({ ...editingPolicy, absence_calculation: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_day">يومي</SelectItem>
                      <SelectItem value="per_hour">بالساعة</SelectItem>
                      <SelectItem value="custom">مخصص</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>الوصف (اختياري)</Label>
                <Input
                  value={editingPolicy.description || ""}
                  onChange={(e) =>
                    setEditingPolicy({ ...editingPolicy, description: e.target.value })
                  }
                  placeholder="وصف مختصر للسياسة"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPolicyDialog(false)}>
              إلغاء
            </Button>
            <Button
              disabled={!editingPolicy?.name || upsertPolicyMut.isPending}
              onClick={() => editingPolicy && upsertPolicyMut.mutate(editingPolicy)}
            >
              {upsertPolicyMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}