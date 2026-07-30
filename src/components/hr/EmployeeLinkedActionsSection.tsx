import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Eye, RefreshCw } from "lucide-react";
import { decodeHRMessage, typeLabel, typeColor, penaltyLabel, STATUS_LABELS, HRMessageMeta } from "@/lib/hrMessages";

interface Row {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  employee_acknowledged_at: string | null;
}

/**
 * يعرض للموارد البشرية الإجراءات العقابية/الرسائل الصادرة للموظف
 * (من مدير الفرع أو الموارد) مع ملاحظة المُصدِر، ونص ما وصل للموظف،
 * وحالة الاطّلاع والرد — لتكون الصورة كاملة قبل الرد على الموظف.
 */
export default function EmployeeLinkedActionsSection({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ row: Row; meta: HRMessageMeta | null } | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("correction_requests")
      .select("id, attendance_date, request_type, reason, status, created_at, review_notes, reviewed_at, employee_acknowledged_at")
      .eq("employee_id", employeeId)
      .in("request_type", ["penalty", "hr_message"])
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { if (employeeId) fetchRows(); }, [employeeId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-red-600" />
          الإجراءات والرسائل المُرسلة للموظف
          {rows.length > 0 && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">{rows.length}</Badge>
          )}
        </h4>
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{loading ? "جاري التحميل..." : "لا توجد إجراءات أو رسائل"}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">الموضوع</TableHead>
              <TableHead className="text-right">المُصدِر</TableHead>
              <TableHead className="text-right">اطّلاع الموظف</TableHead>
              <TableHead className="text-right">ردّ الموظف</TableHead>
              <TableHead className="text-right w-[90px]">الحالة</TableHead>
              <TableHead className="text-right w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const meta = decodeHRMessage(r.reason);
              return (
                <TableRow key={r.id} className={r.status === "cancelled" ? "opacity-60" : ""}>
                  <TableCell className="text-xs">{r.attendance_date}</TableCell>
                  <TableCell className="text-xs">
                    {meta ? (
                      <Badge className={`text-[10px] ${typeColor(meta.type)}`}>{typeLabel(meta.type)}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{r.request_type}</Badge>
                    )}
                    {meta?.penalty_kind && (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{penaltyLabel(meta.penalty_kind)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate">{meta?.subject || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {meta?.issued_by_name || meta?.issued_by_role || "—"}
                    {meta?.issued_by_name && meta?.issued_by_role && (
                      <span className="block text-[10px] text-muted-foreground">{meta.issued_by_role}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.employee_acknowledged_at || meta?.employee_acknowledged_at ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">تم الاطلاع</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">لم يطّلع</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">{meta?.employee_response || "—"}</TableCell>
                  <TableCell className="text-xs">{STATUS_LABELS[r.status] || r.status}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="عرض التفاصيل" onClick={() => setDetail({ row: r, meta })}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detail?.meta ? `[${typeLabel(detail.meta.type)}] ${detail.meta.subject}` : "تفاصيل الإجراء"}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["التاريخ", detail.row.attendance_date],
                  ["أُرسلت في", new Date(detail.row.created_at).toLocaleString("ar")],
                  ["المُصدِر", [detail.meta?.issued_by_name, detail.meta?.issued_by_role].filter(Boolean).join(" — ") || "غير مسجَّل"],
                  ["نوع الإجراء", detail.meta?.penalty_kind ? penaltyLabel(detail.meta.penalty_kind) : "—"],
                  ["تاريخ المخالفة", detail.meta?.violation_date || "—"],
                  ["تاريخ التنفيذ", detail.meta?.effective_date || "—"],
                  ["يؤثر على الراتب", detail.meta?.affects_payroll_flag ? "نعم" : "لا"],
                  ["الحالة", STATUS_LABELS[detail.row.status] || detail.row.status],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-foreground">{(v as string) || "—"}</span>
                  </div>
                ))}
              </div>

              <div>
                <div className="font-semibold mb-1">نص ما وصل للموظف</div>
                <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap leading-relaxed">
                  {detail.meta?.body || detail.row.reason}
                </div>
              </div>

              {detail.row.review_notes && (
                <div>
                  <div className="font-semibold mb-1">ملاحظة المُصدِر / المراجعة</div>
                  <div className="rounded-md bg-amber-50 text-amber-900 p-3 whitespace-pre-wrap">{detail.row.review_notes}</div>
                </div>
              )}

              <div>
                <div className="font-semibold mb-1">ردّ الموظف</div>
                <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap">
                  {detail.meta?.employee_response || "لا يوجد رد"}
                  {detail.meta?.employee_response_at && (
                    <span className="block text-[10px] text-muted-foreground mt-1">
                      بتاريخ {new Date(detail.meta.employee_response_at).toLocaleString("ar")}
                    </span>
                  )}
                </div>
              </div>

              {(detail.row.employee_acknowledged_at || detail.meta?.employee_acknowledged_at) && (
                <p className="text-[11px] text-emerald-700">
                  اطّلع الموظف بتاريخ {new Date((detail.row.employee_acknowledged_at || detail.meta?.employee_acknowledged_at)!).toLocaleString("ar")}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
