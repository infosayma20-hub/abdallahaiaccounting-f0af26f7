import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, LockOpen, Plus, ShieldCheck } from "lucide-react";

interface FiscalPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
  notes: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }> = {
  open: { label: "مفتوحة", variant: "secondary", icon: <LockOpen className="w-3 h-3" /> },
  closed: { label: "مغلقة", variant: "default", icon: <Lock className="w-3 h-3" /> },
  locked: { label: "مقفلة نهائياً", variant: "destructive", icon: <ShieldCheck className="w-3 h-3" /> },
};

const FiscalPeriodsManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "close" | "lock" | "reopen" } | null>(null);

  const [newPeriod, setNewPeriod] = useState({ period_name: "", start_date: "", end_date: "", notes: "" });

  const fetchPeriods = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("fiscal_periods")
      .select("*")
      .order("start_date", { ascending: false });
    setPeriods((data as FiscalPeriod[]) || []);
  };

  useEffect(() => { fetchPeriods(); }, [user]);

  const handleCreate = async () => {
    if (!user || !newPeriod.period_name || !newPeriod.start_date || !newPeriod.end_date) return;
    setLoading(true);
    const { error } = await supabase.from("fiscal_periods").insert({
      user_id: user.id,
      period_name: newPeriod.period_name,
      start_date: newPeriod.start_date,
      end_date: newPeriod.end_date,
      notes: newPeriod.notes || null,
    });
    setLoading(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم إنشاء الفترة " });
      setShowCreate(false);
      setNewPeriod({ period_name: "", start_date: "", end_date: "", notes: "" });
      fetchPeriods();
    }
  };

  const handleStatusChange = async () => {
    if (!confirmAction || !user) return;
    const { id, action } = confirmAction;
    const newStatus = action === "reopen" ? "open" : action === "close" ? "closed" : "locked";
    setLoading(true);
    const { error } = await supabase.from("fiscal_periods").update({
      status: newStatus,
      closed_by: action !== "reopen" ? user.id : null,
      closed_at: action !== "reopen" ? new Date().toISOString() : null,
    }).eq("id", id);
    setLoading(false);
    setConfirmAction(null);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `تم ${action === "reopen" ? "إعادة فتح" : action === "close" ? "إغلاق" : "قفل"} الفترة ✅` });
      fetchPeriods();
    }
  };

  const generateMonthlyPeriods = async () => {
    if (!user) return;
    const year = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const lastDay = new Date(year, i + 1, 0).getDate();
      return {
        user_id: user.id,
        period_name: `${year}-${m}`,
        start_date: `${year}-${m}-01`,
        end_date: `${year}-${m}-${lastDay}`,
      };
    });
    setLoading(true);
    const { error } = await supabase.from("fiscal_periods").insert(months);
    setLoading(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `تم إنشاء 12 فترة شهرية لسنة ${year} ✅` });
      fetchPeriods();
    }
  };

  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        إدارة الفترات المحاسبية
      </h3>

      <div className="flex flex-wrap gap-2 mb-4">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="w-4 h-4 ml-1" />فترة جديدة</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء فترة محاسبية</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>اسم الفترة</Label><Input placeholder="مثلاً: 2026-04" value={newPeriod.period_name} onChange={e => setNewPeriod(p => ({ ...p, period_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>من تاريخ</Label><Input type="date" value={newPeriod.start_date} onChange={e => setNewPeriod(p => ({ ...p, start_date: e.target.value }))} /></div>
                <div><Label>إلى تاريخ</Label><Input type="date" value={newPeriod.end_date} onChange={e => setNewPeriod(p => ({ ...p, end_date: e.target.value }))} /></div>
              </div>
              <div><Label>ملاحظات</Label><Input placeholder="اختياري" value={newPeriod.notes} onChange={e => setNewPeriod(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={loading}>إنشاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={generateMonthlyPeriods} disabled={loading}>
          إنشاء فترات شهرية للسنة الحالية
        </Button>
      </div>

      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد فترات محاسبية. أنشئ فترات لتفعيل حماية الإقفال.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-right font-medium">الفترة</th>
                <th className="p-2 text-right font-medium">من</th>
                <th className="p-2 text-right font-medium">إلى</th>
                <th className="p-2 text-right font-medium">الحالة</th>
                <th className="p-2 text-right font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => {
                const cfg = statusConfig[p.status] || statusConfig.open;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-medium">{p.period_name}</td>
                    <td className="p-2 text-muted-foreground">{p.start_date}</td>
                    <td className="p-2 text-muted-foreground">{p.end_date}</td>
                    <td className="p-2">
                      <Badge variant={cfg.variant} className="gap-1">{cfg.icon}{cfg.label}</Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {p.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => setConfirmAction({ id: p.id, action: "close" })}>
                            <Lock className="w-3 h-3 ml-1" />إغلاق
                          </Button>
                        )}
                        {p.status === "closed" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ id: p.id, action: "reopen" })}>
                              <LockOpen className="w-3 h-3 ml-1" />إعادة فتح
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ id: p.id, action: "lock" })}>
                              <ShieldCheck className="w-3 h-3 ml-1" />قفل نهائي
                            </Button>
                          </>
                        )}
                        {p.status === "locked" && (
                          <span className="text-xs text-muted-foreground">مقفلة نهائياً</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "lock" ? "قفل نهائي" : confirmAction?.action === "close" ? "إغلاق الفترة" : "إعادة فتح الفترة"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "lock"
                ? "القفل النهائي لا يمكن التراجع عنه. لن يتمكن أي مستخدم من إدخال أو تعديل قيود في هذه الفترة."
                : confirmAction?.action === "close"
                ? "سيتم منع إدخال قيود جديدة في هذه الفترة. يمكنك إعادة فتحها لاحقاً."
                : "سيتم السماح بإدخال قيود في هذه الفترة مجدداً."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusChange}>تأكيد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FiscalPeriodsManager;
