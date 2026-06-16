import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FormStatusBadge from "@/components/employee/forms/FormStatusBadge";
import { Loader2, FileText, ChevronDown, ChevronUp, ExternalLink, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getFreshFormPdfUrl } from "@/lib/employee-forms/pdfUrl";
import DynamicTemplateView from "@/components/employee/DynamicTemplateView";
import { downloadEmployeeFormWord } from "@/lib/employee-forms/exportFormWord";
import FormSectionAssignmentsPanel from "@/components/employee/forms/FormSectionAssignmentsPanel";
import { useManagerBranches } from "@/hooks/useBranchRoster";

interface FormRow {
  id: string;
  title: string | null;
  form_type: string | null;
  form_data: any;
  workflow_status: string;
  current_approver_role: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  submitted_at: string | null;
  created_at: string;
  employee_id: string;
  template_id: string | null;
  user_id?: string | null;
  employees?: { full_name: string; branch_id: string | null } | null;
  form_templates?: { name: string; category: string; schema: any } | null;
}

/**
 * Branch-manager scoped Forms Inbox.
 * Loads forms whose employee belongs to a branch the current user manages
 * (via branch_manager_assignments). Used to assign plan sections to employees.
 * No approve/reject UI – assignment only.
 */
export default function ManagerFormsInboxPage() {
  const { data: managedBranches = [], isLoading: branchesLoading } = useManagerBranches();
  const branchIds = useMemo(
    () => (managedBranches || []).map((b: any) => b.branch_id).filter(Boolean),
    [managedBranches]
  );

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FormRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (!branchIds.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Pre-fetch employees in managed branches (RLS will further restrict).
      const { data: emps, error: empErr } = await supabase
        .from("employees")
        .select("id")
        .in("branch_id", branchIds);
      if (empErr) throw empErr;
      const empIds = (emps || []).map((e: any) => e.id);
      if (!empIds.length) { setRows([]); return; }

      const { data, error } = await supabase
        .from("employee_forms")
        .select("id,title,form_type,form_data,workflow_status,current_approver_role,pdf_url,pdf_storage_path,submitted_at,created_at,employee_id,template_id,user_id,employees:employee_id(full_name,branch_id),form_templates:template_id(name,category,schema)")
        .neq("workflow_status", "draft")
        .in("employee_id", empIds)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as any);
    } catch (e: any) {
      toast({ title: "تعذر تحميل النماذج", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branchIds.join(",")]);

  useEffect(() => {
    const ch = supabase.channel("manager-forms-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_forms" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [branchIds.join(",")]);

  const openPdf = async (row: FormRow) => {
    try {
      const fresh = await getFreshFormPdfUrl(row.id, row.pdf_url, row.pdf_storage_path);
      if (!fresh) {
        toast({ title: "لا يوجد PDF متاح", variant: "destructive" });
        return;
      }
      window.open(fresh, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "تعذر فتح الملف", description: e.message, variant: "destructive" });
    }
  };

  const downloadWord = (row: FormRow) => {
    downloadEmployeeFormWord({
      title: row.title || row.form_templates?.name || "نموذج",
      employeeName: row.employees?.full_name,
      createdAt: row.created_at,
      schema: row.form_templates?.schema,
      data: row.form_data,
    });
    toast({ title: "تم تنزيل ملف Word" });
  };

  if (branchesLoading) {
    return (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    );
  }

  if (!branchIds.length) {
    return (
      <div className="p-6 max-w-3xl mx-auto" dir="rtl">
        <Card className="p-8 text-center text-muted-foreground">
          لا توجد فروع مُسندة إليك لإدارتها. يرجى التواصل مع مدير النظام.
        </Card>
      </div>
    );
  }

  return (
    <div
      className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      <div className="flex flex-col gap-2 mb-4">
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> صندوق النماذج — إسناد البنود
        </h1>
        <p className="text-xs text-muted-foreground">
          نماذج موظفي فروعك. افتح أي نموذج وأسند بنوده للموظفين المعنيين، وسيظهر للموظف ضمن "بنود مسندة لي".
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد نماذج مرسلة بعد.</Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full p-3 sm:p-4 flex items-center gap-3 hover:bg-muted/40 transition text-right"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate max-w-[60vw] sm:max-w-none">
                        {r.title || r.form_templates?.name || "نموذج"}
                      </span>
                      <FormStatusBadge status={r.workflow_status} />
                      {r.form_templates?.category && (
                        <Badge variant="outline" className="text-[10px]">{r.form_templates.category}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.employees?.full_name || "—"} • {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-3 sm:p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      {(r.pdf_url || r.pdf_storage_path) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 w-full sm:w-auto"
                          onClick={() => openPdf(r)}
                        >
                          <ExternalLink className="h-4 w-4" /> فتح PDF
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 w-full sm:w-auto"
                        onClick={() => downloadWord(r)}
                      >
                        <FileDown className="h-4 w-4" /> تنزيل Word
                      </Button>
                    </div>

                    {r.form_templates?.schema && (
                      <div className="rounded-lg bg-background border p-3 text-xs">
                        <DynamicTemplateView
                          schema={r.form_templates.schema}
                          data={r.form_data}
                          title={r.title || r.form_templates.name}
                        />
                      </div>
                    )}

                    {r.form_type === "dynamic_template" && r.form_templates?.schema && (
                      <FormSectionAssignmentsPanel
                        formId={r.id}
                        templateId={r.template_id}
                        schema={r.form_templates.schema}
                        companyUserId={r.user_id || null}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}