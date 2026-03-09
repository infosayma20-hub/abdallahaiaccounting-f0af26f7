import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Clock, Users, LayoutGrid } from "lucide-react";

interface TableItem {
  id: string;
  name: string;
  seats: number;
  status: string;
  current_order_id: string | null;
  current_guests: number;
  occupied_at: string | null;
  current_total: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dataOwnerId: string;
  onTableSelect: (table: TableItem) => void;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  occupied: { label: "مشغولة", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  reserved: { label: "محجوزة", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-400/30" },
  available: { label: "متاحة", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  cleaning: { label: "تنظيف", color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/30", border: "border-sky-400/30" },
};

function elapsed(dateStr: string | null): string {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60);
  return `${h} س ${mins % 60} د`;
}

export default function AllTablesSheet({ open, onClose, dataOwnerId, onTableSelect }: Props) {
  const [tables, setTables] = useState<TableItem[]>([]);

  const fetch = useCallback(async () => {
    if (!dataOwnerId) return;
    const { data: raw } = await supabase
      .from("restaurant_tables")
      .select("id, name, seats, status, current_order_id, current_guests, occupied_at")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("name");

    if (!raw?.length) { setTables([]); return; }

    const orderIds = raw.filter(t => t.current_order_id).map(t => t.current_order_id!);
    let totals: Record<string, number> = {};
    if (orderIds.length) {
      const { data: orders } = await supabase.from("pos_orders").select("id, total").in("id", orderIds);
      orders?.forEach(o => { totals[o.id] = Number(o.total) || 0; });
    }

    setTables(raw.map(t => ({ ...t, current_total: t.current_order_id ? (totals[t.current_order_id] || 0) : 0 })));
  }, [dataOwnerId]);

  useEffect(() => { if (open) fetch(); }, [open, fetch]);

  const occupied = tables.filter(t => t.status === "occupied");
  const reserved = tables.filter(t => t.status === "reserved");
  const available = tables.filter(t => t.status === "available");
  const other = tables.filter(t => !["occupied", "reserved", "available"].includes(t.status));

  const groups = [
    { key: "occupied", label: `مشغولة (${occupied.length})`, items: occupied },
    { key: "reserved", label: `محجوزة (${reserved.length})`, items: reserved },
    { key: "available", label: `متاحة (${available.length})`, items: available },
    ...(other.length ? [{ key: "other", label: `أخرى (${other.length})`, items: other }] : []),
  ].filter(g => g.items.length > 0);

  const handleSelect = (t: TableItem) => {
    onTableSelect(t);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className="max-h-[75vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="w-4 h-4" />
            جميع الطاولات
            <span className="text-xs font-normal text-muted-foreground">({tables.length})</span>
          </DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-6 space-y-4" dir="rtl">
          {groups.map(g => {
            const s = STATUS_MAP[g.key] || STATUS_MAP.available;
            return (
              <div key={g.key}>
                <p className={`text-xs font-semibold mb-2 ${s.color}`}>{g.label}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.items.map(t => {
                    const st = STATUS_MAP[t.status] || STATUS_MAP.available;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSelect(t)}
                        className={`flex flex-col gap-1 p-3 rounded-xl border text-right transition-all active:scale-[0.97] ${st.bg} ${st.border}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">{t.name}</span>
                          {t.status === "occupied" && t.current_total > 0 && (
                            <span className="font-mono text-xs bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-md">
                              ₪{t.current_total.toFixed(0)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {t.status === "occupied" && t.occupied_at && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {elapsed(t.occupied_at)}
                            </span>
                          )}
                          {t.current_guests > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="w-3 h-3" />
                              {t.current_guests}
                            </span>
                          )}
                          <span>{t.seats} مقاعد</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {tables.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد طاولات</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
