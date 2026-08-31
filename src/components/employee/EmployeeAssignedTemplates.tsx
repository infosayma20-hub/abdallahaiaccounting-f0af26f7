import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ChevronLeft, CheckCircle2, X,
  Megaphone, ClipboardList, Users, ShieldCheck, Coins, FileText, FileDown, Send,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer, { type FormSchema } from "@/components/forms/DynamicFormRenderer";
import MonthlyInventoryRenderer from "@/components/forms/MonthlyInventoryRenderer";
import MonthlyInventoryView from "@/components/forms/MonthlyInventoryView";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import FormStatusBadge from "@/components/employee/forms/FormStatusBadge";
import DynamicTemplateView from "@/components/employee/DynamicTemplateView";
import { downloadEmployeeFormWord, shareEmployeeFormViaWhatsApp } from "@/lib/employee-forms/exportFormWord";
import InlineSectionAssign from "@/components/employee/forms/InlineSectionAssign";
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
  employee_id?: string | null;
  title: string | null;
  status: string;
  workflow_status?: string | null;
  company_id?: string | null;
  created_at: string;
  form_data: Record<string, any>;
};

type ViewPeriod = "today" | "yesterday" | "week" | "month";

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
  // Submissions authored by OTHER employees that this employee is allowed to
  // view via an explicit "view" assignment (optionally restricted to a source
  // employee). Kept separate from own submissions.
  const [sharedSubs, setSharedSubs] = useState<Submission[]>([]);
  const [sharedSources, setSharedSources] = useState<Record<string, string>>({}); // templateId -> label
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeDraft, setActiveDraft] = useState<Submission | null>(null);
  const [viewSubmission, setViewSubmission] = useState<Submission | null>(null);
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("week");
  const [submitting, setSubmitting] = useState(false);

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
          .select("id, name, description, category, schema, frequency, target_job_title_names, target_employee_ids, is_system, cloned_from_template_id")
          .in("id", visibleIds);
        if (tplErr) throw tplErr;
        tplData = data || [];
      }

      const accessMap = new Map(accessRows.map((r) => [r.template_id, r]));
      // Prefer company clones: hide any system template whose company clone
      // is visible to this employee.
      const clonedFromIds = new Set(
        tplData.filter((t: any) => !t.is_system && t.cloned_from_template_id)
               .map((t: any) => t.cloned_from_template_id as string),
      );
      const visibleTpls = tplData.filter((t: any) => !(t.is_system && clonedFromIds.has(t.id)));
      const matched: Template[] = visibleTpls.map((t: any) => ({
        ...t,
        can_fill: !!accessMap.get(t.id)?.can_fill,
        can_view: !!accessMap.get(t.id)?.can_view,
      }));
      setTemplates(matched);

      // ---- Explicit "view" assignments (may also exist on fill templates) ----
      const { data: assignRows } = await supabase
        .from("form_template_assignments")
        .select("template_id, access_level, source_employee_id")
        .eq("employee_id", employeeId)
        .eq("access_level", "view")
        .eq("is_active", true);

      const viewAssignments = (assignRows || []).filter((a: any) =>
        matched.some((m) => m.id === a.template_id),
      );

      if (viewAssignments.length) {
        const sourceIds = Array.from(
          new Set(viewAssignments.map((a: any) => a.source_employee_id).filter(Boolean)),
        ) as string[];
        let nameMap = new Map<string, string>();
        if (sourceIds.length) {
          const { data: emps } = await supabase
            .from("employees")
            .select("id, full_name")
            .in("id", sourceIds);
          nameMap = new Map((emps || []).map((e: any) => [e.id, e.full_name as string]));
        }
        const labels: Record<string, string> = {};
        for (const a of viewAssignments as any[]) {
          labels[a.template_id] = a.source_employee_id
            ? (nameMap.get(a.source_employee_id) || "الموظف المحدد")
            : "الفريق";
        }
        setSharedSources(labels);

        const shared: Submission[] = [];
        for (const a of viewAssignments as any[]) {
          let q = supabase
            .from("employee_forms")
            .select("id, template_id, employee_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
            .eq("template_id", a.template_id)
            .neq("employee_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(100);
          if (a.source_employee_id) q = q.eq("employee_id", a.source_employee_id);
          const { data } = await q;
          if (data) shared.push(...(data as Submission[]));
        }
        // de-dup
        const seen = new Set<string>();
        setSharedSubs(shared.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))));
      } else {
        setSharedSources({});
        setSharedSubs([]);
      }

      // Fetch my own submissions for these templates
      if (matched.length) {
        const { data: mine } = await supabase
          .from("employee_forms")
          .select("id, template_id, employee_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
          .eq("employee_id", employeeId)
          .in("template_id", matched.map((m) => m.id))
          .order("created_at", { ascending: false });
        setSubmissions((mine as Submission[]) || []);
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

  /** A draft may only be reused when it is still an unsent draft of this template. */
  const reusableDraftId = (): string | null => {
    const d = activeDraft;
    if (!d) return null;
    if (d.template_id !== activeTemplate?.id) return null;
    if (d.status !== "pending") return null;
    if ((d.form_data as any)?.__draft !== true) return null;
    return d.id;
  };

  const handleSubmit = async (formData: Record<string, any>) => {
    if (!activeTemplate) return;
    setSubmitting(true);
    try {
      const { __draft, ...clean } = (formData || {}) as any;
      let inserted: any = null;
      const draftId = reusableDraftId();
      if (draftId) {
        // Update existing draft instead of creating a duplicate
        const { data, error } = await supabase
          .from("employee_forms")
          .update({ form_data: clean, title: activeTemplate.name })
          .eq("id", draftId)
          .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
          .single();
        if (error) throw error;
        inserted = data;
      } else {
        const { data, error } = await supabase.from("employee_forms").insert({
          employee_id: employeeId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          form_type: "dynamic_template",
          template_id: activeTemplate.id,
          title: activeTemplate.name,
          form_data: clean,
          status: "pending",
        })
        .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
        .single();
        if (error) throw error;
        inserted = data;
      }
      toast({
        title: "تم حفظ النموذج",
        description: "يمكنك تنزيله كـ Word أو إرساله للمراجعة.",
      });
      setActiveTemplate(null);
      setActiveDraft(null);
      if (inserted) setViewSubmission(inserted as Submission);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Persist DRAFT to DB (not just localStorage). Critical: previous behaviour
  // only stored draft locally → if user changed device/browser or cleared cache,
  // edits were lost even though a "تم الحفظ" toast appeared.
  const handleSaveDraft = async (formData: Record<string, any>) => {
    if (!activeTemplate) return;
    try {
      const payload = { ...(formData || {}), __draft: true };
      let saved: any = null;
      const draftId = reusableDraftId();
      if (draftId) {
        const { data, error } = await supabase
          .from("employee_forms")
          .update({ form_data: payload, title: activeTemplate.name, workflow_status: "draft" })
          .eq("id", draftId)
          .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from("employee_forms").insert({
          employee_id: employeeId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          form_type: "dynamic_template",
          template_id: activeTemplate.id,
          title: activeTemplate.name,
          form_data: payload,
          status: "pending",
          workflow_status: "draft",
        })
        .select("id, template_id, title, status, workflow_status, pdf_url, company_id, created_at, form_data")
        .single();
        if (error) throw error;
        saved = data;
      }
      // Verify the row really exists on the server before claiming success.
      const { data: verify, error: vErr } = await supabase
        .from("employee_forms")
        .select("id")
        .eq("id", saved?.id)
        .maybeSingle();
      if (vErr || !verify) throw new Error("لم يتم تأكيد الحفظ على السيرفر، حاول مرة أخرى");
      setActiveDraft(saved as Submission);
      toast({ title: "تم حفظ المسودة في السيرفر ✅", description: "تقدر تكمّل من أي جهاز." });
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر حفظ المسودة", description: err.message, variant: "destructive" });
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

  const shareWhatsApp = async (sub: Submission) => {
    const tpl = templates.find((t) => t.id === sub.template_id);
    try {
      const res = await shareEmployeeFormViaWhatsApp({
        title: sub.title || tpl?.name || "نموذج",
        createdAt: sub.created_at,
        schema: tpl?.schema as any,
        data: sub.form_data,
      });
      if (res.method === "native") toast({ title: "تمت المشاركة" });
      else if (res.method === "fallback") toast({ title: "تم تنزيل الملف", description: "أرفقه يدوياً في واتساب." });
    } catch (e: any) {
      toast({ title: "تعذرت المشاركة", description: e.message, variant: "destructive" });
    }
  };

  const previewWordFromDraft = (data: Record<string, any>) => {
    if (!activeTemplate) return;
    downloadEmployeeFormWord({
      title: activeTemplate.name,
      schema: activeTemplate.schema as any,
      data,
    });
    toast({ title: "تم تنزيل ملف Word", description: "هاد ملف معاينة قبل الإرسال." });
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
          style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <header className="relative z-[130] flex items-center justify-between px-3 h-14 border-b bg-card shrink-0 sticky top-0 pointer-events-auto">
            <button
              type="button"
              onClick={() => { setActiveTemplate(null); setActiveDraft(null); }}
              className="h-11 w-11 -m-1 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition touch-manipulation"
              aria-label="إغلاق"
            >
              <X className="h-6 w-6" />
            </button>
            <h1 className="text-base font-bold truncate px-2">
              {activeTemplate.name}
              {activeDraft && <span className="mr-2 text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">استكمال مسودة</span>}
            </h1>
            <div className="w-11 shrink-0" />
          </header>
          <div
            className="flex-1 flex flex-col overflow-hidden overscroll-contain px-4 pt-4 min-h-0"
            style={{
              WebkitOverflowScrolling: "touch",
            }}
          >
            {((activeTemplate.schema as any)?.kind === "monthly_inventory" || /جرد\s*شهري/.test(activeTemplate.name || "")) ? (
              <MonthlyInventoryRenderer
                employeeId={employeeId}
                templateId={activeTemplate.id}
                draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
                initialData={activeDraft?.form_data}
                submitting={submitting}
                onSubmit={handleSubmit}
                onSaveDraft={handleSaveDraft}
              />
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0">
                <DynamicFormRenderer
                  schema={activeTemplate.schema}
                  draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
                  initialData={activeDraft?.form_data}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  onSaveDraft={handleSaveDraft}
                  onPreviewWord={previewWordFromDraft}
                  renderSectionExtras={
                    isManager
                      ? (sec) => (
                          <InlineSectionAssign
                            templateId={activeTemplate.id}
                            sectionKey={sec.key}
                            sectionTitle={sec.title}
                          />
                        )
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!isMobile && !!activeTemplate} onOpenChange={(o) => { if (!o) { setActiveTemplate(null); setActiveDraft(null); } }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] flex flex-col overflow-hidden" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{activeTemplate?.name}</DialogTitle>
            {activeTemplate?.description && (
              <p className="text-xs text-muted-foreground text-right">{activeTemplate.description}</p>
            )}
          </DialogHeader>
          {activeTemplate && (
            <>
              {((activeTemplate.schema as any)?.kind === "monthly_inventory" || /جرد\s*شهري/.test(activeTemplate.name || "")) ? (
                <div className="flex-1 overflow-hidden min-h-0">
                  <MonthlyInventoryRenderer
                    employeeId={employeeId}
                    templateId={activeTemplate.id}
                    draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
                    initialData={activeDraft?.form_data}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onSaveDraft={handleSaveDraft}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <DynamicFormRenderer
                    schema={activeTemplate.schema}
                    draftKey={`tpl-${activeTemplate.id}-emp-${employeeId}`}
                    initialData={activeDraft?.form_data}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onSaveDraft={handleSaveDraft}
                    onPreviewWord={previewWordFromDraft}
                    renderSectionExtras={
                      isManager
                        ? (sec) => (
                            <InlineSectionAssign
                              templateId={activeTemplate.id}
                              sectionKey={sec.key}
                              sectionTitle={sec.title}
                            />
                          )
                        : undefined
                    }
                  />
                </div>
              )}
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
            style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <header className="relative z-[130] flex items-center justify-between px-3 h-14 border-b bg-card shrink-0 sticky top-0 pointer-events-auto">
              <button
                type="button"
                onClick={() => setViewSubmission(null)}
                className="h-11 w-11 -m-1 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition touch-manipulation"
                aria-label="إغلاق"
              >
                <X className="h-6 w-6" />
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
                <div className="bg-background text-foreground p-5 rounded-lg border border-border shadow-sm">
                  <div className="border-b-4 border-primary pb-3 mb-4 text-center">
                    <h2 className="text-xl font-bold text-foreground">{viewSubmission.title || tpl.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(viewSubmission.created_at).toLocaleDateString("ar")}</p>
                  </div>
                  {((tpl.schema as any)?.kind === "monthly_inventory" || /جرد\s*شهري/.test(tpl.name || "")) ? (
                    <MonthlyInventoryView data={viewSubmission.form_data} />
                  ) : (
                    <DynamicTemplateView schema={tpl.schema as any} data={viewSubmission.form_data} />
                  )}
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
                <div className="bg-background text-foreground p-6 rounded-lg border border-border shadow-sm">
                  <div className="border-b-4 border-primary pb-3 mb-5 text-center">
                    <h2 className="text-xl font-bold text-foreground">{viewSubmission.title || tpl.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(viewSubmission.created_at).toLocaleDateString("ar")}</p>
                  </div>
                  {((tpl.schema as any)?.kind === "monthly_inventory" || /جرد\s*شهري/.test(tpl.name || "")) ? (
                    <MonthlyInventoryView data={viewSubmission.form_data} />
                  ) : (
                    <DynamicTemplateView schema={tpl.schema as any} data={viewSubmission.form_data} />
                  )}
                </div>
                {renderSubmissionActions(viewSubmission)}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
        <Button
          size="sm"
          variant="outline"
          className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          onClick={() => shareWhatsApp(sub)}
        >
          <MessageCircle className="h-4 w-4" />
          مشاركة واتساب
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
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const startOfPeriod = (() => {
            if (viewPeriod === "today") return startOfToday;
            if (viewPeriod === "yesterday") {
              const date = new Date(startOfToday);
              date.setDate(date.getDate() - 1);
              return date;
            }
            if (viewPeriod === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
            const date = new Date(startOfToday);
            date.setDate(date.getDate() - 6);
            return date;
          })();
          const endOfPeriod = viewPeriod === "yesterday" ? startOfToday : null;
          const inPeriod = (createdAtStr: string) => {
            const createdAt = new Date(createdAtStr);
            return createdAt >= startOfPeriod && (!endOfPeriod || createdAt < endOfPeriod);
          };
          const visibleSubs = mySubs.filter((s) => inPeriod(s.created_at));
          const sharedLabel = sharedSources[t.id];
          const templateShared = sharedSubs.filter((s) => s.template_id === t.id);
          const visibleShared = templateShared.filter((s) => inPeriod(s.created_at));
          // A real draft is one explicitly marked by "حفظ مسودة" (__draft flag)
          // AND still pending. NOTE: workflow_status defaults to 'draft' on every
          // row, so it must NEVER be used to detect drafts — doing so made an
          // already-approved submission be re-opened and overwritten silently.
          const draftSub = mySubs.find(
            (s) => s.status === "pending" && (s.form_data as any)?.__draft === true,
          );

          return (
            <div key={t.id} className="space-y-1">
              <button
                onClick={() => {
                  if (viewOnly) {
                    if (visibleShared[0]) setViewSubmission(visibleShared[0]);
                    else if (visibleSubs[0]) setViewSubmission(visibleSubs[0]);
                  } else {

                    // If there's an existing draft, resume it instead of creating a new blank form
                    if (draftSub) {
                      setActiveDraft(draftSub);
                    } else {
                      setActiveDraft(null);
                    }
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
                    {!viewOnly && draftSub && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 leading-none">
                        📝 مسودة محفوظة
                      </span>
                    )}
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

              {(viewOnly || !!sharedLabel) && (
                <div className="space-y-2 px-1 pt-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    👁️ تقارير {sharedLabel || "الفريق"}
                  </p>
                  <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted/50 p-1" aria-label="تصفية التقارير حسب التاريخ">
                    {([
                      ["today", "اليوم"],
                      ["yesterday", "أمس"],
                      ["week", "آخر 7 أيام"],
                      ["month", "الشهر"],
                    ] as const).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={viewPeriod === value ? "default" : "ghost"}
                        className="h-8 px-1 text-[10px]"
                        onClick={() => setViewPeriod(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {visibleShared.length ? (
                    <div className="space-y-1.5">
                      {visibleShared.map((submission) => (
                        <Button
                          key={submission.id}
                          type="button"
                          variant="outline"
                          className="h-auto w-full justify-between px-3 py-2 text-right"
                          onClick={() => setViewSubmission(submission)}
                        >
                          <span className="min-w-0 truncate text-xs font-medium">
                            تقرير {sharedLabel || "الفريق"}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {new Date(submission.created_at).toLocaleString("ar-PS", {
                              day: "numeric",
                              month: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      لا توجد تقارير {sharedLabel ? `لـ ${sharedLabel}` : ""} في هذه الفترة
                    </p>
                  )}
                </div>
              )}


              {!viewOnly && mySubs.length > 0 && (
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
                      <CheckCircle2 className={`h-2.5 w-2.5 ${((s.workflow_status||'draft')==='draft') ? 'text-amber-500' : 'text-emerald-500'}`} />
                      {new Date(s.created_at).toLocaleDateString("ar")}
                      {(s.workflow_status||'draft')==='draft' && <span className="text-amber-700">(مسودة)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        });
  }
}