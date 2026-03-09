import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ShoppingCart, LayoutGrid, X } from "lucide-react";

interface OrderInfo {
  id: string;
  name: string;
  itemCount: number;
  total: number;
  tableId: string | null;
  tableName: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orders: OrderInfo[];
  activeOrderIndex: number;
  onSelectOrder: (index: number) => void;
  onRemoveOrder: (index: number) => void;
}

export default function AllOrdersSheet({ open, onClose, orders, activeOrderIndex, onSelectOrder, onRemoveOrder }: Props) {
  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className="max-h-[60vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="w-4 h-4" />
            جميع الطلبات
            <span className="text-xs font-normal text-muted-foreground">({orders.length})</span>
          </DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-6" dir="rtl">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
            {orders.map((order, idx) => {
              const isActive = idx === activeOrderIndex;
              return (
                <button
                  key={order.id}
                  onClick={() => { onSelectOrder(idx); onClose(); }}
                  className={`relative flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all active:scale-[0.97] ${
                    isActive
                      ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-1"
                      : order.itemCount > 0
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-muted/30"
                  }`}
                >
                  {orders.length > 1 && !isActive && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onRemoveOrder(idx); }}
                      className="absolute top-1 left-1 text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                  <span className="font-bold text-xs text-foreground">{order.name}</span>
                  {order.itemCount > 0 && (
                    <span className="font-mono text-[10px] text-destructive mt-0.5">
                      {order.itemCount} أصناف
                    </span>
                  )}
                  {order.total > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ₪{order.total.toFixed(0)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {orders.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
