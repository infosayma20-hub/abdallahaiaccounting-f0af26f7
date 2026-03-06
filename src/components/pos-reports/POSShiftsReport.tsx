import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { TrendingUp, TrendingDown, MoreVertical, Trash2, Eraser } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Session {
  id: string;
  cashier_name: string | null;
  cashier_pos_user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  total_sales: number;
  total_orders: number;
  total_returns: number;
  terminal_id: string;
  state: string;
}

interface Props {
  sessions: Session[];
  onRefresh?: () => void;
}

export default function POSShiftsReport({ sessions, onRefresh }: Props) {
  const [confirmAction, setConfirmAction] = useState<{ type: "clear" | "delete"; session: Session } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const { session, type } = confirmAction;
      if (type === "clear") {
        const { error } = await supabase.from("pos_sessions").update({
          total_sales: 0, total_orders: 0, total_returns: 0,
          closing_cash: null, expected_cash: null, cash_variance: null,
        }).eq("id", session.id);
        if (error) throw error;
        toast.success("تم إفراغ بيانات الوردية بنجاح");
      } else {
        const { error } = await supabase.from("pos_sessions").update({ is_deleted: true }).eq("id", session.id);
        if (error) throw error;
        toast.success("تم حذف الوردية بنجاح");
      }
      onRefresh?.();
    } catch (err: any) {
      toast.error("حدث خطأ: " + (err.message || "غير معروف"));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()),
    [sessions]
  );

  const stats = useMemo(() => {
    const closed = sorted.filter(s => s.state === "closed");
    const totalVariance = closed.reduce((s, c) => s + (c.cash_variance ?? 0), 0);
    const deficits = closed.filter(s => (s.cash_variance ?? 0) < 0);
    const durations = closed.filter(s => s.closed_at)
      .map(s => (new Date(s.closed_at!).getTime() - new Date(s.opened_at).getTime()) / 3600000);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return {
      total: sorted.length, open: sorted.filter(s => s.state === "open").length,
      closed: closed.length, totalVariance, deficits: deficits.length, avgDuration,
    };
  }, [sorted]);

  const formatDuration = (openedAt: string, closedAt: string | null) => {
    if (!closedAt) return "—";
    const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}س ${m}د`;
  };

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-lg py-16 text-center text-[#637381]">
        <p>لا توجد ورديات في الفترة المحددة</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">إجمالي الورديات</p>
          <p className="text-2xl font-bold text-[#1A2332] mt-2 font-mono">{stats.total}</p>
          <div className="flex gap-2 mt-1">
            {stats.open > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">{stats.open} مفتوحة</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F8F9FA] text-[#637381] border border-[#E2E8F0]">{stats.closed} مغلقة</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">متوسط مدة الوردية</p>
          <p className="text-2xl font-bold text-[#1A2332] mt-2 font-mono">
            {stats.avgDuration.toFixed(1)}<span className="text-sm text-[#637381] mr-1">ساعة</span>
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">ورديات بعجز</p>
          <p className="text-2xl font-bold text-[#C53030] mt-2 font-mono">{stats.deficits}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">صافي الفروقات</p>
          <p className={`text-2xl font-bold mt-2 font-mono ${stats.totalVariance < 0 ? "text-[#C53030]" : stats.totalVariance > 0 ? "text-[#188038]" : "text-[#637381]"}`}>
            ₪{Math.abs(stats.totalVariance).toFixed(2)}
            {stats.totalVariance !== 0 && <span className="text-xs mr-1 font-normal">{stats.totalVariance > 0 ? "فائض" : "عجز"}</span>}
          </p>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">سجل الورديات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الكاشير</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">تاريخ الفتح</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">وقت الفتح</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">وقت الإغلاق</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المدة</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">رصيد الفتح</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">رصيد الإغلاق</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المتوقع</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الفرق</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المبيعات</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الطلبات</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">تحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {sorted.map((s) => {
                const variance = s.cash_variance ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-3 py-3 text-sm text-[#1A2332] font-medium">{s.cashier_name || "—"}</td>
                    <td className="px-3 py-3 text-sm text-[#637381] font-mono">{format(new Date(s.opened_at), "dd/MM/yyyy")}</td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381]">{format(new Date(s.opened_at), "hh:mm a", { locale: ar })}</td>
                    <td className="px-3 py-3 text-sm font-mono">
                      {s.closed_at
                        ? <span className="text-[#637381]">{format(new Date(s.closed_at), "hh:mm a", { locale: ar })}</span>
                        : <span className="text-[#D97706] text-xs font-medium">مفتوحة</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381]">{formatDuration(s.opened_at, s.closed_at)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381] text-left">₪{s.opening_cash.toFixed(2)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381] text-left">{s.closing_cash != null ? `₪${s.closing_cash.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381] text-left">{s.expected_cash != null ? `₪${s.expected_cash.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-sm font-mono text-left">
                      {s.state === "closed" ? (
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          variance < 0 ? "text-[#C53030]" : variance > 0 ? "text-[#188038]" : "text-[#637381]"
                        }`}>
                          {variance < 0 ? <TrendingDown className="h-3 w-3" /> : variance > 0 ? <TrendingUp className="h-3 w-3" /> : null}
                          {variance < 0 ? `(₪${Math.abs(variance).toFixed(2)})` : `₪${variance.toFixed(2)}`}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-sm font-mono font-medium text-[#1A2332] text-left">₪{s.total_sales.toFixed(2)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-[#637381] text-left">{s.total_orders}</td>
                    <td className="px-3 py-3 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4 text-[#637381]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: "clear", session: s })}>
                            <Eraser className="h-4 w-4 ml-2" /> إفراغ البيانات
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-[#C53030]" onClick={() => setConfirmAction({ type: "delete", session: s })}>
                            <Trash2 className="h-4 w-4 ml-2" /> حذف الوردية
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "clear" ? "إفراغ بيانات الوردية" : "حذف الوردية"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "clear"
                ? `سيتم إعادة تعيين بيانات المبيعات والأرصدة للوردية الخاصة بـ "${confirmAction?.session.cashier_name || "غير محدد"}". هل أنت متأكد؟`
                : `سيتم حذف الوردية الخاصة بـ "${confirmAction?.session.cashier_name || "غير محدد"}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction} disabled={actionLoading}
              className={confirmAction?.type === "delete" ? "bg-[#C53030] text-white hover:bg-[#9B2C2C]" : ""}
            >
              {actionLoading ? "جارٍ التنفيذ..." : confirmAction?.type === "clear" ? "إفراغ" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
