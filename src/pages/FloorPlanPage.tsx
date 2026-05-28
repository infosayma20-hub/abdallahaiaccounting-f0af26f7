import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, LogOut, Settings, Users, Clock, ChevronDown,
  UtensilsCrossed, Circle, Square, RectangleHorizontal,
  ArrowRightLeft, Printer, CreditCard, ShoppingCart,
  Armchair, AlertTriangle, Sparkles, CalendarClock, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import TableActionModal from "@/components/restaurant/TableActionModal";
import TransferTableModal from "@/components/restaurant/TransferTableModal";

interface Section {
  id: string;
  name: string;
  sort_order: number;
}

interface Table {
  id: string;
  section_id: string;
  name: string;
  seats: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  status: string;
  current_order_id: string | null;
  current_guests: number;
  occupied_at: string | null;
  is_active: boolean;
}

interface OrderInfo {
  id: string;
  total: number;
  order_number: string | null;
  created_at: string;
  guest_count: number;
  guest_name: string | null;
  items_count: number;
}

const STATUS_CONFIG: Record<string, {
  bg: string; border: string; dot: string; label: string; text: string; glow: string;
}> = {
  available: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-300 dark:border-emerald-700",
    dot: "bg-emerald-500",
    label: "فارغة",
    text: "text-emerald-700 dark:text-emerald-400",
    glow: "shadow-emerald-200/50",
  },
  occupied: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300 dark:border-red-700",
    dot: "bg-red-500",
    label: "مشغولة",
    text: "text-red-700 dark:text-red-400",
    glow: "shadow-red-200/50",
  },
  reserved: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
    label: "محجوزة",
    text: "text-amber-700 dark:text-amber-400",
    glow: "shadow-amber-200/50",
  },
  cleaning: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-300 dark:border-sky-700",
    dot: "bg-sky-500",
    label: "تنظيف",
    text: "text-sky-700 dark:text-sky-400",
    glow: "shadow-sky-200/50",
  },
};

function getElapsedMinutes(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function formatElapsed(dateStr: string | null): string {
  const mins = getElapsedMinutes(dateStr);
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}س ${m}د`;
}

export default function FloorPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, OrderInfo>>({});
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSource, setTransferSource] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    const ownerId = (await supabase.rpc("get_team_owner_id", { _user_id: userId })).data || userId;

    const [secRes, tabRes] = await Promise.all([
      supabase.from("restaurant_sections").select("*").eq("user_id", ownerId).eq("is_active", true).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("user_id", ownerId).eq("is_active", true),
    ]);

    const secs = (secRes.data || []) as Section[];
    const tabs = (tabRes.data || []) as Table[];
    setSections(secs);
    setTables(tabs);
    if (secs.length > 0 && !activeSection) setActiveSection(secs[0].id);

    // Load order info for occupied tables
    const occupiedIds = tabs.filter(t => t.current_order_id).map(t => t.current_order_id!);
    if (occupiedIds.length > 0) {
      const { data: ordersData } = await supabase
        .from("pos_orders")
        .select("id, total, order_number, created_at, guest_count, guest_name")
        .in("id", occupiedIds);

      const ordMap: Record<string, OrderInfo> = {};
      for (const o of ordersData || []) {
        // get items count
        const { count } = await supabase
          .from("pos_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("order_id", o.id);
        ordMap[o.id] = { ...o, items_count: count || 0 };
      }
      setOrders(ordMap);
    }

    setLoading(false);
  }, [userId, activeSection]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`table-updates-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setTables(prev => prev.filter(t => t.id !== payload.old.id));
        } else {
          const updated = payload.new as Table;
          setTables(prev => {
            const exists = prev.find(t => t.id === updated.id);
            if (exists) return prev.map(t => t.id === updated.id ? { ...t, ...updated } : t);
            return [...prev, updated];
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const filteredTables = activeSection
    ? tables.filter(t => t.section_id === activeSection)
    : tables;

  const stats = {
    available: tables.filter(t => t.status === "available").length,
    occupied: tables.filter(t => t.status === "occupied").length,
    reserved: tables.filter(t => t.status === "reserved").length,
    cleaning: tables.filter(t => t.status === "cleaning").length,
  };

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
  };

  const handleOpenOrder = (table: Table, guestCount: number, guestName: string) => {
    // Navigate to POS with table context
    navigate(`/pos?table_id=${table.id}&table_name=${table.name}&guests=${guestCount}&guest_name=${encodeURIComponent(guestName)}`);
  };

  const handleTransfer = (table: Table) => {
    setTransferSource(table);
    setShowTransfer(true);
    setSelectedTable(null);
  };

  const handleMarkAvailable = async (tableId: string) => {
    await supabase.from("restaurant_tables").update({
      status: "available", current_order_id: null, current_guests: 0, occupied_at: null,
    }).eq("id", tableId);
    setSelectedTable(null);
    toast.success("تم تحرير الطاولة");
  };

  const handleViewOrder = (table: Table, action?: string) => {
    if (table.current_order_id) {
      let url = `/pos?table_id=${table.id}&table_name=${table.name}&order_id=${table.current_order_id}`;
      if (action) url += `&action=${action}`;
      navigate(url);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-muted/30 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-card border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">خريطة الطاولات</h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("ar-PS", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/apps", { replace: true })}>
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/pos/floor-plan/edit")}>
            <Settings className="w-4 h-4 ml-1" />
            تصميم الخريطة
          </Button>
          <Button size="sm" onClick={() => navigate("/pos")}>
            <ShoppingCart className="w-4 h-4 ml-1" />
            طلب سريع
          </Button>
        </div>
      </header>

      {/* Section tabs */}
      <div className="bg-card border-b px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        {sections.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeSection === sec.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {sec.name}
          </button>
        ))}
        {sections.length === 0 && (
          <p className="text-sm text-muted-foreground">
            لا توجد قاعات. <button onClick={() => navigate("/pos/floor-plan/edit")} className="text-primary underline">أنشئ قاعة</button>
          </p>
        )}
      </div>

      {/* Floor plan grid */}
      <div className="flex-1 overflow-auto p-4">
        {filteredTables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <UtensilsCrossed className="w-12 h-12 opacity-30" />
            <p>لا توجد طاولات في هذه القاعة</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/pos/floor-plan/edit")}>
              <Plus className="w-4 h-4 ml-1" />
              إضافة طاولات
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimatePresence>
              {filteredTables.map(table => {
                const s = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;
                const order = table.current_order_id ? orders[table.current_order_id] : null;
                const elapsed = getElapsedMinutes(table.occupied_at);
                const isLong = elapsed > 90;

                return (
                  <motion.div
                    key={table.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => handleTableClick(table)}
                    className={`
                      relative cursor-pointer rounded-2xl border-2 p-4
                      ${s.bg} ${s.border}
                      transition-all duration-200
                      hover:shadow-lg hover:scale-[1.03] ${s.glow}
                      select-none flex flex-col items-center gap-2
                    `}
                  >
                    {/* Status dot */}
                    <div className={`absolute top-2 left-2 w-2.5 h-2.5 rounded-full ${s.dot} animate-pulse`} />

                    {/* Long time alert */}
                    {isLong && (
                      <div className="absolute top-2 right-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </div>
                    )}

                    {/* Shape icon */}
                    <div className="w-10 h-10 rounded-lg bg-background/60 flex items-center justify-center">
                      {table.shape === "round" ? (
                        <Circle className="w-6 h-6 text-muted-foreground" />
                      ) : table.shape === "rectangle" ? (
                        <RectangleHorizontal className="w-6 h-6 text-muted-foreground" />
                      ) : (
                        <Square className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Table name */}
                    <p className="text-sm font-bold text-foreground">{table.name}</p>

                    {/* Seats */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Armchair className="w-3.5 h-3.5" />
                      <span>{table.seats} كرسي</span>
                    </div>

                    {/* Status label */}
                    <Badge variant="secondary" className={`text-[10px] ${s.text}`}>
                      {s.label}
                    </Badge>

                    {/* Order info */}
                    {table.status === "occupied" && order && (
                      <div className="mt-1 text-center space-y-0.5">
                        <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                          ₪{order.total?.toFixed(0) || 0}
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatElapsed(table.occupied_at)}</span>
                        </div>
                      </div>
                    )}

                    {table.status === "occupied" && !order && table.occupied_at && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatElapsed(table.occupied_at)}</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bottom stats bar */}
      <footer className="bg-card border-t px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            فارغة: {stats.available}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            مشغولة: {stats.occupied}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            محجوزة: {stats.reserved}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            تنظيف: {stats.cleaning}
          </span>
        </div>
        <div className="text-xs text-muted-foreground font-mono tabular-nums">
          إجمالي الطاولات: {tables.length}
        </div>
      </footer>

      {/* Table action modal */}
      <TableActionModal
        table={selectedTable}
        order={selectedTable?.current_order_id ? orders[selectedTable.current_order_id] : null}
        onClose={() => setSelectedTable(null)}
        onOpenOrder={handleOpenOrder}
        onViewOrder={handleViewOrder}
        onTransfer={handleTransfer}
        onMarkAvailable={handleMarkAvailable}
      />

      {/* Transfer modal */}
      <TransferTableModal
        open={showTransfer}
        onClose={() => { setShowTransfer(false); setTransferSource(null); }}
        sourceTable={transferSource}
        allTables={tables}
        userId={userId || ""}
        onDone={() => { setShowTransfer(false); setTransferSource(null); loadData(); }}
      />
    </div>
  );
}
