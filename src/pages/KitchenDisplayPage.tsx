import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChefHat, Clock, CheckCircle2, Printer, ArrowRight, RefreshCw, Volume2, ArrowRightFromLine, Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { sendToBridge } from "@/lib/print-bridge-client";
import { printStationTicketImage } from "@/lib/image-print-service";
import type { PrintOrder } from "@/hooks/usePrintBridge";

interface Station {
  id: string;
  name: string;
  station_type: string;
  color: string;
}

interface Ticket {
  id: string;
  order_id: string;
  station_id: string;
  status: string;
  items: any[];
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  order_number?: string;
  table_name?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500",
  preparing: "bg-blue-500",
  ready: "bg-green-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "جديد",
  preparing: "قيد التحضير",
  ready: "جاهز",
};

export default function KitchenDisplayPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>("all");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const loadStations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("kitchen_stations")
      .select("id, name, station_type, color")
      .eq("is_active", true)
      .order("display_order");
    setStations((data as any[]) || []);
  }, [user]);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    // Filter to today's tickets only
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let query = supabase
      .from("kitchen_tickets")
      .select("*")
      .in("status", ["pending", "preparing", "ready"])
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: true });

    if (selectedStation !== "all") {
      query = query.eq("station_id", selectedStation);
    }

    const { data } = await query;
    const ticketData = (data as any[]) || [];

    // Enrich with order info
    const orderIds = [...new Set(ticketData.map(t => t.order_id))];
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("pos_orders")
        .select("id, order_number, table_id")
        .in("id", orderIds);

      const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));

      // Get table names
      const tableIds = (orders || []).filter((o: any) => o.table_id).map((o: any) => o.table_id);
      let tableMap = new Map();
      if (tableIds.length > 0) {
        const { data: tables } = await supabase
          .from("restaurant_tables")
          .select("id, name")
          .in("id", tableIds);
        tableMap = new Map((tables || []).map((t: any) => [t.id, t.name]));
      }

      ticketData.forEach(t => {
        const order = orderMap.get(t.order_id);
        if (order) {
          t.order_number = (order as any).order_number;
          t.table_name = tableMap.get((order as any).table_id);
        }
      });
    }

    setTickets(ticketData);
    setLoading(false);
  }, [user, selectedStation]);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("kitchen-tickets-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "kitchen_tickets",
      }, (payload) => {
        if (payload.eventType === "INSERT" && soundEnabled) {
          try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
        }
        loadTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadTickets, soundEnabled]);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(loadTickets, 15000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  const updateStatus = async (ticketId: string, newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "preparing") updates.accepted_at = new Date().toISOString();
    if (newStatus === "ready") updates.completed_at = new Date().toISOString();

    await supabase.from("kitchen_tickets").update(updates).eq("id", ticketId);

    // Log call event when ticket becomes ready (for customer display + analytics).
    if (newStatus === "ready") {
      try {
        const ticket = tickets.find(t => t.id === ticketId);
        const { data: { user: u } } = await supabase.auth.getUser();
        const { data: ownerId } = await supabase.rpc("get_team_owner_id", { _user_id: u?.id });
        if (ownerId && ticket) {
          await supabase.from("kds_call_events").insert({
            ticket_id: ticketId,
            company_id: ownerId,
            display_number: ticket.order_number ?? null,
            event_type: "call",
            created_by: u?.id,
          } as any);
          await supabase.from("kitchen_tickets")
            .update({ last_called_at: new Date().toISOString(), call_count: ((ticket as any).call_count || 0) + 1 } as any)
            .eq("id", ticketId);
        }
      } catch (e) { console.warn("kds call event failed", e); }
    }

    toast.success(newStatus === "preparing" ? "تم قبول الطلب" : newStatus === "ready" ? "الطلب جاهز!" : "تم التحديث");
    loadTickets();
  };

  const recall = async (ticket: Ticket) => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      const { data: ownerId } = await supabase.rpc("get_team_owner_id", { _user_id: u?.id });
      if (!ownerId) return;
      await supabase.from("kds_call_events").insert({
        ticket_id: ticket.id,
        company_id: ownerId,
        display_number: ticket.order_number ?? null,
        event_type: "recall",
        created_by: u?.id,
      } as any);
      await supabase.from("kitchen_tickets")
        .update({ last_called_at: new Date().toISOString(), call_count: ((ticket as any).call_count || 0) + 1 } as any)
        .eq("id", ticket.id);
      toast.success("تمت إعادة النداء");
      loadTickets();
    } catch (e) { toast.error("تعذر إعادة النداء"); }
  };

  const printTicket = async (ticket: Ticket) => {
    const station = stations.find(s => s.id === ticket.station_id);

    const itemsHtml = ticket.items.map((item: any) =>
      `<tr>
        <td style="padding:4px 0;font-weight:900;font-size:14px;color:#000;">${item.name}</td>
        <td style="padding:4px 0;text-align:center;font-size:16px;font-weight:900;color:#000;">×${item.qty}</td>
      </tr>
      ${item.note ? `<tr><td colspan="2" style="font-size:12px;color:#000;font-weight:700;padding:1px 6px 4px;">📝 ${item.note}</td></tr>` : ""}
      ${item.modifiers?.map((m: any) => `<tr><td colspan="2" style="font-size:12px;color:#000;font-weight:700;padding:1px 6px 3px;">↳ ${m.option_name}</td></tr>`).join("") || ""}`
    ).join("");

    const time = new Date(ticket.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });

    const bodyHtml = `
      <div class="header">
        <div class="station-name">🔥 ${station?.name || "المطبخ"}</div>
        <div class="order-num">${ticket.order_number || "---"}</div>
        ${ticket.table_name ? `<div style="font-size:14px;font-weight:900;color:#000;">🪑 ${ticket.table_name}</div>` : ""}
        <div style="font-size:12px;color:#000;font-weight:700;">${time}</div>
      </div>
      <table>${itemsHtml}</table>
    `;

    // Send to bridge — silent, no dialog — with stationId for correct printer routing
    const bridgeOrder: PrintOrder = {
      orderNumber: ticket.order_number || "---",
      branchName: station?.name || "المطبخ",
      tableNumber: ticket.table_name,
      stationId: ticket.station_id,
      items: ticket.items.map((item: any) => ({
        id: item.product_id || item.name,
        name: item.name,
        quantity: item.qty,
        price: 0,
        note: item.note || undefined,
        modifiers: item.modifiers?.map((m: any) => ({ option_name: m.option_name })),
      })),
      total: 0,
    };
    printStationTicketImage(bridgeOrder, ticket.station_id || "", bridgeOrder.items).catch(() => {
      console.warn("Print bridge unavailable");
    });

    supabase.from("kitchen_tickets").update({ printed_at: new Date().toISOString() } as any).eq("id", ticket.id);
  };

  const getElapsed = (created: string) => {
    const diff = Math.floor((Date.now() - new Date(created).getTime()) / 60000);
    if (diff < 1) return "الآن";
    return `${diff} د`;
  };

  const pendingTickets = tickets.filter(t => t.status === "pending");
  const preparingTickets = tickets.filter(t => t.status === "preparing");
  const readyTickets = tickets.filter(t => t.status === "ready");

  return (
    <div className="min-h-screen bg-[#0f172a] text-white" dir="rtl">
      {/* Top Bar */}
      <div className="bg-[#1e293b] border-b border-white/10 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="text-white/60 hover:text-white" onClick={() => navigate("/pos")}>
          <ArrowRightFromLine className="h-5 w-5" />
        </Button>
        <ChefHat className="h-6 w-6 text-amber-400" />
        <h1 className="text-lg font-bold">شاشة المطبخ</h1>

        <Select value={selectedStation} onValueChange={setSelectedStation}>
          <SelectTrigger className="w-[180px] bg-white/10 border-white/20 text-white h-9">
            <SelectValue placeholder="كل المحطات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المحطات</SelectItem>
            {stations.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mr-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white" onClick={() => setSoundEnabled(!soundEnabled)}>
            <Volume2 className={`h-4 w-4 ${soundEnabled ? "text-amber-400" : "text-white/30"}`} />
          </Button>
          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white" onClick={loadTickets}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="bg-amber-500/20 text-amber-300">
            {pendingTickets.length} جديد
          </Badge>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-3 gap-0 h-[calc(100vh-60px)]">
        {/* Pending Column */}
        <div className="flex flex-col bg-[#0f172a] min-h-full">
          <div className="flex items-center gap-2 py-3 px-4 sticky top-0 bg-[#0f172a] z-[5]">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="font-bold text-amber-300">جديد ({pendingTickets.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 px-3 pb-4">
            {pendingTickets.map(t => (
              <TicketCard key={t.id} ticket={t} stations={stations} onStatusChange={updateStatus} onPrint={printTicket} getElapsed={getElapsed} onRecall={recall} />
            ))}
          </div>
        </div>

        {/* Preparing Column */}
        <div className="flex flex-col bg-[#0f172a] min-h-full border-x border-white/5">
          <div className="flex items-center gap-2 py-3 px-4 sticky top-0 bg-[#0f172a] z-[5]">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h2 className="font-bold text-blue-300">قيد التحضير ({preparingTickets.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 px-3 pb-4">
            {preparingTickets.map(t => (
              <TicketCard key={t.id} ticket={t} stations={stations} onStatusChange={updateStatus} onPrint={printTicket} getElapsed={getElapsed} onRecall={recall} />
            ))}
          </div>
        </div>

        {/* Ready Column */}
        <div className="flex flex-col bg-[#0f172a] min-h-full">
          <div className="flex items-center gap-2 py-3 px-4 sticky top-0 bg-[#0f172a] z-[5]">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <h2 className="font-bold text-green-300">جاهز ({readyTickets.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 px-3 pb-4">
            {readyTickets.map(t => (
              <TicketCard key={t.id} ticket={t} stations={stations} onStatusChange={updateStatus} onPrint={printTicket} getElapsed={getElapsed} onRecall={recall} />
            ))}
          </div>
        </div>
      </div>

      {tickets.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-white/30">
            <ChefHat className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-bold">لا توجد طلبات حالياً</p>
            <p className="text-sm mt-1">الطلبات الجديدة ستظهر تلقائياً</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket, stations, onStatusChange, onPrint, getElapsed, onRecall }: {
  ticket: Ticket;
  stations: Station[];
  onStatusChange: (id: string, status: string) => void;
  onPrint: (ticket: Ticket) => void;
  getElapsed: (created: string) => string;
  onRecall?: (ticket: Ticket) => void;
}) {
  const station = stations.find(s => s.id === ticket.station_id);
  const elapsed = getElapsed(ticket.created_at);
  const isUrgent = (Date.now() - new Date(ticket.created_at).getTime()) > 10 * 60000; // 10 min

  return (
    <div className={`rounded-xl border overflow-hidden ${isUrgent && ticket.status === "pending" ? "border-red-500 animate-pulse" : "border-white/10"} bg-[#1e293b]`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: station?.color || "#64748b" }}>
        <span className="font-bold text-sm">{ticket.order_number || "---"}</span>
        <div className="flex items-center gap-2">
          {ticket.table_name && (
            <Badge variant="secondary" className="bg-black/20 text-white text-xs">🪑 {ticket.table_name}</Badge>
          )}
          <div className="flex items-center gap-1 text-xs bg-black/20 rounded-full px-2 py-0.5">
            <Clock className="h-3 w-3" />
            {elapsed}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="p-3 space-y-2">
        {ticket.items.map((item: any, i: number) => (
          <div key={i} className="flex items-start gap-2">
            <span className="bg-white/10 text-white font-bold text-sm w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
              {item.qty}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-white/90 leading-tight">{item.name}</p>
              {item.modifiers?.map((m: any, mi: number) => (
                <p key={mi} className="text-xs text-white/50">↳ {m.option_name}</p>
              ))}
              {item.note && <p className="text-xs text-amber-300/70 italic">📝 {item.note}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        {ticket.status === "pending" && (
          <Button className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => onStatusChange(ticket.id, "preparing")}>
            <ArrowRight className="h-3.5 w-3.5" />
            بدء التحضير
          </Button>
        )}
        {ticket.status === "preparing" && (
          <Button className="flex-1 h-9 bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => onStatusChange(ticket.id, "ready")}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            جاهز
          </Button>
        )}
        {ticket.status === "ready" && (
          <Button className="flex-1 h-9 bg-white/10 hover:bg-white/20 text-white gap-1" onClick={() => onStatusChange(ticket.id, "served")}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            تم التسليم
          </Button>
        )}
        {ticket.status === "ready" && onRecall && (
          <Button variant="ghost" size="icon" className="h-9 w-9 text-emerald-300 hover:text-emerald-200" onClick={() => onRecall(ticket)} title="إعادة النداء">
            <Megaphone className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/50 hover:text-white" onClick={() => onPrint(ticket)}>
          <Printer className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
