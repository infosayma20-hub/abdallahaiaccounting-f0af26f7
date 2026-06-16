import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import FormStatusBadge from "@/components/employee/forms/FormStatusBadge";
import { Loader2, FileText, ChevronDown, ChevronUp, CheckCircle2, XCircle, Eye, ExternalLink, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getFreshFormPdfUrl } from "@/lib/employee-forms/pdfUrl";
import DynamicTemplateView from "@/components/employee/DynamicTemplateView";
import { downloadEmployeeFormWord } from "@/lib/employee-forms/exportFormWord";

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
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  employee_id: string;
  template_id: string | null;
  employees?: { full_name: string; branch_id: string | null } | null;
  form_templates?: { name: string; category: string; schema: any } | null;
}

export default function AdminFormsInboxPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FormRow[]>([]);
  const [filter, setFilter] = useState<"all" | "submitted" | "under_review" | "approved" | "rejected">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("employee_forms")
        .select("id,title,form_type,form_data,workflow_status,current_approver_role,pdf_url,pdf_storage_path,submitted_at,reviewed_at,review_notes,created_at,employee_id,template_id,employees:employee_id(full_name,branch_id),form_templates:template_id(name,category,schema)")
        .neq("workflow_status", "draft")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("workflow_status", filter);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data || []) as any);
    } catch (e: any) {
      toast({ title: "تعذر تحميل النماذج", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  useEffect(() => {
    const ch = supabase.channel("admin-forms-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_forms" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const setStatus = async (row: FormRow, status: "draft" | "submitted" | "under_review" | "approved" | "rejected") => {
    setBusy(row.id);
    try {
      const notes = reviewNotes[row.id] || null;
      const { error } = await supabase
        .from("employee_forms")
        .update({ workflow_status: status, review_notes: notes })
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "تم تحديث الحالة" });
      load();
    } catch (e: any) {
      toast({ title: "فشل", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

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

  const fieldLabel = (row: FormRow, key: string): string => {
    const fields = (row.form_templates?.schema as any)?.fields;
    if (Array.isArray(fields)) {
      const f = fields.find((x: any) => x?.id === key || x?.name === key || x?.key === key);
      if (f?.label) return String(f.label);
    }
    return key;
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

  const counts = {
    submitted: rows.filter((r) => r.workflow_status === "submitted").length,
    under_review: rows.filter((r) => r.workflow_status === "under_review").length,
  };

  return (
    <div
      className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> صندوق النماذج
        </h1>
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all","submitted","under_review","approved","rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f === "all" ? "الكل" : f === "submitted" ? `جديدة ${counts.submitted ? `(${counts.submitted})` : ""}`
                : f === "under_review" ? `قيد المراجعة ${counts.under_review ? `(${counts.under_review})` : ""}`
                : f === "approved" ? "معتمدة" : "مرفوضة"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد نماذج.</Card>
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
                      {r.current_approver_role && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.current_approver_role === "management" ? "للإدارة" : "لـHR"}
                        </Badge>
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

                    {r.form_templates?.schema ? (
                      <div className="rounded-lg bg-background border p-3 text-xs">
                        <DynamicTemplateView
                          schema={r.form_templates.schema}
                          data={r.form_data}
                          title={r.title || r.form_templates.name}
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-background border p-3 text-xs">
                        {Object.entries(r.form_data || {}).map(([k, v]) => (
                          <div key={k} className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-1.5 border-b last:border-0">
                            <span className="font-medium text-muted-foreground sm:min-w-[160px]">
                              {fieldLabel(r, k)}:
                            </span>
                            <span className="break-all text-foreground">
                              {v === null || v === undefined || v === ""
                                ? "—"
                                : typeof v === "object"
                                  ? JSON.stringify(v)
                                  : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {r.review_notes && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs">
                        <strong>ملاحظات سابقة:</strong> {r.review_notes}
                      </div>
                    )}

                    <Textarea
                      placeholder="ملاحظات المراجعة (اختياري)…"
                      value={reviewNotes[r.id] || ""}
                      onChange={(e) => setReviewNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                      rows={2}
                    />

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      {r.workflow_status === "submitted" && (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(r, "under_review")} disabled={busy === r.id} className="gap-1 w-full sm:w-auto">
                          <Eye className="h-4 w-4" /> بدء المراجعة
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setStatus(r, "approved")} disabled={busy === r.id} className="gap-1 bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                        <CheckCircle2 className="h-4 w-4" /> اعتماد
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setStatus(r, "rejected")} disabled={busy === r.id} className="gap-1 w-full sm:w-auto">
                        <XCircle className="h-4 w-4" /> رفض
                      </Button>
                    </div>
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