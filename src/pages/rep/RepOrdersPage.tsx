import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt, RefreshCw, AlertCircle, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { broadcastChange } from "@/lib/crossTabSync";

export default function RepOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"today" | "all">("today");
  const [showCancelled, setShowCancelled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rep, error: repErr } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (repErr) throw repErr;
      if (!rep) { setOrders([]); setLoading(false); return; }

      // المصدر الموحد: invoices حيث salesperson_id = هذا المندوب
      // (لا is_deleted على invoices — العمود غير موجود)
      let query = (supabase as any)
        .from("invoices")
        .select("id, invoice_number, total_amount, payment_method, status, is_voided, voided_at, created_at, contact_id, contact_name, linked_transaction_id")
        .eq("user_id", rep.user_id)
        .eq("salesperson_id", rep.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!showCancelled) {
        query = query.not("status", "in", "(cancelled,void,reversed)");
        query = query.eq("is_voided", false);
      }

      if (filter === "today") {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        query = query.gte("created_at", today.toISOString());
      }

      const { data: invs, error: invErr } = await query;
      if (invErr) throw invErr;
      setOrders(invs || []);
    } catch (e: any) {
      console.error("[RepOrders] load error:", e);
      setError(e?.message || "تعذّر تحميل الطلبات");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, filter, showCancelled]);

  const deleteDraft = async (o: any) => {
    if (!confirm(`حذف المسودة ${o.invoice_number}؟`)) return;
    setBusyId(o.id);
    try {
      // Only allow deletion if not posted (no linked transaction)
      const { data: inv } = await (supabase as any)
        .from("invoices").select("linked_transaction_id, status").eq("id", o.id).maybeSingle();
      if (inv?.linked_transaction_id) {
        toast({ title: "لا يمكن الحذف", description: "الطلب مرحّل. استخدم إلغاء الطلب.", variant: "destructive" });
        return;
      }
      const { error: delErr } = await (supabase as any).from("invoice_items").delete().eq("invoice_id", o.id);
      if (delErr) throw delErr;
      const { error: invErr } = await (supabase as any).from("invoices").delete().eq("id", o.id);
      if (invErr) throw invErr;
      toast({ title: "تم حذف المسودة" });
      await load();
    } catch (e: any) {
      toast({ title: "فشل الحذف", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const cancelOrder = async (o: any) => {
    const reason = prompt("سبب إلغاء الطلب (إلزامي):");
    if (reason === null) return;
    if (!reason || reason.trim().length < 3) {
      toast({ title: "السبب مطلوب (3 حروف على الأقل)", variant: "destructive" });
      return;
    }
    setBusyId(o.id);
    try {
      const { data: latest, error: latestErr } = await (supabase as any)
        .from("invoices")
        .select("status, is_voided")
        .eq("id", o.id)
        .maybeSingle();
      if (latestErr) throw latestErr;

      const alreadyCancelled = Boolean(latest?.is_voided) || ["cancelled", "void", "reversed", "ملغي", "ملغى"].includes((latest?.status || "").toLowerCase());
      if (alreadyCancelled) {
        toast({ title: "الطلب ملغى مسبقاً", description: "تم تحديث القائمة لإخفائه من الطلبات النشطة." });
        await load();
        return;
      }

      const { data, error } = await (supabase as any).rpc("void_rep_sale_atomic", {
        p_invoice_id: o.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الإلغاء");
      toast({
        title: data.already_voided ? "الطلب ملغى مسبقاً" : "تم إلغاء الطلب",
        description: `قيد عكسي: ${data.reverse_transaction_id?.slice(0,8)}…`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["van-sales-payload"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["account-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["account-statement-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["trial-balance"] }),
      ]);
      broadcastChange("invoice", "updated", o.id);
      broadcastChange("transaction", "updated", data.reverse_transaction_id);
      await load();
    } catch (e: any) {
      const message = String(e?.message || "");
      toast({
        title: "فشل الإلغاء",
        description: message.includes("عُكس مسبقاً") ? "تم العثور على قيد عكسي سابق، حدّثت القائمة حسب حالة الطلب الحالية." : message,
        variant: "destructive",
      });
      await load();
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-foreground">طلباتي ({orders.length})</h2>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant={filter === "today" ? "default" : "outline"} size="sm" onClick={() => setFilter("today")} className="h-9">اليوم</Button>
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} className="h-9">الكل</Button>
      </div>

      <Button
        variant={showCancelled ? "secondary" : "outline"}
        size="sm"
        onClick={() => setShowCancelled((v) => !v)}
        className="w-full h-9"
      >
        {showCancelled ? "إخفاء الملغاة" : "إظهار الملغاة"}
      </Button>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-destructive">{error}</div>
        </Card>
      )}

      {loading && <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!loading && !error && orders.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">لا يوجد طلبات بعد</Card>
      )}

      {orders.map((o) => (
        <RepOrderRow key={o.id} o={o} busy={busyId === o.id} onDelete={() => deleteDraft(o)} onCancel={() => cancelOrder(o)} />
      ))}
    </div>
  );
}

function RepOrderRow({ o, busy, onDelete, onCancel }: { o: any; busy: boolean; onDelete: () => void; onCancel: () => void }) {
  const cancelled = Boolean(o.is_voided) || ["cancelled", "void", "reversed", "ملغي", "ملغى"].includes((o.status || "").toLowerCase());
  // Heuristic: if status is 'draft' or 'pending' OR there's no linked txn metadata, treat as draft.
  // We rely on what the list query returned. Posted = status not in (draft, cancelled, void, reversed)
  const isDraft = ["draft", "pending", "مسودة"].includes((o.status || "").toLowerCase());
  return (
    <Card className={`p-4 flex items-center justify-between gap-3 ${cancelled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate flex items-center gap-2">
            {o.invoice_number}
            {cancelled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">ملغى</span>}
            {isDraft && !cancelled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">مسودة</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {o.payment_method === "cash" ? "نقدي" : "آجل"}
            {o.contact_name ? ` • ${o.contact_name}` : ""}
            {" • "}
            {new Date(o.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="font-bold text-foreground">{Number(o.total_amount).toFixed(2)} ₪</div>
        {!cancelled && (
          isDraft ? (
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="text-destructive">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className="text-destructive">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            </Button>
          )
        )}
      </div>
    </Card>
  );
}