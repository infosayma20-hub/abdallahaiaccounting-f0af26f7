import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid, Plus, Clock, AlertTriangle, List } from "lucide-react";
import AllTablesSheet from "./AllTablesSheet";

interface TableBarItem {
  id: string;
  name: string;
  seats: number;
  status: string;
  current_order_id: string | null;
  current_guests: number;
  occupied_at: string | null;
  current_total: number;
}

interface TableSelectorBarProps {
  dataOwnerId: string;
  activeTableId: string | null;
  onTableSelect: (table: TableBarItem) => void;
  onNewTable: () => void;
}

function getElapsedMinutes(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

const STATUS_STYLES: Record<string, {
  base: string;
  hover: string;
  dot: string;
  dotPulse: boolean;
}> = {
  available: {
    base: "border-border bg-card text-muted-foreground",
    hover: "hover:border-muted-foreground/40 hover:bg-muted/50",
    dot: "bg-muted-foreground/40",
    dotPulse: false,
  },
  occupied: {
    base: "border-destructive/40 bg-destructive/5 text-destructive",
    hover: "hover:border-destructive/60 hover:bg-destructive/10",
    dot: "bg-destructive",
    dotPulse: true,
  },
  reserved: {
    base: "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
    hover: "hover:border-amber-500/60",
    dot: "bg-amber-500",
    dotPulse: false,
  },
  cleaning: {
    base: "border-sky-400/40 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400",
    hover: "hover:border-sky-500/60",
    dot: "bg-sky-500",
    dotPulse: false,
  },
};

export default function TableSelectorBar({
  dataOwnerId,
  activeTableId,
  onTableSelect,
  onNewTable,
}: TableSelectorBarProps) {
  const [tables, setTables] = useState<TableBarItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const fetchTables = useCallback(async () => {
    if (!dataOwnerId) return;

    const { data: tablesData } = await supabase
      .from("restaurant_tables")
      .select("id, name, seats, status, current_order_id, current_guests, occupied_at")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("name");

    if (!tablesData || tablesData.length === 0) {
      setTables([]);
      return;
    }

    // Fetch totals for occupied tables
    const occupiedOrderIds = tablesData
      .filter(t => t.current_order_id)
      .map(t => t.current_order_id!);

    let orderTotals: Record<string, number> = {};
    if (occupiedOrderIds.length > 0) {
      const { data: orders } = await supabase
        .from("pos_orders")
        .select("id, total")
        .in("id", occupiedOrderIds);
      if (orders) {
        orders.forEach(o => { orderTotals[o.id] = Number(o.total) || 0; });
      }
    }

    setTables(tablesData.map(t => ({
      ...t,
      current_total: t.current_order_id ? (orderTotals[t.current_order_id] || 0) : 0,
    })));
  }, [dataOwnerId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Real-time updates
  useEffect(() => {
    if (!dataOwnerId) return;
    const channel = supabase
      .channel(`pos-table-bar-${dataOwnerId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "restaurant_tables",
      }, () => fetchTables())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTables, dataOwnerId]);

  if (tables.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/30 border-b border-border overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
      {/* Label — acts as "View All" button */}
      <button
        onClick={() => setShowAll(true)}
        className="flex items-center gap-1 text-muted-foreground/60 ml-1 flex-shrink-0 hover:text-foreground transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium">طاولات</span>
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-border flex-shrink-0" />

      {/* Table chips */}
      {tables.map(table => {
        const s = STATUS_STYLES[table.status] || STATUS_STYLES.available;
        const isActive = activeTableId === table.id;
        const elapsed = getElapsedMinutes(table.occupied_at);
        const isLong = table.status === "occupied" && elapsed > 60;

        return (
          <button
            key={table.id}
            onClick={() => onTableSelect(table)}
            className={`
              flex items-center gap-1.5
              px-3 py-1.5 rounded-lg border
              text-xs font-medium
              transition-all duration-150
              flex-shrink-0
              ${s.base} ${s.hover}
              ${isActive
                ? "ring-2 ring-primary ring-offset-1 scale-105 shadow-sm"
                : ""
              }
            `}
          >
            {/* Status dot */}
            <span className={`
              w-2 h-2 rounded-full flex-shrink-0
              ${s.dot}
              ${s.dotPulse ? "animate-pulse" : ""}
            `} />

            {/* Table name */}
            <span className="font-semibold">{table.name}</span>

            {/* Amount if occupied */}
            {table.status === "occupied" && table.current_total > 0 && (
              <span className="font-mono text-[11px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-md">
                ₪{table.current_total.toFixed(0)}
              </span>
            )}

            {/* Long time warning */}
            {isLong && (
              <span className="text-amber-500 text-xs">⏰</span>
            )}

          </button>
        );
      })}

      {/* New table button */}
      <button
        onClick={onNewTable}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-primary/30 text-primary text-xs font-medium hover:bg-primary/5 hover:border-primary/50 transition-all flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        جديد
      </button>


      {/* All tables sheet */}
      <AllTablesSheet
        open={showAll}
        onClose={() => setShowAll(false)}
        dataOwnerId={dataOwnerId}
        onTableSelect={(t) => { onTableSelect(t); setShowAll(false); }}
      />
    </div>
  );
}

export type { TableBarItem };
