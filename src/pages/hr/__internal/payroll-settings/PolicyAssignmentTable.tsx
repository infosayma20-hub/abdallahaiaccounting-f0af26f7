import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { usePayrollPolicies, type PayrollPolicy } from "@/hooks/hr/usePayrollPolicies";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users } from "lucide-react";

interface EmpRow {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  payroll_policy_id: string | null;
  is_active: boolean;
}

interface Branch { id: string; name: string }

export default function PolicyAssignmentTable({ policies }: { policies: PayrollPolicy[] }) {
  const { dataOwnerId } = useDataOwnerId();
  const { assignToEmployees } = usePayrollPolicies();

  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterPolicy, setFilterPolicy] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPolicy, setBulkPolicy] = useState<string>("");

  const employeesQ = useQuery({
    queryKey: ["employees-for-policy-assignment", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async (): Promise<EmpRow[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, department, branch_id, payroll_policy_id, is_active")
        .eq("company_id", dataOwnerId as string)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const branchesQ = useQuery({
    queryKey: ["branches-light", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async (): Promise<Branch[]> => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("company_id", dataOwnerId as string);
      return (data as any) || [];
    },
  });

  const branchMap = useMemo(() => new Map((branchesQ.data || []).map(b => [b.id, b.name])), [branchesQ.data]);
  const policyMap = useMemo(() => new Map(policies.map(p => [p.id, p.name])), [policies]);
  const defaultPolicy = policies.find(p => p.is_default);

  const departments = useMemo(() => {
    const s = new Set<string>();
    (employeesQ.data || []).forEach(e => { if (e.department) s.add(e.department); });
    return Array.from(s).sort();
  }, [employeesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employeesQ.data || []).filter(e => {
      if (q && !e.full_name?.toLowerCase().includes(q)) return false;
      if (filterDept !== "all" && e.department !== filterDept) return false;
      if (filterBranch !== "all" && e.branch_id !== filterBranch) return false;
      if (filterPolicy === "__none__" && e.payroll_policy_id) return false;
      if (filterPolicy !== "all" && filterPolicy !== "__none__" && e.payroll_policy_id !== filterPolicy) return false;
      return true;
    });
  }, [employeesQ.data, search, filterDept, filterBranch, filterPolicy]);

  const allSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id));
  const toggleAll = () => {
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) filtered.forEach(e => n.delete(e.id));
      else filtered.forEach(e => n.add(e.id));
      return n;
    });
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const onChangeRowPolicy = async (empId: string, policyId: string) => {
    await assignToEmployees.mutateAsync({
      employeeIds: [empId],
      policyId: policyId === "__none__" ? null : policyId,
    });
  };

  const applyBulk = async () => {
    if (!bulkPolicy || selected.size === 0) return;
    await assignToEmployees.mutateAsync({
      employeeIds: Array.from(selected),
      policyId: bulkPolicy === "__none__" ? null : bulkPolicy,
    });
    setSelected(new Set());
    setBulkPolicy("");
  };

  if (employeesQ.isLoading) {
    return <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جار التحميل…</div>;
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="بحث باسم الموظف…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 max-w-xs" />
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {(branchesQ.data || []).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPolicy} onValueChange={setFilterPolicy}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="السياسة الحالية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السياسات</SelectItem>
            <SelectItem value="__none__">بدون سياسة (تستخدم الافتراضية)</SelectItem>
            {policies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mr-auto">
          {filtered.length} موظف • محدد: {selected.size}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm">تعيين <b>{selected.size}</b> موظف إلى:</span>
          <Select value={bulkPolicy} onValueChange={setBulkPolicy}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="اختر سياسة…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون سياسة (الافتراضية)</SelectItem>
              {policies.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={applyBulk} disabled={!bulkPolicy || assignToEmployees.isPending}>تطبيق</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-right w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-3 py-2 text-right font-semibold">الموظف</th>
              <th className="px-3 py-2 text-right font-semibold">القسم</th>
              <th className="px-3 py-2 text-right font-semibold">الفرع</th>
              <th className="px-3 py-2 text-right font-semibold">السياسة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const current = e.payroll_policy_id || "__none__";
              return (
                <tr key={e.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleOne(e.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium">{e.full_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.department || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.branch_id ? branchMap.get(e.branch_id) || "—" : "—"}</td>
                  <td className="px-3 py-2">
                    <Select value={current} onValueChange={(v) => onChangeRowPolicy(e.id, v)}>
                      <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          بدون{defaultPolicy ? ` — تستخدم: ${defaultPolicy.name}` : ""}
                        </SelectItem>
                        {policies.filter(p => p.is_active).map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.is_default ? " (افتراضية)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">لا يوجد موظفين مطابقين</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
