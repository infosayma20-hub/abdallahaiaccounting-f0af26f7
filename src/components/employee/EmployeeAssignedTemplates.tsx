import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, CheckCircle2, Calendar, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer, { type FormSchema } from "@/components/forms/DynamicFormRenderer";

interface Props {
  employeeId: string;
  jobTitle?: string | null;
  jobTitleName?: string | null;
}

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  schema: FormSchema;
  frequency: string;
  target_job_title_names: string[];
  target_employee_ids: string[];
};

type Submission = {
  id: string;
  template_id: string;
  title: string | null;
  status: string;
  created_at: string;
  form_data: Record<string, any>;
};

const freqLabel = (f: string) => ({
  once: "مرة واحدة", weekly: "أسبوعي", monthly: "شهري", quarterly: "ربعي", yearly: "سنوي",
}[f] || f);

const categoryLabel = (c: string) => ({
  marketing: "تسويق", operations: "عمليات", hr: "موارد بشرية",
  quality: "جودة", general: "عام", finance: "مالية",
}[c] || c);

const categoryColor = (c: string) => ({
  marketing: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  operations: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  hr: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  quality: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  finance: "bg-amber-500/10 text-amber-600 border-amber-500/30",
}[c] || "bg-muted text-muted-foreground border-border");

export default function EmployeeAssignedTemplates({ employeeId, jobTitle, jobTitleName }: Props) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [viewSubmission, setViewSubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all active templates (RLS scopes to system + own company)
      const { data: tplData, error: tplErr } = await supabase
        .from("form_templates")
        .select("id, name, description, category, schema, frequency, target_job_title_names, target_employee_ids")
        .eq("is_active", true)
        .eq("is_deleted", false);
      if (tplErr) throw tplErr;

      // Filter client-side: match employee_id OR job_title name
      const myJobs = [jobTitle, jobTitleName].filter(Boolean) as string[];
      const matched = (tplData || []).filter((t: any) => {
        const inEmps = (t.target_employee_ids || []).includes(employeeId);
        const inJobs = (t.target_job_title_names || []).some((n: string) =>
          myJobs.some((my) => my && (my === n || my.includes(n) || n.includes(my)))
        );
        return inEmps || inJobs;
      });
      setTemplates(matched as Template[]);

      // Fetch my submissions for these templates
      if (matched.length) {
        const { data: subs } = await supabase
          .from("employee_forms")
          .select("id, template_id, title, status, created_at, form_data")
          .eq("employee_id", employeeId)
          .in("template_id", matched.map((m: any) => m.id))
          .order("created_at", { ascending: false });
        setSubmissions((subs as Submission[]) || []);
      } else {
        setSubmissions([]);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "تعذر تحميل النماذج", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, jobTitle, jobTitleName]);

  const handleSubmit = async (formData: Record<string, any>) => {
    if (!activeTemplate) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("employee_forms").insert({
        employee_id: employeeId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        form_type: "dynamic_template",
        template_id: activeTemplate.id,
        title: activeTemplate.name,
        form_data: formData,
        status: "pending",
      });
      if (error) throw error;
      toast({ title: "تم إرسال النموذج", description: "سيراجعه المسؤول قريباً." });
      setActiveTemplate(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!templates.length) return null;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center gap-2 px-1">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">النماذج المسندة لي</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{templates.length}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {templates.map((t) => {
          const mySubs = submissions.filter((s) => s.template_id === t.id);
          const lastSub = mySubs[0];
          return (
            <Card key={t.id} className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold">{t.name}</span>
                      <Badge variant="outline" className={`text-[10px] h-5 ${categoryColor(t.category)}`}>
                        {categoryLabel(t.category)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-5">
                        <Calendar className="h-2.5 w-2.5 ml-1" />
                        {freqLabel(t.frequency)}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setActiveTemplate(t)}
                  >
                    تعبئة النموذج
                    <ChevronLeft className="h-3 w-3 mr-1" />
                  </Button>
                </div>
                {mySubs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60">
                    <p className="text-[10px] text-muted-foreground mb-1.5">
                      تعبئاتي السابقة ({mySubs.length})
                    </p>
                    <div className="space-y-1">
                      {mySubs.slice(0, 3).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setViewSubmission(s)}
                          className="w-full text-right flex items-center justify-between text-[11px] bg-muted/40 hover:bg-muted/70 rounded-md px-2 py-1.5 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            {new Date(s.created_at).toLocaleDateString("ar")}
                          </span>
                          <Badge variant="outline" className="text-[9px] h-4">
                            {s.status === "pending" ? "قيد المراجعة"
                              : s.status === "approved" ? "معتمد"
                              : s.status === "rejected" ? "مرفوض" : s.status}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Fill template dialog */}
      <Dialog open={!!activeTemplate} onOpenChange={(o) => !o && setActiveTemplate(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{activeTemplate?.name}</DialogTitle>
            {activeTemplate?.description && (
              <p className="text-xs text-muted-foreground text-right">{activeTemplate.description}</p>
            )}
          </DialogHeader>
          {activeTemplate && (
            <DynamicFormRenderer
              schema={activeTemplate.schema}
              draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
              submitting={submitting}
              onSubmit={handleSubmit}
              onSaveDraft={() => {}}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View past submission dialog (read-only) */}
      <Dialog open={!!viewSubmission} onOpenChange={(o) => !o && setViewSubmission(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {viewSubmission?.title || "نموذج"} —{" "}
              {viewSubmission && new Date(viewSubmission.created_at).toLocaleDateString("ar")}
            </DialogTitle>
          </DialogHeader>
          {viewSubmission && (() => {
            const tpl = templates.find((t) => t.id === viewSubmission.template_id);
            if (!tpl) return <p className="text-sm text-muted-foreground">القالب غير متاح.</p>;
            return (
              <DynamicFormRenderer
                schema={tpl.schema}
                initialData={viewSubmission.form_data}
                readOnly
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}