import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ChevronLeft, CheckCircle2, X,
  Megaphone, ClipboardList, Users, ShieldCheck, Coins, FileText, Share2, FileDown, Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer, { type FormSchema } from "@/components/forms/DynamicFormRenderer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import FormStatusBadge from "@/components/employee/forms/FormStatusBadge";
import FormShareSheet from "@/components/employee/forms/FormShareSheet";
import { exportEmployeeFormPdf, downloadBlob } from "@/lib/employee-forms/exportFormPdf";
import DynamicTemplateView from "@/components/employee/DynamicTemplateView";
import { downloadEmployeeFormWord, sanitizeExportFileName } from "@/lib/employee-forms/exportFormWord";
import FormSectionAssignmentsPanel from "@/components/employee/forms/FormSectionAssignmentsPanel";
import { useIsBranchManager } from "@/hooks/useIsBranchManager";

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
  can_fill?: boolean;
  can_view?: boolean;
};

type Submission = {
  id: string;
  template_id: string;
  title: string | null;
  status: string;
  workflow_status?: string | null;
  pdf_url?: string | null;
  company_id?: string | null;
  created_at: string;
  form_data: Record<string, any>;
};

const freqLabel = (f: string) => ({
  once: "لمرة واحدة", weekly: "أسبوعي", monthly: "شهري",
  quarterly: "كل ٣ شهور", yearly: "سنوي",
}[f] || f);

const freqEmoji = (f: string) => ({
  once: "✨", weekly: "🗓️", monthly: "📅", quarterly: "🌸", yearly: "🎉",
}[f] || "🗓️");

const categoryMeta = (c: string): { icon: any; color: string } => ({
  marketing:  { icon: Megaphone,    color: "text-pink-500" },
  operations: { icon: ClipboardList, color: "text-blue-500" },
  hr:         { icon: Users,         color: "text-purple-500" },
  quality:    { icon: ShieldCheck,   color: "text-emerald-500" },
  finance:    { icon: Coins,         color: "text-amber-500" },
  general:    { icon: FileText,      color: "text-slate-500" },
}[c] || { icon: FileText, color: "text-primary" });

export default function EmployeeAssignedTemplates({ employeeId, jobTitle, jobTitleName }: Props) {
  const isMobile = useIsMobile();
  const { isManager } = useIsBranchManager();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [viewSubmission, setViewSubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareTarget, setShareTarget] = useState<Submission | null>(null);
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Use authoritative RPC that returns per-template can_fill/can_view
      const { data: accessData, error: accessErr } = await supabase.rpc("get_employee_form_access", {
        p_employee_id: employeeId,
      });
      if (accessErr) throw accessErr;
      const accessRows = (accessData || []) as any[];
      const visibleIds = accessRows.filter((r) => r.can_view || r.can_fill).map((r) => r.template_id);

      let tplData: any[] = [];
      if (visibleIds.length) {
        const { data, error: tplErr } = await supabase
          .from("form_templates")
          .select("id, name, description, category, schema, frequency, target_job_title_names, target_employee_ids")
          .in("id", visibleIds);
        if (tplErr) throw tplErr;
        tplData = data || [];
      }

      const accessMap = new Map(accessRows.map((r) => [r.template_id, r]));
      const matched: Template[] = tplData.map((t: any) => ({
        ...t,
        can_fill: !!accessMap.get(t.id)?.can_fill,
        can_view: !!accessMap.get(t.id)?.can_view,
      }));
      setTemplates(matched);

      // Fetch my submissions for these templates
      if (matched.length) {
        // For "fill" templates show my submissions only; for "view-only" we'll
        // fetch all tenant submissions for that template (RLS allows this).
        const fillIds = matched.filter((m) => m.can_fill).map((m) => m.id);
        const viewOnlyIds = matched.filter((m) => !m.can_fill && m.can_view).map((m) => m.id);
        const queries: any[] = [];
        if (fillIds.length) {
          queries.push(
            supabase.from("employee_forms")
              .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
              .eq("employee_id", employeeId)
              .in("template_id", fillIds)
              .order("created_at", { ascending: false }),
          );
        }
        if (viewOnlyIds.length) {
          queries.push(
            supabase.from("employee_forms")
              .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
              .in("template_id", viewOnlyIds)
              .order("created_at", { ascending: false })
              .limit(50),
          );
        }
        const results = await Promise.all(queries);
        const subs = results.flatMap((r: any) => r.data || []);
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
      const { data: inserted, error } = await supabase.from("employee_forms").insert({
        employee_id: employeeId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        form_type: "dynamic_template",
        template_id: activeTemplate.id,
        title: activeTemplate.name,
        form_data: formData,
        status: "pending",
      })
      .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
      .single();
      if (error) throw error;
      toast({
        title: "تم حفظ النموذج",
        description: "يمكنك تنزيله كـ Word أو إرساله للمراجعة.",
      });
      setActiveTemplate(null);
      if (inserted) setViewSubmission(inserted as Submission);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const ensureCompanyId = async (sub: Submission): Promise<string> => {
    if (sub.company_id) return sub.company_id;
    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    return (emp as any)?.company_id;
  };

  const exportPdf = async (sub: Submission, downloadOnly = false): Promise<string | null> => {
    if (!printRef.current) return null;
    setExporting(true);
    try {
      const companyId = await ensureCompanyId(sub);
      if (!companyId) throw new Error("لم يتم العثور على الشركة");
      const { blob, signedUrl } = await exportEmployeeFormPdf({
        element: printRef.current,
        formId: sub.id,
        companyId,
        fileName: sub.title || "form",
      });
      if (downloadOnly) {
        downloadBlob(blob, `${sanitizeExportFileName(sub.title || "نموذج")}.pdf`);
        toast({ title: "تم تنزيل النموذج" });
      }
      // refresh submissions to pick up pdf_url
      fetchData();
      return signedUrl;
    } catch (e: any) {
      toast({ title: "فشل تصدير PDF", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setExporting(false);
    }
  };

  const exportWord = (sub: Submission) => {
    const tpl = templates.find((t) => t.id === sub.template_id);
    downloadEmployeeFormWord({
      title: sub.title || tpl?.name || "نموذج",
      createdAt: sub.created_at,
      schema: tpl?.schema as any,
      data: sub.form_data,
    });
    toast({ title: "تم تنزيل ملف Word" });
  };

  const submitForReview = async (sub: Submission) => {
    try {
      const { error } = await supabase
        .from("employee_forms")
        .update({ workflow_status: "submitted", current_approver_role: "management" })
        .eq("id", sub.id);
      if (error) throw error;
      toast({ title: "تم إرسال النموذج للمراجعة" });
      fetchData();
      setViewSubmission((prev) => prev ? { ...prev, workflow_status: "submitted" } : prev);
    } catch (e: any) {
      toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" });
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

  const fillTemplates = templates.filter((t) => t.can_fill);
  const viewTemplates = templates.filter((t) => !t.can_fill && t.can_view);

  return (
    <div className="space-y-2" dir="rtl">
      {fillTemplates.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            📝 نماذج للتعبئة
            <span className="mr-2 text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
              {fillTemplates.length}
            </span>
          </h3>
          <div className="space-y-2">
            {renderTemplateList(fillTemplates, false)}
          </div>
        </>
      )}

      {viewTemplates.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 mt-4">
            👁️ نماذج للاطلاع
            <span className="mr-2 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
              {viewTemplates.length}
            </span>
          </h3>
          <div className="space-y-2">
            {renderTemplateList(viewTemplates, true)}
          </div>
        </>
      )}

      {/* Fill template — mobile uses a full-screen overlay (Dialog has issues inside the employee PWA) */}
      {isMobile && activeTemplate && (
        <div
          className="fixed inset-0 z-[100] bg-background flex flex-col"
          dir="rtl"
          style={{ height: "100dvh" }}
        >
          <header className="flex items-center justify-between px-4 h-14 border-b bg-card shrink-0 sticky top-0">
            <button
              type="button"
              onClick={() => setActiveTemplate(null)}
              className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold truncate px-2">{activeTemplate.name}</h1>
            <div className="w-9" />
          </header>
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
            style={{
              WebkitOverflowScrolling: "touch",
              paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {isManager && (
              <div className="mb-4">
                <FormSectionAssignmentsPanel
                  mode="template"
                  templateId={activeTemplate.id}
                  schema={activeTemplate.schema as any}
                />
              </div>
            )}
            <DynamicFormRenderer
              schema={activeTemplate.schema}
              draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
              submitting={submitting}
              onSubmit={handleSubmit}
              onSaveDraft={() => {}}
            />
          </div>
        </div>
      )}

      <Dialog open={!isMobile && !!activeTemplate} onOpenChange={(o) => !o && setActiveTemplate(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{activeTemplate?.name}</DialogTitle>
            {activeTemplate?.description && (
              <p className="text-xs text-muted-foreground text-right">{activeTemplate.description}</p>
            )}
          </DialogHeader>
          {activeTemplate && (
            <>
              {isManager && (
                <div className="mb-4">
                  <FormSectionAssignmentsPanel
                    mode="template"
                    templateId={activeTemplate.id}
                    schema={activeTemplate.schema as any}
                  />
                </div>
              )}
              <DynamicFormRenderer
                schema={activeTemplate.schema}
                draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
                submitting={submitting}
                onSubmit={handleSubmit}
                onSaveDraft={() => {}}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View past submission — mobile full-screen */}
      {isMobile && viewSubmission && (() => {
        const tpl = templates.find((t) => t.id === viewSubmission.template_id);
        return (
          <div
            className="fixed inset-0 z-[100] bg-background flex flex-col"
            dir="rtl"
            style={{ height: "100dvh" }}
          >
            <header className="flex items-center justify-between px-4 h-14 border-b bg-card shrink-0 sticky top-0">
              <button
                type="button"
                onClick={() => setViewSubmission(null)}
                className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
              <h1 className="text-base font-bold truncate px-2">
                {viewSubmission.title || "نموذج"} — {new Date(viewSubmission.created_at).toLocaleDateString("ar")}
              </h1>
              <FormStatusBadge status={viewSubmission.workflow_status || "draft"} />
            </header>
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
              style={{
                WebkitOverflowScrolling: "touch",
                paddingBottom: "calc(48px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {tpl ? (
                <div ref={printRef} className="bg-background text-foreground p-5 rounded-lg border border-border shadow-sm">
                  <div className="border-b-4 border-primary pb-3 mb-4 text-center">
                    <h2 className="text-xl font-bold text-foreground">{viewSubmission.title || tpl.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(viewSubmission.created_at).toLocaleDateString("ar")}</p>
                  </div>
                  <DynamicTemplateView schema={tpl.schema as any} data={viewSubmission.form_data} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">القالب غير متاح.</p>
              )}
              {renderSubmissionActions(viewSubmission)}
            </div>
          </div>
        );
      })()}

      <Dialog open={!isMobile && !!viewSubmission} onOpenChange={(o) => !o && setViewSubmission(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 flex-wrap">
              <span>{viewSubmission?.title || "نموذج"} — {viewSubmission && new Date(viewSubmission.created_at).toLocaleDateString("ar")}</span>
              {viewSubmission && <FormStatusBadge status={viewSubmission.workflow_status || "draft"} />}
            </DialogTitle>
          </DialogHeader>
          {viewSubmission && (() => {
            const tpl = templates.find((t) => t.id === viewSubmission.template_id);
            if (!tpl) return <p className="text-sm text-muted-foreground">القالب غير متاح.</p>;
            return (
              <>
                <div ref={printRef} className="bg-background text-foreground p-6 rounded-lg border border-border shadow-sm">
                  <div className="border-b-4 border-primary pb-3 mb-5 text-center">
                    <h2 className="text-xl font-bold text-foreground">{viewSubmission.title || tpl.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(viewSubmission.created_at).toLocaleDateString("ar")}</p>
                  </div>
                  <DynamicTemplateView schema={tpl.schema as any} data={viewSubmission.form_data} />
                </div>
                {renderSubmissionActions(viewSubmission)}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {shareTarget && (
        <FormShareSheet
          open={!!shareTarget}
          onClose={() => setShareTarget(null)}
          formId={shareTarget.id}
          formTitle={shareTarget.title || "نموذج"}
          pdfUrl={shareTarget.pdf_url || null}
          companyId={shareTarget.company_id || ""}
          ensurePdf={async () => (await exportPdf(shareTarget!, false)) || ""}
        />
      )}
    </div>
  );

  function renderSubmissionActions(sub: Submission) {
    const canSubmit = (sub.workflow_status || "draft") === "draft";
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 px-1 border-t">
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => exportWord(sub)}
        >
          <FileDown className="h-4 w-4" />
          تنزيل Word
        </Button>
        {canSubmit && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => submitForReview(sub)}
          >
            <Send className="h-4 w-4" /> إرسال للمراجعة
          </Button>
        )}
      </div>
    );
  }

  function renderTemplateList(list: Template[], viewOnly: boolean) {
    return list.map((t) => {
          const meta = categoryMeta(t.category);
          const Icon = meta.icon;
          const mySubs = submissions.filter((s) => s.template_id === t.id);
          return (
            <div key={t.id} className="space-y-1">
              <button
                onClick={() => {
                  if (viewOnly) {
                    // open most-recent submission if any, else just no-op
                    if (mySubs[0]) setViewSubmission(mySubs[0]);
                  } else {
                    setActiveTemplate(t);
                  }
                }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
              >
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                  <Icon className={`h-5 w-5 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{t.name}</span>
                    {!viewOnly && (
                      <span className="text-[10px] bg-muted/70 text-muted-foreground rounded-full px-2 py-0.5 leading-none">
                        {freqEmoji(t.frequency)} {freqLabel(t.frequency)}
                      </span>
                    )}
                    {viewOnly && (
                      <span className="text-[10px] bg-muted/70 text-muted-foreground rounded-full px-2 py-0.5 leading-none">
                        👁️ اطلاع فقط
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                      {t.description}
                    </p>
                  )}
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {mySubs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    {viewOnly ? "تعبئات:" : "تعبئاتي:"}
                  </span>
                  {mySubs.slice(0, 3).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setViewSubmission(s)}
                      className="inline-flex items-center gap-1 text-[10px] bg-muted/40 hover:bg-muted/70 rounded-full px-2 py-0.5 transition-colors"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      {new Date(s.created_at).toLocaleDateString("ar")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        });
  }
}