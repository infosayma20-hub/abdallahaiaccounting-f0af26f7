import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import RequestDetailsDialog from "./RequestDetailsDialog";
import EmployeeAssignedSectionsList from "./EmployeeAssignedSectionsList";
import EmployeeFormReferralsList from "./EmployeeFormReferralsList";
import {
  getRequestTitle,
  getRequestSummary,
  getStatusBadgeFor,
  AnyRequest,
} from "@/lib/employeeRequestDisplay";
import { tLeaveType } from "@/lib/hrLabels";

interface Props {
  employeeId: string;
}

export default function EmployeeMyRequestsTab({ employeeId }: Props) {
  const [submissions, setSubmissions] = useState<AnyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnyRequest | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [formsRes, leavesRes] = await Promise.all([
        supabase
          .from("employee_forms")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(50),
        // HR-managed leaves (`employee_leaves`) are the authoritative record:
        // any edit/delete done on the HR screen must show here too.
        supabase
          .from("employee_leaves")
          .select("id, leave_type, start_date, end_date, days_count, status, notes, review_notes, created_at, updated_at")
          .eq("employee_id", employeeId)
          .order("start_date", { ascending: false })
          .limit(50),
      ]);
      const forms = ((formsRes.data as any[]) || []);
      const hrLeaves = ((leavesRes.data as any[]) || []).map((l) => ({
        id: `lv-${l.id}`,
        form_type: "leave_request",
        status: l.status,
        created_at: l.created_at,
        review_notes: l.review_notes || null,
        form_data: {
          leave_type: l.leave_type,
          from_date: l.start_date,
          to_date: l.end_date,
          days_count: l.days_count,
          reason: l.notes || null,
        },
      })) as AnyRequest[];
      // Drop the original request form when an HR leave record covers the same
      // period/type (overlap, not exact match) so edited dates aren't duplicated.
      const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string) =>
        aFrom <= bTo && bFrom <= aTo;
      const norm = (t: any) => String(t || "").trim();
      const filteredForms = forms.filter((f: any) => {
        if (f.form_type !== "leave_request") return true;
        const from = f.form_data?.from_date || f.form_data?.start_date;
        const to = f.form_data?.to_date || f.form_data?.end_date || from;
        if (!from) return true;
        return !((leavesRes.data as any[]) || []).some(
          (l) =>
            norm(l.leave_type) === norm(f.form_data?.leave_type) &&
            overlaps(from, to, l.start_date, l.end_date),
        );
      });
      const merged = [...filteredForms, ...hrLeaves].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      setSubmissions(merged as any);
      setLoading(false);
    };
    fetch();
  }, [employeeId]);

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <EmployeeFormReferralsList employeeId={employeeId} />

      <EmployeeAssignedSectionsList employeeId={employeeId} />

      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        طلباتي السابقة ({submissions.length})
      </h2>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
        </div>
      ) : submissions.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا يوجد طلبات سابقة</p>
          </CardContent>
        </Card>
      ) : (
        submissions.map(sub => {
          const st = getStatusBadgeFor(sub);
          const leaveType = sub.form_data?.leave_type;
          const leaveLabel = sub.form_type === "leave_request" && leaveType ? tLeaveType(leaveType) : null;
          const summary = getRequestSummary(sub);

          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => { setSelected(sub); setOpen(true); }}
              className="w-full text-right"
            >
              <Card className="border-border bg-card hover:bg-accent/30 transition-colors active:scale-[0.99]">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold truncate">{getRequestTitle(sub)}</span>
                      {leaveLabel && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{leaveLabel}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {sub.created_at ? format(new Date(sub.created_at), "dd/MM/yyyy") : "—"}
                      </span>
                      <Badge variant={st.variant} className="text-[10px]">{st.emoji} {st.text}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground truncate">{summary}</p>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  {sub.review_notes && (
                    <p className="text-xs text-primary bg-primary/5 rounded-lg p-2 line-clamp-2">💬 {sub.review_notes}</p>
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })
      )}

      <RequestDetailsDialog request={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
