import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { typeLabel, penaltyLabel, STATUS_LABELS } from "@/lib/hrMessages";
import type { LinkedActionRow } from "@/hooks/hr/useEmployeeLinkedActions";

export function LinkedActionBody({ row }: { row: LinkedActionRow }) {
  const meta = row.meta;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {[
          ["التاريخ", row.attendance_date],
          ["أُرسلت في", new Date(row.created_at).toLocaleString("ar")],
          ["المُصدِر", [meta?.issued_by_name, meta?.issued_by_role].filter(Boolean).join(" — ") || "غير مسجَّل"],
          ["نوع الإجراء", meta?.penalty_kind ? penaltyLabel(meta.penalty_kind) : "—"],
          ["تاريخ المخالفة", meta?.violation_date || "—"],
          ["تاريخ التنفيذ", meta?.effective_date || "—"],
          ["يؤثر على الراتب", meta?.affects_payroll_flag ? "نعم" : "لا"],
          ["الحالة", STATUS_LABELS[row.status] || row.status],
        ].map(([k, v]) => (
          <div key={k as string} className="flex justify-between gap-3 border-b border-border/30 py-1">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="font-medium text-foreground text-left">{(v as string) || "—"}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="font-semibold mb-1">نص ما وصل للموظف</div>
        <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap leading-relaxed break-words">
          {meta?.body || row.reason}
        </div>
      </div>

      {row.review_notes && (
        <div>
          <div className="font-semibold mb-1">ملاحظة المُصدِر / المراجعة</div>
          <div className="rounded-md bg-amber-50 text-amber-900 p-3 whitespace-pre-wrap break-words">{row.review_notes}</div>
        </div>
      )}

      <div>
        <div className="font-semibold mb-1">ردّ الموظف</div>
        <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap break-words">
          {meta?.employee_response || "لا يوجد رد"}
          {meta?.employee_response_at && (
            <span className="block text-xs text-muted-foreground mt-1">
              بتاريخ {new Date(meta.employee_response_at).toLocaleString("ar")}
            </span>
          )}
        </div>
      </div>

      {(row.employee_acknowledged_at || meta?.employee_acknowledged_at) && (
        <p className="text-xs text-emerald-700">
          اطّلع الموظف بتاريخ {new Date((row.employee_acknowledged_at || meta?.employee_acknowledged_at)!).toLocaleString("ar")}
        </p>
      )}
    </div>
  );
}

export default function LinkedActionDetailDialog({
  row,
  onClose,
}: {
  row: LinkedActionRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base text-right">
            {row?.meta ? `[${typeLabel(row.meta.type)}] ${row.meta.subject}` : "تفاصيل الإجراء"}
          </DialogTitle>
        </DialogHeader>
        {row && <LinkedActionBody row={row} />}
      </DialogContent>
    </Dialog>
  );
}

export function AckBadge({ acked }: { acked: boolean }) {
  return acked ? (
    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">تم الاطلاع</Badge>
  ) : (
    <Badge variant="outline" className="text-xs text-muted-foreground">لم يطّلع</Badge>
  );
}
