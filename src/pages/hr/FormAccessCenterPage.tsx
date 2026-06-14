import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardList, Search, Loader2, Lock, UserCircle2, Settings2, ShieldCheck, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFormAccessManager } from "@/hooks/hr/useFormAccessManager";
import { Link } from "react-router-dom";

type EmployeeRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  branch_name: string | null;
  auth_user_id: string | null;
  roles: string[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير عام",
  super_admin: "Super Admin",
  accountant_senior: "محاسب",
  cashier: "كاشير",
  supervisor: "مشرف",
  accountant_sales: "مندوب مبيعات",
  accountant_purchases: "محاسب مشتريات",
  hr_manager: "مدير HR",
  employee: "موظف",
  sales_rep: "مندوب",
  manager: "مدير فرع",
  store_tracker: "متتبع مخزن",
  branch_scheduler: "مسؤول جدولة",
  portal: "بوابة",
};
const roleLabel = (r: string) => ROLE_LABELS[r] || r;

export default function FormAccessCenterPage() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const [counts, setCounts] = useState<Map<string, { fill: number; view: number }>>(new Map());

  // Load all active employees + their roles + branch names
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const { data: emps } = await (supabase as any)
        .from("employees")
        .select("id, full_name, job_title, branch_id, auth_user_id")
        .eq("employment_status", "active")
        .eq("is_deleted", false)
        .order("full_name", { ascending: true })
        .limit(500);
      if (cancelled) return;
      const list = (emps || []) as any[];

      const branchIds = Array.from(new Set(list.map((e) => e.branch_id).filter(Boolean)));
      const authIds = Array.from(new Set(list.map((e) => e.auth_user_id).filter(Boolean)));

      const [{ data: brs }, { data: rls }] = await Promise.all([
        branchIds.length
          ? (supabase as any).from("branches_safe").select("id, name").in("id", branchIds)
          : Promise.resolve({ data: [] }),
        authIds.length
          ? (supabase as any).from("user_roles").select("user_id, role").in("user_id", authIds)
          : Promise.resolve({ data: [] }),
      ]);

      const brMap = new Map<string, string>();
      (brs || []).forEach((b: any) => brMap.set(b.id, b.name));
      const rolesMap = new Map<string, string[]>();
      (rls || []).forEach((r: any) => {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });

      setEmployees(
        list.map((e) => ({
          id: e.id,
          full_name: e.full_name,
          job_title: e.job_title,
          branch_name: e.branch_id ? brMap.get(e.branch_id) ?? null : null,
          auth_user_id: e.auth_user_id,
          roles: e.auth_user_id ? rolesMap.get(e.auth_user_id) || [] : [],
        })),
      );
      setLoadingList(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q) ||
        (e.branch_name || "").toLowerCase().includes(q) ||
        e.roles.some((r) => roleLabel(r).toLowerCase().includes(q) || r.toLowerCase().includes(q)),
    );
  }, [search, employees]);

  // Callback from dialog to refresh counts for the row.
  const handleCountsUpdate = (empId: string, fill: number, view: number) => {
    setCounts((prev) => {
      const m = new Map(prev);
      m.set(empId, { fill, view });
      return m;
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">إسناد النماذج والصلاحيات</h1>
            <p className="text-sm text-muted-foreground">
              جدول كل الموظفين مع صلاحياتهم والنماذج المسندة لكل واحد منهم.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/employee-forms-management">
              <FileText className="h-4 w-4 ml-1" /> إدارة قوالب النماذج
            </Link>
          </Button>
        </div>


        {/* Search */}
        <Card>
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم، المنصب، الفرع، أو الدور..."
                className="pr-10"
                autoFocus
              />
            </div>
          </CardContent>
        </Card>

        {/* Employees table */}
        <Card>
          <CardContent className="p-0">
            {loadingList ? (
              <div className="p-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري تحميل الموظفين...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                لا يوجد موظفون مطابقون.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-right p-3 font-medium">الموظف</th>
                      <th className="text-right p-3 font-medium">المنصب</th>
                      <th className="text-right p-3 font-medium">الفرع</th>
                      <th className="text-right p-3 font-medium">الصلاحيات (الدور)</th>
                      <th className="text-center p-3 font-medium">يعبّي</th>
                      <th className="text-center p-3 font-medium">يطّلع</th>
                      <th className="text-center p-3 font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((e) => {
                      const c = counts.get(e.id);
                      return (
                        <tr key={e.id} className="hover:bg-muted/20">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <UserCircle2 className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{e.full_name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{e.job_title || "—"}</td>
                          <td className="p-3 text-muted-foreground">{e.branch_name || "—"}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {e.roles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">— لا يوجد —</span>
                              ) : (
                                e.roles.map((r) => (
                                  <Badge key={r} variant="secondary" className="text-[10px]">
                                    <ShieldCheck className="h-2.5 w-2.5 ml-1" />
                                    {roleLabel(r)}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {c ? (
                              <Badge variant="outline" className="text-[10px]">
                                <FileText className="h-2.5 w-2.5 ml-1" /> {c.fill}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {c ? (
                              <Badge variant="outline" className="text-[10px]">
                                <Eye className="h-2.5 w-2.5 ml-1" /> {c.view}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelected(e)}
                              className="h-8"
                            >
                              <Settings2 className="h-3.5 w-3.5 ml-1" /> إدارة
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <EmployeeFormAccessDialog
          employee={selected}
          onClose={() => setSelected(null)}
          onCountsChange={handleCountsUpdate}
        />
      </div>
    </TooltipProvider>
  );
}

/* ---------------- Dialog ---------------- */

function EmployeeFormAccessDialog({
  employee,
  onClose,
  onCountsChange,
}: {
  employee: EmployeeRow | null;
  onClose: () => void;
  onCountsChange: (empId: string, fill: number, view: number) => void;
}) {
  const { rows, loading, saving, setAccess } = useFormAccessManager(employee?.id ?? null);
  const [tab, setTab] = useState<"assign" | "view">("assign");
  const [pickerOpen, setPickerOpen] = useState<"fill" | "view" | null>(null);

  useEffect(() => {
    if (!employee) return;
    const fill = rows.filter((r) => r.can_fill).length;
    const view = rows.filter((r) => r.can_view).length;
    onCountsChange(employee.id, fill, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, employee?.id]);

  const assignedFill = rows.filter((r) => r.can_fill);
  const assignedView = rows.filter((r) => r.can_view && !r.can_fill);
  const availableForFill = rows.filter((r) => !r.can_fill);
  const availableForView = rows.filter((r) => !r.can_view && !r.can_fill);

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" />
            {employee?.full_name}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            {employee?.job_title || "بلا منصب"}
            {employee?.branch_name ? ` • ${employee.branch_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Roles */}
        <div className="rounded-lg border p-3 bg-muted/20">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> صلاحيات النظام (الدور)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(employee?.roles ?? []).length === 0 ? (
              <span className="text-xs text-muted-foreground">
                لا توجد أدوار مسندة — يتعامل كموظف عادي.
              </span>
            ) : (
              employee!.roles.map((r) => (
                <Badge key={r} variant="default" className="text-[10px]">
                  {roleLabel(r)}
                </Badge>
              ))
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">
            لتغيير الأدوار: <Link to="/settings/users" className="underline text-primary">الإعدادات ← المستخدمون</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            className={`px-3 py-2 text-sm border-b-2 transition ${
              tab === "assign" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setTab("assign")}
          >
            <FileText className="h-3.5 w-3.5 inline ml-1" /> نماذج للتعبئة ({assignedFill.length})
          </button>
          <button
            className={`px-3 py-2 text-sm border-b-2 transition ${
              tab === "view" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setTab("view")}
          >
            <Eye className="h-3.5 w-3.5 inline ml-1" /> نماذج للاطلاع ({assignedView.length})
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحميل...
          </div>
        ) : (
          <div className="space-y-3">
            {tab === "assign" && (
              <AssignedSection
                title="النماذج التي يستطيع تعبئتها"
                items={assignedFill}
                emptyText="لا توجد نماذج مسندة للتعبئة."
                onRemove={(id, source) =>
                  source === "manual" || source === "both"
                    ? setAccess(id, "fill", false)
                    : null
                }
                addLabel="إضافة نموذج للتعبئة"
                onAddClick={() => setPickerOpen("fill")}
                saving={saving}
                level="fill"
              />
            )}
            {tab === "view" && (
              <AssignedSection
                title="النماذج التي يستطيع الاطلاع عليها فقط"
                items={assignedView}
                emptyText="لا توجد نماذج مسندة للاطلاع."
                onRemove={(id, source) =>
                  source === "manual" || source === "both"
                    ? setAccess(id, "view", false)
                    : null
                }
                addLabel="إضافة نموذج للاطلاع"
                onAddClick={() => setPickerOpen("view")}
                saving={saving}
                level="view"
              />
            )}
          </div>
        )}

        {/* Picker dropdown */}
        {pickerOpen && (
          <TemplatePicker
            available={pickerOpen === "fill" ? availableForFill : availableForView}
            onPick={(id) => {
              setAccess(id, pickerOpen, true);
              setPickerOpen(null);
            }}
            onCancel={() => setPickerOpen(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignedSection({
  title, items, emptyText, onRemove, addLabel, onAddClick, saving, level,
}: {
  title: string;
  items: ReturnType<typeof useFormAccessManager>["rows"];
  emptyText: string;
  onRemove: (id: string, source: string | null) => void;
  addLabel: string;
  onAddClick: () => void;
  saving: boolean;
  level: "fill" | "view";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <Button variant="outline" size="sm" onClick={onAddClick} disabled={saving}>
          + {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg border-dashed">
          {emptyText}
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {items.map((r) => {
            const source = level === "fill" ? r.fill_source : r.view_source;
            const inherited = source === "job_title";
            return (
              <div key={r.template_id} className="flex items-center gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {r.template_name}
                    {r.is_system && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">نظام</Badge>
                    )}
                    {inherited && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">موروثة من المنصب</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {r.template_description && (
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {r.template_description}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={inherited || saving}
                  onClick={() => onRemove(r.template_id, source)}
                >
                  {inherited ? "موروث" : "إزالة"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatePicker({
  available, onPick, onCancel,
}: {
  available: ReturnType<typeof useFormAccessManager>["rows"];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = available.filter((r) =>
    !q ? true : r.template_name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن قالب..."
          className="h-8"
        />
        <Button variant="ghost" size="sm" onClick={onCancel}>إلغاء</Button>
      </div>
      <div className="max-h-60 overflow-y-auto border rounded-lg divide-y bg-background">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">لا توجد قوالب متاحة للإضافة.</div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.template_id}
              onClick={() => onPick(r.template_id)}
              className="w-full text-right p-2.5 hover:bg-muted/40 text-sm flex items-center justify-between gap-2"
            >
              <span className="truncate">{r.template_name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{r.template_category || "عام"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

