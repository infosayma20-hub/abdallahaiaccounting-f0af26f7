import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { TrendingUp, TrendingDown, MoreVertical, Trash2, Eraser, X } from "lucide-react";
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
  const [confirmAction, setConfirmAction] = useState<{ type: "clear" | "delete" | "bulk_delete" | "bulk_clear"; session?: Session } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()),
    [sessions]
  );

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map(s => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const { type } = confirmAction;

      if (type === "bulk_delete") {
        const ids = Array.from(selectedIds);
        const { error } = await supabase.from("pos_sessions").update({ is_deleted: true }).in("id", ids);
        if (error) throw error;
        toast.success(`تم حذف ${ids.length} وردية بنجاح`);
        setSelectedIds(new Set());
      } else if (type === "bulk_clear") {
        const ids = Array.from(selectedIds);
        const { error } = await supabase.from("pos_sessions").update({
          total_sales: 0, total_orders: 0, total_returns: 0,
          closing_cash: null, expected_cash: null, cash_variance: null,
        }).in("id", ids);
        if (error) throw error;
        toast.success(`تم إفراغ بيانات ${ids.length} وردية بنجاح`);
        setSelectedIds(new Set());
      } else if (type === "clear" && confirmAction.session) {
        const { error } = await supabase.from("pos_sessions").update({
          total_sales: 0, total_orders: 0, total_returns: 0,
          closing_cash: null, expected_cash: null, cash_variance: null,
        }).eq("id", confirmAction.session.id);
        if (error) throw error;
        toast.success("تم إفراغ بيانات الوردية بنجاح");
      } else if (type === "delete" && confirmAction.session) {
        const { error } = await supabase.from("pos_sessions").update({ is_deleted: true }).eq("id", confirmAction.session.id);
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
      <div className="bg-card border border-border rounded-lg py-16 text-center text-muted-foreground">
        <p>لا توجد ورديات في الفترة المحددة</p>
      </div>
    );
  }

  const confirmTitle = confirmAction?.type === "bulk_delete"
    ? `حذف ${selectedIds.size} وردية`
    : confirmAction?.type === "bulk_clear"
    ? `إفراغ بيانات ${selectedIds.size} وردية`
    : confirmAction?.type === "clear"
    ? "إفراغ بيانات الوردية"
    : "حذف الوردية";

  const confirmDesc = confirmAction?.type === "bulk_delete"
    ? `سيتم إخفاء ${selectedIds.size} وردية من التقارير. البيانات المالية المرتبطة ستبقى محفوظة. هل أنت متأكد؟`
    : confirmAction?.type === "bulk_clear"
    ? `سيتم إعادة تعيين بيانات المبيعات والأرصدة لـ ${selectedIds.size} وردية. هل أنت متأكد؟`
    : confirmAction?.type === "clear"
    ? `سيتم إعادة تعيين بيانات المبيعات والأرصدة للوردية الخاصة بـ "${confirmAction?.session?.cashier_name || "غير محدد"}". هل أنت متأكد؟`
    : `سيتم إخفاء الوردية الخاصة بـ "${confirmAction?.session?.cashier_name || "غير محدد"}" من التقارير. البيانات المالية المرتبطة ستبقى محفوظة.`;

  const isDestructive = confirmAction?.type === "delete" || confirmAction?.type === "bulk_delete";

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">إجمالي الورديات</p>
          <p className="text-2xl font-bold text-foreground mt-2 font-mono">{stats.total}</p>
          <div className="flex gap-2 mt-1">
            {stats.open > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">{stats.open} مفتوحة</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">{stats.closed} مغلقة</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">متوسط مدة الوردية</p>
          <p className="text-2xl font-bold text-foreground mt-2 font-mono">
            {stats.avgDuration.toFixed(1)}<span className="text-sm text-muted-foreground mr-1">ساعة</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ورديات بعجز</p>
          <p className="text-2xl font-bold text-destructive mt-2 font-mono">{stats.deficits}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">صافي الفروقات</p>
          <p className={`text-2xl font-bold mt-2 font-mono ${stats.totalVariance < 0 ? "text-destructive" : stats.totalVariance > 0 ? "text-success" : "text-muted-foreground"}`}>
            ₪{Math.abs(stats.totalVariance).toFixed(2)}
            {stats.totalVariance !== 0 && <span className="text-xs mr-1 font-normal">{stats.totalVariance > 0 ? "فائض" : "عجز"}</span>}
          </p>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} وردية محددة</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3 ml-1" /> إلغاء التحديد
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setConfirmAction({ type: "bulk_clear" })}>
              <Eraser className="h-3.5 w-3.5" /> إفراغ البيانات
            </Button>
            <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setConfirmAction({ type: "bulk_delete" })}>
              <Trash2 className="h-3.5 w-3.5" /> حذف المحدد
            </Button>
          </div>
        </div>
      )}

      {/* Shifts Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">سجل الورديات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary border-b border-border">
                <th className="px-3 py-2.5 w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="تحديد الكل"
                    className={someSelected ? "data-[state=unchecked]:bg-primary/20" : ""}
                    {...(someSelected ? { "data-state": "indeterminate" as any } : {})}
                  />
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الكاشير</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">تاريخ الفتح</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">وقت الفتح</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">وقت الإغلاق</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المدة</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">رصيد الفتح</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">رصيد الإغلاق</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المتوقع</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الفرق</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المبيعات</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الطلبات</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">تحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {sorted.map((s) => {
                const variance = s.cash_variance ?? 0;
                const isSelected = selectedIds.has(s.id);
                return (
                  <tr key={s.id} className={`hover:bg-secondary transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(s.id)} aria-label={`تحديد وردية ${s.cashier_name}`} />
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground font-medium">{s.cashier_name || "—"}</td>
                    <td className="px-3 py-3 text-sm text-muted-foreground font-mono">{format(new Date(s.opened_at), "dd/MM/yyyy")}</td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground">{format(new Date(s.opened_at), "hh:mm a", { locale: ar })}</td>
                    <td className="px-3 py-3 text-sm font-mono">
                      {s.closed_at
                        ? <span className="text-muted-foreground">{format(new Date(s.closed_at), "hh:mm a", { locale: ar })}</span>
                        : <span className="text-warning text-xs font-medium">مفتوحة</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground">{formatDuration(s.opened_at, s.closed_at)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground text-left">₪{s.opening_cash.toFixed(2)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground text-left">{s.closing_cash != null ? `₪${s.closing_cash.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground text-left">{s.expected_cash != null ? `₪${s.expected_cash.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-sm font-mono text-left">
                      {s.state === "closed" ? (
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          variance < 0 ? "text-destructive" : variance > 0 ? "text-success" : "text-muted-foreground"
                        }`}>
                          {variance < 0 ? <TrendingDown className="h-3 w-3" /> : variance > 0 ? <TrendingUp className="h-3 w-3" /> : null}
                          {variance < 0 ? `(₪${Math.abs(variance).toFixed(2)})` : `₪${variance.toFixed(2)}`}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-sm font-mono font-medium text-foreground text-left">₪{s.total_sales.toFixed(2)}</td>
                    <td className="px-3 py-3 text-sm font-mono text-muted-foreground text-left">{s.total_orders}</td>
                    <td className="px-3 py-3 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: "clear", session: s })}>
                            <Eraser className="h-4 w-4 ml-2" /> إفراغ البيانات
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmAction({ type: "delete", session: s })}>
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
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction} disabled={actionLoading}
              className={isDestructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {actionLoading ? "جارٍ التنفيذ..." : isDestructive ? "حذف" : "إفراغ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
