import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Eye, RefreshCw } from "lucide-react";
import { typeLabel, typeColor, penaltyLabel, STATUS_LABELS } from "@/lib/hrMessages";
import { useEmployeeLinkedActions, type LinkedActionRow } from "@/hooks/hr/useEmployeeLinkedActions";
import LinkedActionDetailDialog, { AckBadge } from "@/components/hr/LinkedActionDetailDialog";

interface Props {
  employeeId: string;
  /** Optional: reuse rows already fetched by the parent to avoid a duplicate query. */
  rows?: LinkedActionRow[];
  loading?: boolean;
  onRefresh?: () => void;
}

/**
 * يعرض للموارد البشرية الإجراءات العقابية/الرسائل الصادرة للموظف
 * (من مدير الفرع أو الموارد) مع ملاحظة المُصدِر، ونص ما وصل للموظف،
 * وحالة الاطّلاع والرد — لتكون الصورة كاملة قبل الرد على الموظف.
 */
export default function EmployeeLinkedActionsSection({ employeeId, rows: rowsProp, loading: loadingProp, onRefresh }: Props) {
  const own = useEmployeeLinkedActions(rowsProp ? undefined : employeeId);
  const rows = rowsProp ?? own.rows;
  const loading = rowsProp ? !!loadingProp : own.loading;
  const refresh = onRefresh ?? own.refetch;

  const [detail, setDetail] = useState<LinkedActionRow | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-red-600" />
          الإجراءات والرسائل المُرسلة للموظف
          {rows.length > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">{rows.length}</Badge>
          )}
        </h4>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{loading ? "جاري التحميل..." : "لا توجد إجراءات أو رسائل"}</p>
      ) : (
        <div className="w-full overflow-x-auto rounded-lg border border-border/60">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right whitespace-nowrap">التاريخ</TableHead>
                <TableHead className="text-right whitespace-nowrap">النوع</TableHead>
                <TableHead className="text-right min-w-[240px]">الموضوع</TableHead>
                <TableHead className="text-right whitespace-nowrap">المُصدِر</TableHead>
                <TableHead className="text-right whitespace-nowrap">اطّلاع الموظف</TableHead>
                <TableHead className="text-right min-w-[180px]">ردّ الموظف</TableHead>
                <TableHead className="text-right whitespace-nowrap">الحالة</TableHead>
                <TableHead className="text-right w-[120px] whitespace-nowrap">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const meta = r.meta;
                return (
                  <TableRow key={r.id} className={r.status === "cancelled" ? "opacity-60" : ""}>
                    <TableCell className="text-sm whitespace-nowrap">{r.attendance_date}</TableCell>
                    <TableCell className="text-sm">
                      {meta ? (
                        <Badge className={`text-xs ${typeColor(meta.type)}`}>{typeLabel(meta.type)}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{r.request_type}</Badge>
                      )}
                      {meta?.penalty_kind && (
                        <span className="block text-xs text-muted-foreground mt-0.5">{penaltyLabel(meta.penalty_kind)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="block font-medium">{meta?.subject || "—"}</span>
                      {meta?.body && (
                        <span className="block text-xs text-muted-foreground line-clamp-2">{meta.body}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {meta?.issued_by_name || meta?.issued_by_role || "—"}
                      {meta?.issued_by_name && meta?.issued_by_role && (
                        <span className="block text-xs text-muted-foreground">{meta.issued_by_role}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <AckBadge acked={!!(r.employee_acknowledged_at || meta?.employee_acknowledged_at)} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="line-clamp-2">{meta?.employee_response || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{STATUS_LABELS[r.status] || r.status}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDetail(r)}>
                        <Eye className="h-3.5 w-3.5" /> عرض
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <LinkedActionDetailDialog row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
