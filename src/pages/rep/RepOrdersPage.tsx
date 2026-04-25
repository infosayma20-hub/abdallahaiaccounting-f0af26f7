import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Loader2, Receipt } from "lucide-react";

export default function RepOrdersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: rep } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, default_warehouse_id")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!rep) { setLoading(false); return; }
      const { data: day } = await (supabase as any)
        .from("van_sales_days").select("opened_at, warehouse_id")
        .eq("sales_rep_id", rep.id).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      if (!day) { setOrders([]); setLoading(false); return; }
      const { data: invs } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, total_amount, payment_method, created_at, contact_id")
        .eq("user_id", rep.user_id)
        .eq("warehouse_id", day.warehouse_id)
        .gte("created_at", day.opened_at)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      setOrders(invs || []);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-bold text-foreground">طلبات اليوم ({orders.length})</h2>
      {orders.length === 0 && <Card className="p-6 text-center text-muted-foreground text-sm">لا يوجد طلبات بعد</Card>}
      {orders.map((o) => (
        <Card key={o.id} className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{o.invoice_number}</div>
              <div className="text-xs text-muted-foreground">{o.payment_method === "cash" ? "نقدي" : "آجل"} • {new Date(o.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
          <div className="font-bold text-foreground shrink-0">{Number(o.total_amount).toFixed(2)} ₪</div>
        </Card>
      ))}
    </div>
  );
}