import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History } from "lucide-react";

type AuditRow = {
  id: string;
  action: string;
  notes: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  created: "إنشاء النموذج",
  submitted: "تقديم النموذج",
  approved: "موافقة",
  rejected: "رفض",
  pending: "بانتظار المراجعة",
  final_decision: "قرار الإدارة النهائي",
  hr_recommendation_approve: "توصية الموارد البشرية: اعتماد",
  hr_recommendation_reject: "توصية الموارد البشرية: رفض",
  management_seen: "اطلاع الإدارة",
  employee_acknowledged: "إقرار الموظف بالاستلام",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "مدير النظام",
  admin: "الإدارة",
  hr_manager: "الموارد البشرية",
  employee: "موظف",
};

const label = (a: string) =>
  ACTION_LABELS[a] || (a.startsWith("workflow_") ? `تغيير الحالة: ${a.replace("workflow_", "")}` : a);

export default function FormAuditTrail({ formId }: { formId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employee_form_audit_log")
        .select("id, action, notes, actor_name, actor_email, actor_role, created_at, metadata")
        .eq("form_id", formId)
        .order("created_at", { ascending: true });
      if (active) {
        setRows((data as AuditRow[]) || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [formId]);

  return (
    <div className="rounded-xl border bg-muted/30 p-3" dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold">سجل التدقيق — من قام بالإجراء</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">لا يوجد سجل مسجّل لهذا النموذج.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="text-[11px] border-r-2 border-primary/40 pr-2">
              <div className="font-medium">{label(r.action)}</div>
              <div className="text-muted-foreground">
                بواسطة: {r.actor_name || r.actor_email || "غير معروف"}
                {r.actor_role ? ` — ${ROLE_LABELS[r.actor_role] || r.actor_role}` : ""}
              </div>
              <div className="text-muted-foreground" dir="ltr">
                {r.created_at ? new Date(r.created_at).toLocaleString("ar-EG") : "—"}
              </div>
              {r.notes ? <div className="mt-0.5">ملاحظة: {r.notes}</div> : null}
              {(r.metadata as { backfilled?: boolean } | null)?.backfilled ? (
                <div className="text-[10px] text-amber-600">سجل تاريخي (مستخرج من بيانات المراجعة السابقة)</div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
