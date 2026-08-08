import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gavel, ExternalLink } from "lucide-react";
import {
  decodeHRMessage, displayReason, penaltyLabel, typeColor, typeLabel,
  type HRMessageMeta,
} from "@/lib/hrMessages";

type PendingItem = {
  source: "correction_requests" | "employee_forms";
  id: string;
  created_at: string;
  date?: string | null;
  subject: string;
  reason_text: string;
  meta?: HRMessageMeta | null;
  action_type?: string | null;
  attachment_url?: string | null;
};

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG-u-ca-gregory"); } catch { return String(d); }
}

interface Props {
  employeeId: string;
  authUserId: string;
}

/**
 * Blocking, one-time notification shown the first time an employee opens their
 * home screen after HR/manager files a disciplinary action (penalty, HR
 * message, or disciplinary_action form). Employee must tap "اطلعت" to dismiss;
 * the acknowledgement is stored server-side so it never re-appears.
 */
export default function DisciplinaryNotificationGate({ employeeId, authUserId }: Props) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [current, setCurrent] = useState<PendingItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  const load = useCallback(async () => {
    const [corrRes, formsRes] = await Promise.all([
      supabase
        .from("correction_requests")
        .select("id, request_type, reason, attendance_date, created_at")
        .eq("auth_user_id", authUserId)
        .in("request_type", ["penalty", "hr_message"])
        .is("employee_acknowledged_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("employee_forms")
        .select("id, form_data, attachment_url, created_at")
        .eq("employee_id", employeeId)
        .eq("form_type", "disciplinary_action")
        // Employee is notified only after management's binding final decision
        .eq("status", "approved")
        .not("final_decided_at", "is", null)
        .is("employee_acknowledged_at", null)
        .order("created_at", { ascending: true }),
    ]);

    const list: PendingItem[] = [];
    for (const r of (corrRes.data as any[]) || []) {
      const meta = decodeHRMessage(r.reason);
      // Only surface true disciplinary items (not generic HR chatter without type)
      const isDisciplinary =
        r.request_type === "penalty" ||
        meta?.type === "penalty" ||
        meta?.type === "warning";
      if (!isDisciplinary) continue;
      list.push({
        source: "correction_requests",
        id: r.id,
        created_at: r.created_at,
        date: meta?.violation_date || r.attendance_date || r.created_at,
        subject: meta?.subject || (meta?.type ? typeLabel(meta.type) : "إجراء عقابي"),
        reason_text: displayReason(r.reason) || "",
        meta,
        attachment_url: meta?.attachment_url,
      });
    }
    for (const r of (formsRes.data as any[]) || []) {
      list.push({
        source: "employee_forms",
        id: r.id,
        created_at: r.created_at,
        date: r.form_data?.violation_date || r.form_data?.date || r.created_at,
        subject: r.form_data?.subject || r.form_data?.title || "إجراء عقابي",
        reason_text: r.form_data?.description || r.form_data?.reason || "",
        action_type: r.form_data?.action_type || r.form_data?.type || null,
        attachment_url: r.attachment_url,
      });
    }
    list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    setItems(list);
    setCurrent(list[0] || null);
  }, [employeeId, authUserId]);

  useEffect(() => {
    load();
    // Realtime: if HR files a new penalty while the employee is on the home
    // screen, surface it immediately without waiting for a page refresh.
    const channel = supabase
      .channel(`disciplinary-gate-${employeeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "correction_requests", filter: `employee_id=eq.${employeeId}` },
        () => { load(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_forms", filter: `employee_id=eq.${employeeId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId, load]);

  const acknowledge = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await supabase.rpc("acknowledge_disciplinary", {
        p_source: current.source,
        p_id: current.id,
      });
      const rest = items.filter((x) => !(x.source === current.source && x.id === current.id));
      setItems(rest);
      setCurrent(rest[0] || null);
    } finally {
      setSaving(false);
    }
  };

  if (!current || snoozed) return null;

  const typeBadge = current.meta?.type ? typeLabel(current.meta.type) : "إجراء عقابي";
  const badgeColor = current.meta ? typeColor(current.meta.type) : "bg-rose-600 text-white";
  const subLabel = current.meta?.penalty_kind ? penaltyLabel(current.meta.penalty_kind) : (current.action_type || "");

  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-w-md flex flex-col max-h-[85dvh] p-0 gap-0 overflow-hidden"
        dir="rtl"
      >
        <AlertDialogHeader className="shrink-0 p-4 pb-2 border-b border-border">
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-5 w-5 text-rose-500" />
            إشعار إداري جديد
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            إشعار إداري بحاجة إلى اطّلاعك
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pt-3">
            <div className="space-y-3 text-right">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-[11px] ${badgeColor}`}>{typeBadge}</Badge>
                {subLabel && <span className="text-xs font-medium">{subLabel}</span>}
                <span className="text-[11px] text-muted-foreground ms-auto">{fmt(current.date)}</span>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-xs font-semibold mb-1">{current.subject}</div>
                {current.reason_text ? (
                  <p className="text-xs whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                    {current.reason_text}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">لا توجد تفاصيل إضافية.</p>
                )}
              </div>

              {current.attachment_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={current.attachment_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3 ml-1" /> فتح المرفق
                  </a>
                </Button>
              )}

              {items.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  لديك {items.length} إشعارات بحاجة اطّلاع.
                </p>
              )}
            </div>
        </div>

        <AlertDialogFooter className="shrink-0 flex-row gap-2 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setSnoozed(true)}
          >
            لاحقاً
          </Button>
          <AlertDialogAction className="flex-1" disabled={saving} onClick={(e) => { e.preventDefault(); acknowledge(); }}>
            {saving ? "جاري الحفظ…" : "اطّلعت"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}