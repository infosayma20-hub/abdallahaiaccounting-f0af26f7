import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt, RefreshCw, AlertCircle } from "lucide-react";

export default function RepOrdersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"today" | "all">("today");

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
        .select("id, invoice_number, total_amount, payment_method, status, created_at, contact_id, contact_name")
        .eq("user_id", rep.user_id)
        .eq("salesperson_id", rep.id)
        .order("created_at", { ascending: false })
        .limit(200);

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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, filter]);

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
        <Card key={o.id} className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{o.invoice_number}</div>
              <div className="text-xs text-muted-foreground truncate">
                {o.payment_method === "cash" ? "نقدي" : "آجل"}
                {o.contact_name ? ` • ${o.contact_name}` : ""}
                {" • "}
                {new Date(o.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
          <div className="font-bold text-foreground shrink-0">{Number(o.total_amount).toFixed(2)} ₪</div>
        </Card>
      ))}
    </div>
  );
}