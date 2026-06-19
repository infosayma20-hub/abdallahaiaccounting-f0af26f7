import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import PageHeader from "@/components/layout/PageHeader";
import BackButton from "@/components/BackButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Save, X, Building2, Briefcase, Loader2 } from "lucide-react";

type Department = {
  id: string;
  name: string;
  name_ar: string | null;
  is_active: boolean;
  is_deleted: boolean;
};

type JobTitle = {
  id: string;
  name: string;
  name_ar: string | null;
  department_id: string | null;
  is_active: boolean;
  is_deleted: boolean;
};

const NONE = "__none__";

export default function HrDefinitionsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  // Controlled tab — must NOT reset to "departments" when data refreshes
  // after adding a job title (that was the navigation bug).
  const [activeTab, setActiveTab] = useState<"departments" | "jobs">("departments");

  // Add forms
  const [newDeptName, setNewDeptName] = useState("");
  const [newJobName, setNewJobName] = useState("");
  const [newJobDept, setNewJobDept] = useState<string>(NONE);

  // Inline edit
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptValue, setEditingDeptValue] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingJobValue, setEditingJobValue] = useState("");
  const [editingJobDept, setEditingJobDept] = useState<string>(NONE);

  const fetchAll = async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setLoading(true);
    const [dRes, jRes] = await Promise.all([
      supabase
        .from("departments")
        .select("id,name,name_ar,is_active,is_deleted")
        .eq("user_id", dataOwnerId!)
        .eq("is_deleted", false)
        .order("name", { ascending: true }),
      supabase
        .from("job_titles")
        .select("id,name,name_ar,department_id,is_active,is_deleted")
        .eq("user_id", dataOwnerId!)
        .eq("is_deleted", false)
        .order("name", { ascending: true }),
    ]);
    if (dRes.error) toast.error("تعذر تحميل الأقسام");
    if (jRes.error) toast.error("تعذر تحميل المسميات");
    setDepartments((dRes.data as any) || []);
    setJobTitles((jRes.data as any) || []);
    if (showSpinner) setLoading(false);
  };

  useEffect(() => {
    fetchAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const deptMap = useMemo(() => {
    const m: Record<string, Department> = {};
    departments.forEach((d) => (m[d.id] = d));
    return m;
  }, [departments]);

  /* ───────── Departments CRUD ───────── */
  const addDepartment = async () => {
    const name = newDeptName.trim();
    if (!user) return;
    if (!name) {
      toast.error("اكتب اسم القسم");
      return;
    }
    if (departments.some((d) => (d.name_ar || d.name).trim() === name)) {
      toast.error("هذا القسم موجود بالفعل");
      return;
    }
    const { error } = await supabase.from("departments").insert({
      user_id: dataOwnerId!,
      name,
      name_ar: name,
      is_active: true,
    } as any);
    if (error) {
      toast.error("تعذر الإضافة");
      return;
    }
    toast.success("تمت إضافة القسم");
    setNewDeptName("");
    fetchAll();
  };

  const saveDepartmentName = async (id: string) => {
    const name = editingDeptValue.trim();
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    const { error } = await supabase
      .from("departments")
      .update({ name, name_ar: name } as any)
      .eq("id", id);
    if (error) {
      toast.error("تعذر الحفظ");
      return;
    }
    toast.success("تم التحديث");
    setEditingDeptId(null);
    fetchAll();
  };

  const toggleDepartmentActive = async (d: Department, value: boolean) => {
    const { error } = await supabase
      .from("departments")
      .update({ is_active: value } as any)
      .eq("id", d.id);
    if (error) {
      toast.error("تعذر التحديث");
      return;
    }
    setDepartments((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, is_active: value } : x)),
    );
  };

  /* ───────── Job Titles CRUD ───────── */
  const addJobTitle = async () => {
    const name = newJobName.trim();
    if (!user) return;
    if (!name) {
      toast.error("اكتب اسم المسمى");
      return;
    }
    const dept = newJobDept === NONE ? null : newJobDept;
    if (jobTitles.some((j) => (j.name_ar || j.name).trim() === name && j.department_id === dept)) {
      toast.error("هذا المسمى موجود بالفعل");
      return;
    }
    const { error } = await supabase.from("job_titles").insert({
      user_id: dataOwnerId!,
      name,
      name_ar: name,
      department_id: dept,
      is_active: true,
    } as any);
    if (error) {
      toast.error("تعذر الإضافة");
      return;
    }
    toast.success("تمت إضافة المسمى");
    setNewJobName("");
    setNewJobDept(NONE);
    fetchAll();
  };

  const saveJobTitle = async (id: string) => {
    const name = editingJobValue.trim();
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    const dept = editingJobDept === NONE ? null : editingJobDept;
    const { error } = await supabase
      .from("job_titles")
      .update({ name, name_ar: name, department_id: dept } as any)
      .eq("id", id);
    if (error) {
      toast.error("تعذر الحفظ");
      return;
    }
    toast.success("تم التحديث");
    setEditingJobId(null);
    fetchAll();
  };

  const toggleJobActive = async (j: JobTitle, value: boolean) => {
    const { error } = await supabase
      .from("job_titles")
      .update({ is_active: value } as any)
      .eq("id", j.id);
    if (error) {
      toast.error("تعذر التحديث");
      return;
    }
    setJobTitles((prev) =>
      prev.map((x) => (x.id === j.id ? { ...x, is_active: value } : x)),
    );
  };

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <BackButton />
      <PageHeader title="الأقسام والمسميات الوظيفية" />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ التحميل…
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} dir="rtl">
          <TabsList>
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" /> الأقسام
              <Badge variant="secondary" className="text-[10px]">{departments.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <Briefcase className="h-4 w-4" /> المسميات الوظيفية
              <Badge variant="secondary" className="text-[10px]">{jobTitles.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Departments tab */}
          <TabsContent value="departments" className="space-y-3">
            <Card className="p-3 flex items-center gap-2">
              <Input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="اسم القسم الجديد (مثال: المبيعات)"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDepartment(); } }}
              />
              <Button onClick={addDepartment} className="gap-1 shrink-0">
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </Card>

            <Card className="overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 text-[11px] text-muted-foreground bg-muted/40 border-b">
                <div className="col-span-7">القسم</div>
                <div className="col-span-3 text-center">الحالة</div>
                <div className="col-span-2 text-left">إجراء</div>
              </div>
              {departments.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  لا توجد أقسام بعد — أضف أول قسم.
                </div>
              )}
              {departments.map((d) => (
                <div key={d.id} className="grid grid-cols-12 items-center px-4 py-2 border-b last:border-b-0 text-sm">
                  <div className="col-span-7">
                    {editingDeptId === d.id ? (
                      <Input
                        value={editingDeptValue}
                        onChange={(e) => setEditingDeptValue(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveDepartmentName(d.id); }}
                      />
                    ) : (
                      <span className={d.is_active ? "" : "text-muted-foreground line-through"}>
                        {d.name_ar || d.name}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center justify-center gap-2">
                    <Switch checked={d.is_active} onCheckedChange={(v) => toggleDepartmentActive(d, v)} />
                    <span className="text-[11px] text-muted-foreground">
                      {d.is_active ? "مفعّل" : "موقوف"}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-start gap-1">
                    {editingDeptId === d.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => saveDepartmentName(d.id)}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingDeptId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => { setEditingDeptId(d.id); setEditingDeptValue(d.name_ar || d.name); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>

          {/* Job titles tab */}
          <TabsContent value="jobs" className="space-y-3">
            <Card className="p-3 grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2 items-center">
              <Input
                value={newJobName}
                onChange={(e) => setNewJobName(e.target.value)}
                placeholder="اسم المسمى الوظيفي (مثال: محاسب)"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addJobTitle(); } }}
              />
              <Select value={newJobDept} onValueChange={setNewJobDept}>
                <SelectTrigger>
                  <SelectValue placeholder="القسم (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون قسم</SelectItem>
                  {departments.filter((d) => d.is_active).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name_ar || d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addJobTitle} className="gap-1">
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </Card>

            <Card className="overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 text-[11px] text-muted-foreground bg-muted/40 border-b">
                <div className="col-span-5">المسمى</div>
                <div className="col-span-3">القسم</div>
                <div className="col-span-2 text-center">الحالة</div>
                <div className="col-span-2 text-left">إجراء</div>
              </div>
              {jobTitles.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  لا توجد مسميات بعد.
                </div>
              )}
              {jobTitles.map((j) => (
                <div key={j.id} className="grid grid-cols-12 items-center px-4 py-2 border-b last:border-b-0 text-sm">
                  <div className="col-span-5">
                    {editingJobId === j.id ? (
                      <Input
                        value={editingJobValue}
                        onChange={(e) => setEditingJobValue(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className={j.is_active ? "" : "text-muted-foreground line-through"}>
                        {j.name_ar || j.name}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 text-muted-foreground text-xs">
                    {editingJobId === j.id ? (
                      <Select value={editingJobDept} onValueChange={setEditingJobDept}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="القسم" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>بدون قسم</SelectItem>
                          {departments.filter((d) => d.is_active).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name_ar || d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      j.department_id ? (deptMap[j.department_id]?.name_ar || deptMap[j.department_id]?.name || "—") : "—"
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-2">
                    <Switch checked={j.is_active} onCheckedChange={(v) => toggleJobActive(j, v)} />
                  </div>
                  <div className="col-span-2 flex items-center justify-start gap-1">
                    {editingJobId === j.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => saveJobTitle(j.id)}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingJobId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingJobId(j.id);
                        setEditingJobValue(j.name_ar || j.name);
                        setEditingJobDept(j.department_id || NONE);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}