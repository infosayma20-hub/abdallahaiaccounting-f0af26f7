import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Bell, Phone, MapPin, Truck, ShoppingBag, CreditCard, Banknote,
  CheckCircle, Clock, User, X, ChevronDown,
} from "lucide-react";

interface CallCenterOrder {
  id: string;
  source_app: string;
  target_branch_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  payment_method: string;
  items: any[];
  total: number;
  order_note: string | null;
  status: string;
  dispatched_by_name: string;
  created_at: string;
}

interface Props {
  dataOwnerId: string;
  branchId: string | null;
  sessionId: string | null;
  enabled: boolean;
  onAcceptOrder: (order: CallCenterOrder) => void;
}

// Notification sound
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.8, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(880, 0, 0.25);
    playTone(1100, 0.3, 0.25);
    playTone(1320, 0.6, 0.3);
  } catch (e) {
    // Fallback: do nothing if AudioContext unavailable
  }
};

const PendingOrdersPanel = ({ dataOwnerId, branchId, sessionId, enabled, onAcceptOrder }: Props) => {
  const [orders, setOrders] = useState<CallCenterOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const prevCountRef = useRef(0);

  // Load pending orders for this branch
  const loadPendingOrders = useCallback(async () => {
    if (!dataOwnerId || !enabled) return;

    let query = supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (branchId) {
      query = query.eq("target_branch_id", branchId);
    }

    const { data } = await query;
    const newOrders = (data as any as CallCenterOrder[]) || [];
    
    // Play sound if new orders appeared
    if (newOrders.length > prevCountRef.current && prevCountRef.current >= 0) {
      playNotificationSound();
      const newest = newOrders[0];
      if (newest && prevCountRef.current > 0) {
        toast.info(`📞 طلب جديد من الكول سنتر: ${newest.customer_name}`, {
          duration: 10000,
          description: `${newest.source_app} • ${newest.delivery_type === "delivery" ? "توصيل" : "استلام"} • ₪${newest.total}`,
          action: {
            label: "عرض",
            onClick: () => setOpen(true),
          },
        });
      }
    }
    prevCountRef.current = newOrders.length;
    setOrders(newOrders);
  }, [dataOwnerId, branchId, enabled]);

  // Initial load
  useEffect(() => {
    if (enabled) loadPendingOrders();
  }, [enabled, loadPendingOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!dataOwnerId || !enabled) return;

    const channel = supabase
      .channel("call-center-orders")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_center_orders",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        () => {
          loadPendingOrders();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_center_orders",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        () => {
          loadPendingOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dataOwnerId, enabled, loadPendingOrders]);

  const handleAccept = async (order: CallCenterOrder) => {
    setAccepting(order.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Atomic update: only accept if still pending (prevents double-accept)
      const { data: updated, error } = await supabase
        .from("call_center_orders" as any)
        .update({
          status: "accepted",
          accepted_by: user?.id,
          accepted_at: new Date().toISOString(),
          session_id: sessionId,
        } as any)
        .eq("id", order.id)
        .eq("status", "pending") // Only if still pending
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        toast.warning("⚠️ هذا الطلب تم قبوله من كاشير آخر");
        // Remove from local list immediately
        setOrders(prev => prev.filter(o => o.id !== order.id));
        return;
      }

      // Remove from local list immediately so other cashiers see the update via realtime
      setOrders(prev => prev.filter(o => o.id !== order.id));
      onAcceptOrder(order);
      toast.success(`✅ تم قبول طلب ${order.customer_name}`);
    } catch (err: any) {
      toast.error("خطأ: " + (err.message || ""));
    } finally {
      setAccepting(null);
    }
  };

  const pendingCount = orders.length;

  return (
    <>
      {/* Bell button in top bar */}
      <button
        onClick={() => setOpen(true)}
        className="relative h-8 w-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-all group"
        style={{ border: "1px solid rgba(255,255,255,0.15)" }}
        title="فواتير معلقة"
      >
        <Bell className={`h-4 w-4 ${pendingCount > 0 ? "text-amber-400 animate-pulse" : "text-white/70 group-hover:text-white"}`} />
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
            {pendingCount}
          </span>
        )}
        <span className="absolute top-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          فواتير معلقة ({pendingCount})
        </span>
      </button>

      {/* Orders Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0" dir="rtl">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              فواتير معلقة من الكول سنتر
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-xs">{pendingCount}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-80px)]">
            <div className="p-4 space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">لا توجد فواتير معلقة</p>
                </div>
              ) : (
                <AnimatePresence>
                  {orders.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 100 }}
                      className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-primary/10">
                            {order.source_app}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <Badge className={`text-xs ${order.delivery_type === "delivery" ? "bg-orange-500" : "bg-blue-500"}`}>
                          {order.delivery_type === "delivery" ? (
                            <><Truck className="h-3 w-3 ml-1" /> توصيل</>
                          ) : (
                            <><ShoppingBag className="h-3 w-3 ml-1" /> استلام</>
                          )}
                        </Badge>
                      </div>

                      {/* Customer Info */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <User className="h-4 w-4 text-primary" />
                          {order.customer_name}
                        </div>
                        {order.customer_phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span dir="ltr">{order.customer_phone}</span>
                          </div>
                        )}
                        {order.delivery_address && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {order.delivery_address}
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="bg-background/60 rounded-lg p-2.5 space-y-1">
                        {(order.items || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span>{item.name} × {item.qty}</span>
                            <span className="font-mono">₪{(item.total || 0).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold text-sm border-t border-border pt-1.5 mt-1.5">
                          <span>المجموع</span>
                          <span className="font-mono">₪{order.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Payment & Note */}
                      <div className="flex items-center gap-3 text-xs">
                      <Badge variant="outline" className={`${order.payment_method.startsWith("visa") ? "border-purple-500/30 text-purple-600" : "border-green-500/30 text-green-600"}`}>
                          {order.payment_method === "cash" ? (
                            <><Banknote className="h-3 w-3 ml-1" /> نقدي</>
                          ) : order.payment_method === "visa" ? (
                            <><CreditCard className="h-3 w-3 ml-1" /> فيزا</>
                          ) : (
                            <><CreditCard className="h-3 w-3 ml-1" /> {order.payment_method.replace("visa_", "فيزا ").replace(/_/g, " ")}</>
                          )}
                        </Badge>
                        <span className="text-muted-foreground">بواسطة: {order.dispatched_by_name}</span>
                      </div>
                      {order.order_note && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">📝 {order.order_note}</p>
                      )}

                      {/* Accept Button */}
                      <Button
                        onClick={() => handleAccept(order)}
                        disabled={accepting === order.id}
                        className="w-full h-11 text-sm font-bold gap-2 rounded-xl"
                        style={{ backgroundColor: "#16A34A" }}
                      >
                        {accepting === order.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        قبول ومعالجة الطلب
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default PendingOrdersPanel;
