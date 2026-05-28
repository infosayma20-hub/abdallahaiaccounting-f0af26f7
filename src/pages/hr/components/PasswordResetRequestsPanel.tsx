import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { KeyRound, Check, X, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ResetRequest {
  id: string;
  email: string;
  employee_name: string | null;
  reason: string | null;
  status: string;
  created_at: string;
}

export function PasswordResetRequestsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ResetRequest | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("password_reset_requests")
      .select("id,email,employee_name,reason,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "خطأ في تحميل الطلبات", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as ResetRequest[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const suffix = user?.id ?? "anon";
      ch = supabase
        .channel(`topic-hr-password-reset-${suffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "password_reset_requests" },
          () => fetchRows(),
        )
        .subscribe();
    })();
    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  const openApprove = (r: ResetRequest) => {
    setSelected(r);
    setNewPwd("");
    setNote("");
  };

  const submitAction = async (action: "approve" | "reject") => {
    if (!selected) return;
    if (action === "approve" && newPwd.length < 8) {
      toast({ title: "كلمة المرور يجب أن تكون 8 أحرف على الأقل", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-employee-password", {
        body: {
          request_id: selected.id,
          action,
          new_password: action === "approve" ? newPwd : undefined,
          note: note || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: action === "approve" ? "تم تعيين كلمة المرور ✅" : "تم رفض الطلب",
        description:
          action === "approve"
            ? "أبلغ الموظف بكلمة المرور المؤقتة. سيُطلب منه تغييرها عند أول دخول."
            : undefined,
      });
      setSelected(null);
      fetchRows();
    } catch (e: any) {
      toast({ title: "فشلت العملية", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="sm" onClick={fetchRows} className="h-7 w-7 p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-right">
            طلبات استعادة كلمة المرور
            {rows.length > 0 && (
              <Badge variant="destructive" className="h-5">{rows.length}</Badge>
            )}
            <KeyRound className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              لا توجد طلبات حالياً
            </p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-auto">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                >
                  <Button size="sm" variant="default" onClick={() => openApprove(r)} className="h-7 text-xs">
                    تعيين كلمة مرور
                  </Button>
                  <div className="flex-1 text-right">
                    <div className="text-xs font-medium">
                      {r.employee_name ?? "موظف غير معروف"}
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">
                      {r.email}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ar-EG")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين كلمة مرور مؤقتة</DialogTitle>
            <DialogDescription>
              للموظف: {selected?.employee_name ?? selected?.email}
              <br />
              سيُطلب منه تغييرها عند أول تسجيل دخول.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">كلمة المرور الجديدة (8 أحرف على الأقل)</label>
              <Input
                type="text"
                dir="ltr"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Amwali@2026"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ملاحظة (اختياري)</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: تم التأكد من هوية الموظف هاتفياً"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => submitAction("reject")} disabled={busy}>
              <X className="h-4 w-4" /> رفض الطلب
            </Button>
            <Button onClick={() => submitAction("approve")} disabled={busy || newPwd.length < 8}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              اعتماد وتعيين
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}