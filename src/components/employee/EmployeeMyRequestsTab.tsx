import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import RequestDetailsDialog from "./RequestDetailsDialog";
import EmployeeAssignedSectionsList from "./EmployeeAssignedSectionsList";
import {
  getRequestTitle,
  getRequestSummary,
  getStatusBadge,
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
      const { data } = await supabase
        .from("employee_forms")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50);
      setSubmissions((data as any) || []);
      setLoading(false);
    };
    fetch();
  }, [employeeId]);

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
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
          const st = getStatusBadge(sub.status);
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
