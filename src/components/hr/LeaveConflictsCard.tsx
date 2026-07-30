import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPendingReversals,
  reviewReversal,
  type LeaveReversalRow,
} from "@/lib/hr/leaveReversals";

interface Props {
  employeeId?: string;
  ownerId?: string | null;
  /** يُستدعى بعد أي تأكيد/تجاهل لإعادة تحميل الأرصدة في الشاشة الأب */
  onChanged?: () => void;
}

/**
 * بطاقة "تعارض إجازة مع دوام":
 * تعرض الأيام التي داوم فيها الموظف رغم اعتماد إجازته، وتتيح للموارد
 * البشرية تأكيد استرجاع اليوم (فيعود للرصيد) أو تجاهله مع سبب.
 * لا يحدث أي أثر على الرصيد أو الراتب قبل التأكيد اليدوي.
 */
export default function LeaveConflictsCard({ employeeId, ownerId, onChanged }: Props) {
  const [rows, setRows] = useState<LeaveReversalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<LeaveReversalRow | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPendingReversals({ employeeId, ownerId });
      setRows(data);
    } catch (e: any) {
      toast.error("تعذر تحميل تعارضات الإجازات: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [employeeId, ownerId]);

  useEffect(() => { load(); }, [load]);

  const act = async (row: LeaveReversalRow, action: "confirm" | "dismiss", reason?: string) => {
    setBusyId(row.id);
    try {
      await reviewReversal(row.id, action, reason);
      toast.success(action === "confirm" ? "تم استرجاع يوم الإجازة وإعادته للرصيد ✅" : "تم تجاهل التعارض");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "تعذر تنفيذ الإجراء");
    } finally {
      setBusyId(null);
      setDismissing(null);
      setDismissReason("");
    }
  };

  if (loading || rows.length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5" dir="rtl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            تعارض إجازة مع دوام — بانتظار المراجعة
            <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            الموظف داوم في أيام معتمدة كإجازة. تأكيد الاسترجاع يعيد اليوم إلى رصيد الإجازات ولا يمسّ الطلب الأصلي.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">
                    {r.reversal_date} · {r.leave_type}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    ساعات الدوام الفعلية: <span className="font-bold tabular-nums">{Number(r.detected_hours).toFixed(2)}</span>
                    {" · "}الاسترجاع المقترح: <span className="font-bold tabular-nums">{Number(r.reversal_days)}</span> يوم
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-emerald-600"
                    disabled={busyId === r.id}
                    onClick={() => act(r, "confirm")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="text-[11px]">تأكيد الاسترجاع</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-muted-foreground"
                    disabled={busyId === r.id}
                    onClick={() => { setDismissing(r); setDismissReason(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="text-[11px]">تجاهل</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!dismissing} onOpenChange={(o) => !o && setDismissing(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="text-right">سبب تجاهل التعارض</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            {dismissing?.reversal_date} — سيبقى يوم الإجازة محتسباً كما هو، مع حفظ السبب في سجل التدقيق.
          </p>
          <Textarea
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder="مثال: بصمة خاطئة / حضر لساعة لإنهاء معاملة فقط"
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDismissing(null)}>إلغاء</Button>
            <Button
              disabled={!dismissReason.trim() || busyId === dismissing?.id}
              onClick={() => dismissing && act(dismissing, "dismiss", dismissReason.trim())}
            >
              <Check className="h-4 w-4 ml-1" /> تأكيد التجاهل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}