import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Forward, Loader2, CheckCircle2, Play, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Row {
  id: string;
  form_id: string;
  note: string | null;
  status: string;
  response_notes: string | null;
  created_at: string;
  assigned_by_name: string | null;
  form_title: string | null;
  form_type: string | null;
  submitter_name: string | null;
  form_snapshot: any;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "جديد", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  in_progress: { text: "قيد التنفيذ", cls: "bg-sky-100 text-sky-700 border-sky-300" },
  done: { text: "منجز", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  cancelled: { text: "ملغي", cls: "bg-muted text-muted-foreground" },
};

const TYPE_LABEL: Record<string, string> = {
  complaints: "شكاوى وملاحظات واقتراحات",
  employee_voice: "صوت الموظف",
  facility_quality: "جودة المرافق والمعدات",
  equipment_fault: "الإبلاغ عن أعطال",
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
};

const FIELD_LABEL: Record<string, string> = {
  subject: "الموضوع",
  complaint_type: "نوع الطلب",
  details: "التفاصيل",
  description: "الوصف",
  reason: "السبب",
  notes: "ملاحظات",
  branch: "الفرع",
  date: "التاريخ",
};

/** Forms/complaints forwarded to this employee by HR or management. */
export default function EmployeeFormReferralsList({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_form_referrals" as any)
      .select("id, form_id, note, status, response_notes, created_at, assigned_by_name, form_title, form_type, submitter_name, form_snapshot")
      .eq("assignee_employee_id", employeeId)
      .order("created_at", { ascending: false });
    setRows(((data as unknown) as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [employeeId]);

  const update = async (r: Row, status: string) => {
    setBusy(r.id);
    try {
      const patch: any = { status };
      const reply = (replies[r.id] ?? r.response_notes ?? "").trim();
      if (reply) patch.response_notes = reply;
      const { error } = await supabase
        .from("employee_form_referrals" as any)
        .update(patch)
        .eq("id", r.id);
      if (error) throw error;
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      toast({ title: status === "done" ? "تم وضعها كمنجزة" : "تم التحديث" });
    } catch (e: any) {
      toast({ title: "فشل التحديث", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2" dir="rtl">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Forward className="h-4 w-4 text-primary" />
        محوَّل إليّ ({rows.length})
      </h3>
      {rows.map((r) => {
        const st = STATUS[r.status] || STATUS.pending;
        const open = expanded === r.id;
        const snapshot = r.form_snapshot && typeof r.form_snapshot === "object" ? r.form_snapshot : {};
        const entries = Object.entries(snapshot).filter(
          ([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object",
        );
        return (
          <Card key={r.id} className="border-r-4 border-r-primary/70">
            <CardContent className="p-3 space-y-2">
              <button
                type="button"
                className="w-full flex items-start gap-2 text-right"
                onClick={() => setExpanded(open ? null : r.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold truncate">
                      {r.form_title || TYPE_LABEL[r.form_type || ""] || "طلب محوَّل"}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.text}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {r.assigned_by_name ? `حوّلها: ${r.assigned_by_name} • ` : ""}
                    {r.submitter_name ? `مقدّم الطلب: ${r.submitter_name} • ` : ""}
                    {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="border-t pt-2 space-y-2">
                  {r.note && (
                    <p className="text-[11px] rounded-md bg-primary/5 border border-primary/20 p-2">
                      <span className="font-semibold">ملاحظة التحويل: </span>{r.note}
                    </p>
                  )}
                  {entries.length > 0 ? (
                    <div className="rounded-md bg-muted/30 p-2 space-y-1">
                      {entries.map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[11px]">
                          <span className="text-muted-foreground shrink-0">{FIELD_LABEL[k] || k}:</span>
                          <span className="font-medium break-words">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">لا تتوفر تفاصيل إضافية.</p>
                  )}

                  <Textarea
                    value={replies[r.id] ?? r.response_notes ?? ""}
                    onChange={(e) => setReplies((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="ردّك / الإجراء المتخذ"
                    className="text-xs min-h-[60px]"
                  />

                  <div className="flex gap-2 flex-wrap">
                    {r.status !== "in_progress" && r.status !== "done" && (
                      <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" disabled={busy === r.id} onClick={() => update(r, "in_progress")}>
                        <Play className="h-3 w-3" /> بدء المتابعة
                      </Button>
                    )}
                    {r.status !== "done" && (
                      <Button size="sm" className="h-7 gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-700" disabled={busy === r.id} onClick={() => update(r, "done")}>
                        <CheckCircle2 className="h-3 w-3" /> تم الإنجاز
                      </Button>
                    )}
                    {r.status === "done" && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={busy === r.id} onClick={() => update(r, "done")}>
                        حفظ الردّ
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
