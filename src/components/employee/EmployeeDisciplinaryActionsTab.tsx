import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gavel, ChevronLeft, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  decodeHRMessage, displayReason, penaltyLabel, typeColor, typeLabel,
  STATUS_LABELS, type HRMessageMeta,
} from "@/lib/hrMessages";

interface Props { employeeId: string; }

type ActionRow = {
  id: string;
  source: "correction_requests" | "employee_forms";
  date: string;            // display
  created_at: string;
  status: string;
  reviewed_at?: string | null;
  review_notes?: string | null;
  reviewer?: string | null;
  attachment_url?: string | null;
  meta?: HRMessageMeta | null;
  reason_text?: string;    // displayable reason
  form_data?: any;
};

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG-u-ca-gregory"); } catch { return String(d); }
}

export default function EmployeeDisciplinaryActionsTab({ employeeId }: Props) {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActionRow | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      // 1. Penalties / HR messages stored in correction_requests for this employee
      const corrPromise = supabase
        .from("correction_requests")
        .select("id, attendance_date, request_type, reason, status, reviewed_at, review_notes, created_at, reviewed_by")
        .eq("employee_id", employeeId)
        .in("request_type", ["penalty", "hr_message"])
        .order("created_at", { ascending: false })
        .limit(100);

      // 2. disciplinary_action submitted via employee_forms targeting this employee
      const formsPromise = supabase
        .from("employee_forms")
        .select("id, status, review_notes, reviewed_at, attachment_url, form_data, created_at")
        .eq("form_type", "disciplinary_action")
        .or(`employee_id.eq.${employeeId},form_data->>employee_id.eq.${employeeId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      const [corrRes, formsRes] = await Promise.all([corrPromise, formsPromise]);
      if (cancel) return;

      const out: ActionRow[] = [];

      for (const r of (corrRes.data as any[]) || []) {
        const meta = decodeHRMessage(r.reason);
        // Only treat as disciplinary if penalty OR meta.type indicates warning/penalty
        const isPenalty = r.request_type === "penalty" || meta?.type === "penalty" || meta?.type === "warning";
        if (!isPenalty) continue;
        out.push({
          id: `c_${r.id}`,
          source: "correction_requests",
          date: meta?.violation_date || r.attendance_date || r.created_at,
          created_at: r.created_at,
          status: r.status || "pending",
          reviewed_at: r.reviewed_at,
          review_notes: r.review_notes,
          attachment_url: meta?.attachment_url,
          meta,
          reason_text: displayReason(r.reason),
        });
      }

      for (const r of (formsRes.data as any[]) || []) {
        out.push({
          id: `f_${r.id}`,
          source: "employee_forms",
          date: r.form_data?.violation_date || r.form_data?.date || r.created_at,
          created_at: r.created_at,
          status: r.status || "pending",
          reviewed_at: r.reviewed_at,
          review_notes: r.review_notes,
          attachment_url: r.attachment_url,
          form_data: r.form_data,
          reason_text: r.form_data?.description || r.form_data?.reason || "",
        });
      }

      out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setRows(out);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [employeeId]);

  return (
    <div className="space-y-3 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <Gavel className="h-5 w-5 text-rose-500" />
        الإجراءات ({rows.length})
      </h2>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center space-y-2">
            <Gavel className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">لا توجد إجراءات بحقّك</p>
            <p className="text-[11px] text-muted-foreground/70">سجل نظيف ✨</p>
          </CardContent>
        </Card>
      ) : (
        rows.map((r) => {
          const tLabel = r.meta?.type ? typeLabel(r.meta.type) :
                          (r.source === "employee_forms" ? "إجراء عقابي" : "إجراء");
          const subLabel = r.meta?.penalty_kind ? penaltyLabel(r.meta.penalty_kind) :
                          (r.form_data?.action_type || r.form_data?.type || "");
          return (
            <button key={r.id} type="button" onClick={() => { setSelected(r); setOpen(true); }} className="w-full text-right">
              <Card className="border-border bg-card hover:bg-accent/30 active:scale-[0.99] transition-colors">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className={`text-[10px] ${r.meta ? typeColor(r.meta.type) : "bg-rose-600 text-white"}`}>{tLabel}</Badge>
                      {subLabel && <span className="text-xs font-medium truncate">{subLabel}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{fmt(r.date)}</span>
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[r.status] || r.status}</Badge>
                    </div>
                  </div>
                  {r.reason_text && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">{r.reason_text}</p>
                  )}
                  <div className="flex items-center justify-end">
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-4" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center justify-between">
                  <span>{selected.meta?.subject || (selected.source === "employee_forms" ? "إجراء عقابي" : "إجراء")}</span>
                  <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[selected.status] || selected.status}</Badge>
                </DialogTitle>
              </DialogHeader>

              <section className="rounded-lg border border-border bg-card/50 mt-2 divide-y divide-border">
                <Row label="التاريخ" value={fmt(selected.date)} />
                {selected.meta?.type && <Row label="النوع" value={typeLabel(selected.meta.type)} />}
                {selected.meta?.penalty_kind && <Row label="نوع الإجراء" value={penaltyLabel(selected.meta.penalty_kind)} />}
                {selected.meta?.effective_date && <Row label="تاريخ التنفيذ" value={fmt(selected.meta.effective_date)} />}
                {selected.meta?.violation_date && <Row label="تاريخ المخالفة" value={fmt(selected.meta.violation_date)} />}
                {selected.form_data?.action_type && <Row label="نوع الإجراء" value={selected.form_data.action_type} />}
                {selected.reviewed_at && <Row label="تاريخ المراجعة" value={fmt(selected.reviewed_at)} />}
              </section>

              {selected.reason_text && (
                <section className="mt-3 rounded-lg border border-border bg-card/50">
                  <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">الوصف / السبب</div>
                  <p className="px-3 py-2 text-xs whitespace-pre-wrap">{selected.reason_text}</p>
                </section>
              )}

              {selected.review_notes && (
                <section className="mt-3 rounded-lg border border-border bg-card/50">
                  <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">ملاحظات المراجعة</div>
                  <p className="px-3 py-2 text-xs whitespace-pre-wrap">{selected.review_notes}</p>
                </section>
              )}

              {selected.attachment_url && (
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <a href={selected.attachment_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3 ml-1" /> فتح المرفق
                  </a>
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
