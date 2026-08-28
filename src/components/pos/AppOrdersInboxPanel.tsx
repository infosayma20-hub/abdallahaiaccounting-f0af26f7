import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Smartphone, Send, XCircle, RefreshCw, User, Phone, Truck, ShoppingBag, MapPin, StickyNote, Banknote, CreditCard } from "lucide-react";

interface AppOrder {
  id: string;
  source_app: string;
  target_branch_id: string | null;
  target_branch_name: string | null;
  customer_name: string;
  customer_phone: string | null;
  delivery_type: string;
  delivery_address: string | null;
  payment_method: string;
  items: any[];
  total: number;
  delivery_fee: number | null;
  order_note: string | null;
  created_at: string;
  client_reference_id?: string | null;
}

interface Branch { id: string; name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  dataOwnerId: string;
  /** Notify parent (POS) when the pending-review count changes. */
  onCountChange?: (n: number) => void;
}

/**
 * صندوق وارد طلبات تطبيق الجوال — الطلبيات تصل هنا أولاً (status = awaiting_call_center)
 * ولا يراها الكاشير إطلاقاً. موظف الكول سنتر يراجعها ثم يحوّلها للفرع (status = pending)
 * أو يلغيها.
 */
export default function AppOrdersInboxPanel({ open, onClose, dataOwnerId, onCountChange }: Props) {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [branchOverride, setBranchOverride] = useState<Record<string, string>>({});
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const countRef = useRef(0);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .eq("status", "awaiting_call_center")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error("تعذر تحميل طلبات التطبيق"); return; }
    const list = ((data as any) || []) as AppOrder[];
    setOrders(list);
    if (list.length !== countRef.current) {
      countRef.current = list.length;
      onCountChange?.(list.length);
    }
  }, [dataOwnerId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dataOwnerId) return;
    const ch = supabase
      .channel(`app-orders-inbox-${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_center_orders", filter: `user_id=eq.${dataOwnerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dataOwnerId, load]);

  useEffect(() => {
    if (!dataOwnerId || !open) return;
    supabase
      .from("branches")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .then(({ data }) => {
        setBranches(((data || []) as Branch[]).filter(b => !b.name.includes("مركزي") && !b.name.toLowerCase().includes("warehouse")));
      });
  }, [dataOwnerId, open]);

  const releaseToBranch = async (order: AppOrder) => {
    const branchId = branchOverride[order.id] || order.target_branch_id;
    if (!branchId) { toast.error("اختر الفرع قبل التحويل"); return; }
    const branchName = branches.find(b => b.id === branchId)?.name || order.target_branch_name || "";
    setBusyId(order.id);
    // الحالة تُفحص مجدداً في الشرط حتى لا يتم التحويل مرتين من جهازين
    const { data, error } = await supabase
      .from("call_center_orders" as any)
      .update({
        status: "pending",
        target_branch_id: branchId,
        target_branch_name: branchName,
        dispatched_by_name: "الكول سنتر (تطبيق)",
      })
      .eq("id", order.id)
      .eq("user_id", dataOwnerId)
      .eq("status", "awaiting_call_center")
      .select("id");
    setBusyId(null);
    if (error) { toast.error("فشل التحويل: " + error.message); return; }
    if (!data || (data as any[]).length === 0) { toast.info("تم التعامل مع هذه الطلبية مسبقاً"); load(); return; }
    toast.success(`تم تحويل الطلبية إلى ${branchName}`);
    load();
  };

  const cancelOrder = async () => {
    if (!cancelId) return;
    setBusyId(cancelId);
    const { error } = await supabase
      .from("call_center_orders" as any)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason || "ألغيت من الكول سنتر",
        cancelled_by_name: "الكول سنتر",
      })
      .eq("id", cancelId)
      .eq("user_id", dataOwnerId)
      .eq("status", "awaiting_call_center");
    setBusyId(null);
    setCancelId(null);
    setCancelReason("");
    if (error) { toast.error("فشل الإلغاء: " + error.message); return; }
    toast.success("تم إلغاء الطلبية");
    load();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="left" className="w-full sm:max-w-lg p-0 flex flex-col" dir="rtl">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            طلبات التطبيق — بانتظار المراجعة
            <Badge className="bg-amber-500 text-white">{orders.length}</Badge>
            <Button variant="ghost" size="sm" className="ms-auto" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {orders.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-10">لا توجد طلبات تطبيق بانتظار المراجعة</div>
            )}
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <User className="h-3.5 w-3.5" />
                    {o.customer_name}
                  </div>
                  <div className="text-sm font-bold">₪{Number(o.total || 0).toFixed(2)}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {o.customer_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{o.customer_phone}</span>}
                  <span className="flex items-center gap-1">
                    {o.delivery_type === "delivery" ? <Truck className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                    {o.delivery_type === "delivery" ? "توصيل" : "استلام"}
                  </span>
                  <span className="flex items-center gap-1">
                    {o.payment_method === "visa" ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                    {o.payment_method === "visa" ? "بطاقة" : "نقدي"}
                  </span>
                  <span>{new Date(o.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {o.delivery_address && (
                  <div className="text-[11px] flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5" />{o.delivery_address}</div>
                )}
                {o.order_note && (
                  <div className="text-[11px] flex items-start gap-1"><StickyNote className="h-3 w-3 mt-0.5" />{o.order_note}</div>
                )}
                <div className="rounded bg-muted/50 p-2 space-y-1">
                  {(o.items || []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span>{it.qty} × {it.name}</span>
                      <span>₪{Number(it.total || 0).toFixed(2)}</span>
                    </div>
                  ))}
                  {Number(o.delivery_fee || 0) > 0 && (
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>رسوم التوصيل</span>
                      <span>₪{Number(o.delivery_fee).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 h-9 rounded-md border bg-background px-2 text-xs"
                    value={branchOverride[o.id] || o.target_branch_id || ""}
                    onChange={(e) => setBranchOverride(p => ({ ...p, [o.id]: e.target.value }))}
                  >
                    <option value="">اختر الفرع…</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <Button size="sm" disabled={busyId === o.id} onClick={() => releaseToBranch(o)}>
                    <Send className="h-3.5 w-3.5 ms-1" />
                    تحويل للفرع
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busyId === o.id} onClick={() => { setCancelId(o.id); setCancelReason(""); }}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {cancelId === o.id && (
                  <div className="space-y-2 border-t pt-2">
                    <Textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="سبب الإلغاء"
                      className="text-xs"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={cancelOrder} disabled={busyId === o.id}>تأكيد الإلغاء</Button>
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>تراجع</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
