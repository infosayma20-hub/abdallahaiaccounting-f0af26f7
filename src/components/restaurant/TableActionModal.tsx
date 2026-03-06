import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UtensilsCrossed, ArrowRightLeft, Printer, CreditCard,
  Users, Clock, Plus, Minus, ShoppingCart, Sparkles, Armchair,
} from "lucide-react";

interface Table {
  id: string;
  name: string;
  seats: number;
  status: string;
  current_order_id: string | null;
  occupied_at: string | null;
  current_guests: number;
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

interface Props {
  table: Table | null;
  order: OrderInfo | null;
  onClose: () => void;
  onOpenOrder: (table: Table, guestCount: number, guestName: string) => void;
  onViewOrder: (table: Table, action?: string) => void;
  onTransfer: (table: Table) => void;
  onMarkAvailable: (tableId: string) => void;
}

export default function TableActionModal({
  table, order, onClose, onOpenOrder, onViewOrder, onTransfer, onMarkAvailable,
}: Props) {
  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState("");

  if (!table) return null;

  const isAvailable = table.status === "available";
  const isOccupied = table.status === "occupied";
  const isReserved = table.status === "reserved";

  const elapsed = table.occupied_at
    ? Math.floor((Date.now() - new Date(table.occupied_at).getTime()) / 60000)
    : 0;

  return (
    <Dialog open={!!table} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Armchair className="w-5 h-5 text-primary" />
            طاولة {table.name} — {table.seats} كراسي
          </DialogTitle>
        </DialogHeader>

        {/* Available: open new order */}
        {(isAvailable || isReserved) && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">عدد الضيوف</label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setGuestCount(Math.max(1, guestCount - 1))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-lg font-bold font-mono w-10 text-center">{guestCount}</span>
                <Button variant="outline" size="icon" onClick={() => setGuestCount(Math.min(table.seats + 4, guestCount + 1))}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">اسم الزبون (اختياري)</label>
              <Input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="اسم الزبون..."
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                onOpenOrder(table, guestCount, guestName);
                onClose();
              }}
            >
              <UtensilsCrossed className="w-4 h-4 ml-2" />
              فتح طلب جديد
            </Button>
          </div>
        )}

        {/* Occupied: show order details */}
        {isOccupied && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {table.current_guests} ضيوف
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {elapsed} دقيقة
                </span>
              </div>
              {order && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{order.order_number}</span>
                    <span className="text-xs text-muted-foreground">{order.items_count} أصناف</span>
                  </div>
                  <div className="text-center pt-1">
                    <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                      ₪{order.total?.toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { onViewOrder(table); onClose(); }}>
                <ShoppingCart className="w-4 h-4 ml-1" />
                عرض الطلب
              </Button>
              <Button variant="outline" onClick={() => { onViewOrder(table); onClose(); }}>
                <Plus className="w-4 h-4 ml-1" />
                إضافة أصناف
              </Button>
              <Button variant="outline" onClick={() => { onTransfer(table); onClose(); }}>
                <ArrowRightLeft className="w-4 h-4 ml-1" />
                نقل لطاولة
              </Button>
              <Button variant="outline" onClick={() => { onViewOrder(table, "pay"); onClose(); }}>
                <CreditCard className="w-4 h-4 ml-1" />
                تسوية ودفع
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
