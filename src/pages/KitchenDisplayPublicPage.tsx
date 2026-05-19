/**
 * Public, token-based kitchen / heater screen — /pos/kitchen-display?token=...
 * Does NOT require login. Uses kds_get_kitchen_tickets + kds_update_ticket_status
 * RPCs which validate the device token and scope to the device's branch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ChefHat, RefreshCw, Megaphone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Ticket {
  id: string;
  order_id: string;
  station_id: string | null;
  status: string;
  items: any[];
  created_at: string;
  ready_at: string | null;
  order_number: string | null;
  daily_display_number: number | null;
  table_name: string | null;
}

const STATUS_NEXT: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivered",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "جديد", preparing: "قيد التحضير", ready: "جاهز",
};
const NEXT_LABEL: Record<string, string> = {
  pending: "ابدأ التحضير", preparing: "جاهز", ready: "تم التسليم",
};

export default function KitchenDisplayPublicPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setError("token مفقود"); setLoading(false); return; }
    const { data, error } = await (supabase as any).rpc("kds_get_kitchen_tickets", { _token: token });
    if (error) { setError(error.message); setLoading(false); return; }
    setTickets((data as Ticket[]) || []);
    setError(null);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const updateStatus = async (ticket: Ticket) => {
    const next = STATUS_NEXT[ticket.status];
    if (!next) return;
    const { error } = await (supabase as any).rpc("kds_update_ticket_status", {
      _token: token, _ticket_id: ticket.id, _status: next,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const recall = async (ticket: Ticket) => {
    const { error } = await (supabase as any).rpc("kds_recall_order_by_token", {
      _token: token, _order_id: ticket.order_id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إعادة النداء");
  };

  const grouped = useMemo(() => ({
    pending: tickets.filter(t => t.status === "pending"),
    preparing: tickets.filter(t => t.status === "preparing"),
    ready: tickets.filter(t => t.status === "ready"),
  }), [tickets]);

  if (loading) {
    return <div className="min-h-screen bg-[#0f172a] text-white grid place-items-center">جارٍ التحميل…</div>;
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white grid place-items-center p-6" dir="rtl">
        <Card className="p-6 bg-[#1e293b] border-white/10 text-white text-center">
          <h1 className="text-xl font-bold mb-2">تعذّر فتح شاشة المطبخ</h1>
          <p className="text-sm text-white/70">{error}</p>
          <p className="text-xs text-white/50 mt-3">تأكد من صحة الرابط أو اطلب من المدير تدوير التوكن.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-4" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5" />
          <h1 className="text-xl font-bold">شاشة المطبخ</h1>
          <Badge variant="secondary" className="bg-white/10 text-white">{tickets.length} طلب</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="bg-white/5 border-white/20 text-white">
          <RefreshCw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["pending","preparing","ready"] as const).map(col => (
          <div key={col}>
            <h2 className="text-sm font-bold mb-2 opacity-80">{STATUS_LABEL[col]} ({grouped[col].length})</h2>
            <div className="space-y-3">
              {grouped[col].map(t => (
                <Card key={t.id} className="bg-[#1e293b] border-white/10 text-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-3xl font-black tabular-nums leading-none">
                      {t.daily_display_number ?? t.order_number ?? "—"}
                    </span>
                    <div className="flex items-center gap-1 text-xs bg-white/10 rounded-full px-2 py-0.5">
                      <Clock className="h-3 w-3" />
                      {Math.max(0, Math.floor((Date.now() - new Date(t.created_at).getTime()) / 60000))}د
                    </div>
                  </div>
                  {t.table_name && (
                    <Badge variant="secondary" className="bg-white/10 text-white mb-2">🪑 {t.table_name}</Badge>
                  )}
                  <ul className="space-y-1 text-sm mb-3">
                    {(t.items || []).map((it: any, i: number) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="bg-white/10 px-1.5 rounded text-xs font-bold">{it.qty}</span>
                        <span className="flex-1">{it.product_name || it.name}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    {STATUS_NEXT[t.status] && (
                      <Button size="sm" className="flex-1" onClick={() => updateStatus(t)}>
                        <CheckCircle2 className="h-4 w-4 ml-1" /> {NEXT_LABEL[t.status]}
                      </Button>
                    )}
                    {t.status === "ready" && (
                      <Button size="sm" variant="outline" onClick={() => recall(t)}
                              className="bg-white/5 border-white/20 text-white">
                        <Megaphone className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {grouped[col].length === 0 && (
                <p className="text-xs opacity-60 text-center py-6">لا يوجد</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}