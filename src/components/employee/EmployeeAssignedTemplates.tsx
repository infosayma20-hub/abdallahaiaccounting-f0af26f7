import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ChevronLeft, CheckCircle2, X,
  Megaphone, ClipboardList, Users, ShieldCheck, Coins, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer, { type FormSchema } from "@/components/forms/DynamicFormRenderer";
import { useIsMobile } from "@/hooks/use-mobile";

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

      // Filter client-side: match employee_id OR EXACT job_title name (after normalize).
      // Strict equality only — never substring — to prevent other employees from seeing
      // templates targeted at specific job titles (e.g. "مدير تسويق").
      const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
      const myJobs = [jobTitle, jobTitleName].filter(Boolean).map((s) => norm(s as string));
      const matched = (tplData || []).filter((t: any) => {
        const inEmps = (t.target_employee_ids || []).includes(employeeId);
        const targets = (t.target_job_title_names || []).map((n: string) => norm(n));
        const inJobs = targets.some((n: string) => myJobs.includes(n));
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
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">
        النماذج المسندة لي
        <span className="mr-2 text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
          {templates.length}
        </span>
      </h3>

      <div className="space-y-2">
        {templates.map((t) => {
          const meta = categoryMeta(t.category);
          const Icon = meta.icon;
          const mySubs = submissions.filter((s) => s.template_id === t.id);
          const lastSub = mySubs[0];
          return (
            <div key={t.id} className="space-y-1">
              <button
                onClick={() => setActiveTemplate(t)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
              >
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                  <Icon className={`h-5 w-5 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-[10px] bg-muted/70 text-muted-foreground rounded-full px-2 py-0.5 leading-none">
                      {freqEmoji(t.frequency)} {freqLabel(t.frequency)}
                    </span>
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
                  <span className="text-[10px] text-muted-foreground">تعبئاتي:</span>
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
        })}
      </div>

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
              <div className="w-9" />
            </header>
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
              style={{
                WebkitOverflowScrolling: "touch",
                paddingBottom: "calc(48px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {tpl ? (
                <DynamicFormRenderer
                  schema={tpl.schema}
                  initialData={viewSubmission.form_data}
                  readOnly
                />
              ) : (
                <p className="text-sm text-muted-foreground">القالب غير متاح.</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* View past submission dialog (read-only) — desktop only */}
      <Dialog open={!isMobile && !!viewSubmission} onOpenChange={(o) => !o && setViewSubmission(null)}>
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