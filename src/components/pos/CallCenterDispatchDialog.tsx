import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, MapPin, Phone, User, Truck, ShoppingBag, CreditCard, Banknote, StickyNote, AlertCircle, CheckCircle2, Wifi, WifiOff, Utensils } from "lucide-react";
import DeliveryZonePicker, { DeliveryInfo } from "./DeliveryZonePicker";

interface CartItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  note?: string;
  product_id?: string | null;
  modifiers?: Array<{ option_name: string; extra_price: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataOwnerId: string;
  cart: CartItem[];
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  orderNote: string;
  onSuccess: () => void;
  /**
   * When set, the dialog is operating in EDIT mode: instead of inserting a new
   * call_center_orders row, F12 updates the existing one with the same id.
   * Branch is locked, status is re-checked just before update.
   */
  editingOrderId?: string | null;
  editingBranchId?: string | null;
  editingBranchName?: string | null;
  editingPaymentMethod?: string | null;
  editingSourceApp?: string | null;
  editingDeliveryInfo?: any | null;
  editingDeliveryFee?: number | null;
}

interface Branch {
  id: string;
  name: string;
}

/**
 * Build a human-readable order note from structured delivery info + base note.
 * This is what cashier + kitchen will see in print and on the receipt.
 */
export function buildOrderNote(args: {
  baseNote: string;
  name: string;
  phone: string;
  info: DeliveryInfo | null;
}): string | null {
  const parts: string[] = [];
  if (args.info) {
    parts.push(`توصيل: ${args.info.city} - ${args.info.area}`);
    parts.push(`الفرع: ${args.info.branch_name}`);
    parts.push(`رسوم التوصيل: ₪${Number(args.info.final_fee).toFixed(2)}${args.info.manually_adjusted ? " (معدّل)" : ""}`);
  }
  if (args.name) parts.push(`الزبون: ${args.name}`);
  if (args.phone) parts.push(`جوال: ${args.phone}`);
  if (args.baseNote) parts.push(`ملاحظة: ${args.baseNote}`);
  return parts.length ? parts.join(" | ") : null;
}

interface DeliveryApp {
  id: string;
  name: string;
  icon: string;
  visa_gl_account_code?: string | null;
}

type PaymentOption = {
  code: string;
  label: string;
  icon: "cash" | "visa";
  color: string;
  gl_note?: string;
};

const CallCenterDispatchDialog = ({
  open, onOpenChange, dataOwnerId, cart, total,
  customerName, customerPhone, deliveryAddress, orderNote, onSuccess,
  editingOrderId, editingBranchId, editingBranchName, editingPaymentMethod, editingSourceApp,
  editingDeliveryInfo, editingDeliveryFee,
}: Props) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [deliveryApps, setDeliveryApps] = useState<DeliveryApp[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [sourceApp, setSourceApp] = useState("طلب مباشر");
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup" | "dine_in">("delivery");
  const [tableLabel, setTableLabel] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  // Track the last auto-filled "City - Area" prefix so we can update it when the
  // zone changes without wiping any manual details (street, building, landmark)
  // the agent typed afterwards.
  const [autoFilledPrefix, setAutoFilledPrefix] = useState<string>("");

  // When the zone picker chooses a branch, auto-bind the dispatch target branch
  // (but only when not in edit mode — branch is locked there).
  useEffect(() => {
    if (editingOrderId) return;
    if (!deliveryInfo || deliveryType !== "delivery") return;
    const match = branches.find(b => b.id === deliveryInfo.branch_id);
    if (match && selectedBranch?.id !== match.id) {
      setSelectedBranch(match);
      setErrors(p => ({ ...p, branch: false, zone: false }));
    }
  }, [deliveryInfo, branches, editingOrderId, deliveryType, selectedBranch?.id]);

  // Auto-populate the delivery address whenever the agent picks/changes a zone.
  // Rules:
  //  - Empty address → fill with "City - Area".
  //  - Address starts with the previously auto-filled prefix → swap only that prefix,
  //    keeping any manual tail (street, building, landmark) intact.
  //  - Otherwise (agent typed a fully custom address) → leave as-is.
  useEffect(() => {
    if (deliveryType !== "delivery") return;
    if (!deliveryInfo) return;
    const newPrefix = `${deliveryInfo.city} - ${deliveryInfo.area}`.trim();
    setAddress(prev => {
      const cur = (prev || "").trim();
      if (!cur) {
        setAutoFilledPrefix(newPrefix);
        setErrors(p => ({ ...p, address: false }));
        return newPrefix;
      }
      if (autoFilledPrefix && cur.startsWith(autoFilledPrefix)) {
        const tail = cur.slice(autoFilledPrefix.length);
        setAutoFilledPrefix(newPrefix);
        return newPrefix + tail;
      }
      return prev;
    });
  }, [deliveryInfo, deliveryType]);
  
  // Branch active sessions tracking
  const [branchSessions, setBranchSessions] = useState<Record<string, number>>({});
  
  // Dispatch tracking
  const [dispatchedOrderId, setDispatchedOrderId] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<"sending" | "pending" | "accepted" | null>(null);
  const trackingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingChannelRef = useRef<any>(null);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    setName(customerName);
    setPhone(customerPhone);
    setAddress(deliveryAddress);
    setNote(orderNote);
    setErrors({});
    setAutoFilledPrefix("");
    setDispatchedOrderId(null);
    setDispatchStatus(null);
    setTableLabel("");
    setDeliveryInfo(
      editingDeliveryInfo && editingDeliveryInfo.area
        ? {
            city: editingDeliveryInfo.city || "",
            area: editingDeliveryInfo.area || "",
            branch_id: editingDeliveryInfo.branch_id || editingBranchId || "",
            branch_name: editingDeliveryInfo.branch_name || editingBranchName || "",
            original_fee: Number(editingDeliveryInfo.original_fee ?? editingDeliveryFee ?? 0),
            final_fee: Number(editingDeliveryInfo.final_fee ?? editingDeliveryFee ?? 0),
            manually_adjusted: !!editingDeliveryInfo.manually_adjusted,
          }
        : null,
    );

    // Load branches
    supabase
      .from("branches")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .then(({ data }) => {
        const filtered = (data || []).filter(b => !b.name.includes("مركزي") && !b.name.toLowerCase().includes("warehouse"));
        setBranches(filtered);
        
        // Check active sessions for each branch
        checkBranchSessions(filtered);

        // 🔒 Edit mode: pre-select the locked branch from the original order.
        if (editingOrderId && editingBranchId) {
          const match = filtered.find(b => b.id === editingBranchId);
          if (match) {
            setSelectedBranch(match);
          } else if (editingBranchName) {
            setSelectedBranch({ id: editingBranchId, name: editingBranchName });
          }
        }
      });

    // Load delivery apps
    supabase
      .from("delivery_apps" as any)
      .select("id, name, icon, visa_gl_account_code")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => setDeliveryApps((data as any) || []));

    // 🔒 Edit mode: also restore source app + payment method from original.
    if (editingOrderId) {
      if (editingSourceApp) setSourceApp(editingSourceApp);
      if (editingPaymentMethod) setPaymentMethod(editingPaymentMethod);
      const rawType = (editingDeliveryInfo as any)?.delivery_type;
      if (rawType === "dine_in" || rawType === "table") {
        setDeliveryType("dine_in");
        setTableLabel((editingDeliveryInfo as any)?.table_label || "");
      } else {
        setDeliveryType(deliveryAddress ? "delivery" : "pickup");
      }
    }

    return () => {
      // Cleanup tracking
      if (trackingTimeoutRef.current) clearTimeout(trackingTimeoutRef.current);
      if (trackingChannelRef.current) supabase.removeChannel(trackingChannelRef.current);
    };
  }, [open, dataOwnerId, customerName, customerPhone, deliveryAddress, orderNote, editingOrderId, editingBranchId, editingBranchName, editingPaymentMethod, editingSourceApp]);

  const checkBranchSessions = async (branchList: Branch[]) => {
    // Check which branches have active POS sessions (cashiers online)
    console.log("[Dispatch] Checking sessions for owner:", dataOwnerId);
    const { data: activeSessions, error: sessErr } = await supabase
      .from("pos_sessions" as any)
      .select("cash_box_id")
      .eq("user_id", dataOwnerId)
      .eq("state", "open");

    console.log("[Dispatch] Active sessions:", activeSessions, "Error:", sessErr);

    if (!activeSessions || activeSessions.length === 0) {
      setBranchSessions({});
      return;
    }

    const boxIds = activeSessions.map((s: any) => s.cash_box_id).filter(Boolean);
    console.log("[Dispatch] Box IDs with sessions:", boxIds);
    if (boxIds.length === 0) {
      setBranchSessions({});
      return;
    }

    // Get branch_id for each active cash box
    const { data: boxes } = await supabase
      .from("cash_boxes")
      .select("id, name, branch_id")
      .in("id", boxIds);

    console.log("[Dispatch] Boxes:", boxes);
    console.log("[Dispatch] Branch list:", branchList);

    const counts: Record<string, number> = {};
    for (const box of (boxes || [])) {
      const branchId = (box as any).branch_id;
      if (branchId) {
        counts[branchId] = (counts[branchId] || 0) + 1;
      } else if (box.name) {
        // Fallback: flexible name matching
        const boxNameNorm = box.name.replace(/\s+/g, ' ').trim();
        const matched = branchList.find(br => {
          const brNameNorm = br.name.replace(/\s+/g, ' ').trim();
          return boxNameNorm.includes(brNameNorm) || brNameNorm.includes(boxNameNorm);
        });
        console.log("[Dispatch] Name match for", box.name, "→", matched?.name || "NO MATCH");
        if (matched) {
          counts[matched.id] = (counts[matched.id] || 0) + 1;
        }
      }
    }
    console.log("[Dispatch] Final counts:", counts);
    setBranchSessions(counts);
  };

  // Build dynamic payment methods
  const paymentOptions: PaymentOption[] = [
    { code: "cash", label: "نقدي", icon: "cash", color: "bg-green-500 border-green-500 text-white" },
    { code: "visa", label: "فيزا", icon: "visa", color: "bg-purple-500 border-purple-500 text-white" },
    ...deliveryApps
      .filter(app => app.visa_gl_account_code)
      .map(app => ({
        code: `visa_${app.name.toLowerCase().replace(/\s+/g, '_')}`,
        label: `فيزا ${app.name}`,
        icon: "visa" as const,
        color: "bg-indigo-500 border-indigo-500 text-white",
        gl_note: app.visa_gl_account_code || undefined,
      })),
  ];

  const validate = (): boolean => {
    const newErrors: Record<string, boolean> = {};
    if (!selectedBranch) newErrors.branch = true;
    if (!name.trim()) newErrors.name = true;
    if (!phone.trim()) newErrors.phone = true;
    if (deliveryType === "delivery" && !address.trim()) newErrors.address = true;
    if (deliveryType === "delivery" && !deliveryInfo) newErrors.zone = true;
    if (deliveryType === "dine_in" && !tableLabel.trim()) newErrors.table = true;
    if (!paymentMethod) newErrors.payment = true;
    if (!sourceApp) newErrors.source = true;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Track order acceptance via realtime
  const startTrackingOrder = useCallback((orderId: string) => {
    setDispatchedOrderId(orderId);
    setDispatchStatus("pending");

    // Listen for status change
    const channel = supabase
      .channel(`dispatch-track-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_center_orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          if (newStatus === "accepted") {
            setDispatchStatus("accepted");
            toast.success(`تم قبول الطلب في فرع ${selectedBranch?.name}`, { duration: 5000 });
            // Auto-close after 2s
            setTimeout(() => {
              setDispatchedOrderId(null);
              setDispatchStatus(null);
            }, 2000);
          }
        }
      )
      .subscribe();

    trackingChannelRef.current = channel;

    // Timeout: warn if not accepted in 30s
    trackingTimeoutRef.current = setTimeout(() => {
      setDispatchStatus((prev) => {
        if (prev === "pending") {
            toast.warning(`الطلب لم يتم قبوله بعد في فرع ${selectedBranch?.name}. تأكد أن الفرع مفتوح.`, { duration: 10000 });
        }
        return prev;
      });
    }, 30000);
  }, [selectedBranch]);

  const handleDispatch = async () => {
    if (!validate()) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    // No blocking confirm anymore — if no cashier is online on the target
    // branch the order is queued and surfaces the moment a cashier opens a
    // shift on that branch (see PendingOrdersPanel). The red banner below
    // the branch grid already makes this visible to the call center agent.

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user?.id || "")
        .maybeSingle();

      // Persist customer to shared contacts table so the same record is
      // visible from POS, CRM and call-center the next time anyone searches
      // by name or phone. Upsert-by-phone within the same data owner.
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();
      if (trimmedPhone && dataOwnerId) {
        try {
          const { data: existing } = await supabase
            .from("contacts")
            .select("id, contact_name, address")
            .eq("user_id", dataOwnerId)
            .eq("phone", trimmedPhone)
            .maybeSingle();
          if (existing?.id) {
            const updates: any = {};
            if (!existing.contact_name && trimmedName) updates.contact_name = trimmedName;
            if (!existing.address && deliveryType === "delivery" && address.trim()) {
              updates.address = address.trim();
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from("contacts").update(updates).eq("id", existing.id);
            }
          } else if (trimmedName) {
            await supabase.from("contacts").insert({
              user_id: dataOwnerId,
              contact_name: trimmedName,
              contact_type: "عميل",
              phone: trimmedPhone,
              address: deliveryType === "delivery" ? (address.trim() || null) : null,
              source: "call_center",
              created_from_order: true,
              is_active: true,
            } as any);
          }
        } catch (contactErr) {
          console.warn("[CallCenter] contact upsert failed (non-blocking):", contactErr);
        }
      }

      const payload = {
        source_app: sourceApp,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        delivery_type: deliveryType,
        delivery_address:
          deliveryType === "delivery"
            ? address.trim()
            : deliveryType === "dine_in"
              ? `طاولة: ${tableLabel.trim()}`
              : null,
        payment_method: paymentMethod.startsWith("visa") ? "visa" : "cash",
        items: cart.map(item => ({
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
          total: item.total,
          product_id: item.product_id || null,
          note: item.note || "",
          modifiers: (item.modifiers || []).map((m: any) => ({
            option_name: m.option_name,
            extra_price: Number(m.extra_price) || 0,
          })),
        })),
        total: total + (deliveryType === "delivery" && deliveryInfo ? Number(deliveryInfo.final_fee) || 0 : 0),
        order_note: buildOrderNote({
          baseNote: [
            deliveryType === "dine_in" && tableLabel.trim() ? `طاولة: ${tableLabel.trim()}` : "",
            note.trim(),
          ].filter(Boolean).join(" | "),
          name: name.trim(),
          phone: phone.trim(),
          info: deliveryType === "delivery" ? deliveryInfo : null,
        }),
        delivery_fee: deliveryType === "delivery" && deliveryInfo ? Number(deliveryInfo.final_fee) || 0 : 0,
        delivery_info:
          deliveryType === "delivery" && deliveryInfo
            ? { ...deliveryInfo, caller_name: name.trim(), caller_phone: phone.trim(), note: note.trim() || null }
            : deliveryType === "dine_in"
              ? { delivery_type: "dine_in", table_label: tableLabel.trim(), caller_name: name.trim(), caller_phone: phone.trim(), note: note.trim() || null }
              : null,
      };

      let orderId: string | null = null;

      if (editingOrderId) {
        // EDIT MODE: atomic RPC — updates same row only if still pending
        // and the edit lock is still owned by this user. The branch cannot
        // see / accept this order while the lock is held.
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          "finish_editing_call_center_order" as any,
          {
            p_order_id: editingOrderId,
            p_customer_name: payload.customer_name,
            p_customer_phone: payload.customer_phone,
            p_delivery_type: payload.delivery_type,
            p_delivery_address: payload.delivery_address,
            p_payment_method: paymentMethod,
            p_source_app: payload.source_app,
            p_items: payload.items as any,
            p_total: payload.total,
            p_order_note: payload.order_note,
            p_delivery_fee: payload.delivery_fee,
            p_delivery_info: payload.delivery_info as any,
          } as any
        );
        if (rpcErr) throw rpcErr;
        const res = (rpcRes as any) || {};
        if (!res.ok) {
          const reason = res.reason || "";
          const msg =
            reason === "already_accepted"
              ? "لا يمكن حفظ التعديل — الطلبية تم قبولها من الفرع"
              : reason === "lock_lost"
                ? "انتهت صلاحية قفل التعديل — افتح الطلبية من السجل مرة أخرى"
                : reason === "not_found"
                  ? "الطلبية لم تعد موجودة"
                  : "تعذّر حفظ التعديل: " + reason;
          toast.error(msg);
          setSending(false);
          onOpenChange(false);
          return;
        }
        orderId = editingOrderId;
        toast.success(`تم تحديث الطلبية في فرع ${selectedBranch!.name}`, { duration: 4000 });
      } else {
        const { data: insertedOrder, error } = await supabase
          .from("call_center_orders" as any)
          .insert({
            ...payload,
            user_id: dataOwnerId,
            target_branch_id: selectedBranch!.id,
            target_branch_name: selectedBranch!.name,
            dispatched_by: user?.id,
            dispatched_by_name: profile?.display_name || user?.email || "كول سنتر",
            status: "pending",
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        orderId = (insertedOrder as any)?.id;
        toast.success(`تم إرسال الطلب إلى فرع ${selectedBranch!.name}`, { duration: 4000 });
      }

      onSuccess();
      
      // Start tracking if we got an order ID
      if (orderId) {
        startTrackingOrder(orderId);
      } else {
        onOpenChange(false);
      }
      
      // Reset form but keep dialog open for tracking
      setSelectedBranch(null);
      setSourceApp("طلب مباشر");
      setDeliveryType("delivery");
      setPaymentMethod("cash");
    } catch (err: any) {
      console.error("Dispatch error:", err);
      toast.error("خطأ في إرسال الطلب: " + (err.message || ""));
    } finally {
      setSending(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? "ring-2 ring-destructive/50 border-destructive" : "";

  // Auto-close after dispatch — tracking is now in the dispatched orders log
  useEffect(() => {
    if (dispatchStatus === "pending" || dispatchStatus === "accepted") {
      if (trackingChannelRef.current) supabase.removeChannel(trackingChannelRef.current);
      if (trackingTimeoutRef.current) clearTimeout(trackingTimeoutRef.current);
      setDispatchedOrderId(null);
      setDispatchStatus(null);
      onOpenChange(false);
      toast.success("تم إرسال الطلب — يمكنك متابعته من سجل الفواتير المحوّلة");
    }
  }, [dispatchStatus]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0" dir="rtl">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            {editingOrderId ? "تحديث الطلبية المحوّلة" : "تحويل الطلب إلى الفرع"}
          </DialogTitle>
        </DialogHeader>
        {editingOrderId && (
          <div className="mx-6 -mt-1 mb-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
            وضع التعديل — سيتم تحديث نفس الطلبية بنفس الـ ID. الفرع مقفل: <b>{editingBranchName || selectedBranch?.name}</b>. الطلبية مخفية عن الفرع حتى ينتهي التعديل.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-4 py-2">
          {/* Source App */}
          <div className="space-y-2">
            <label className="text-sm font-medium">مصدر الطلب *</label>
            <div className={`flex flex-wrap gap-2 p-1 rounded-lg ${errors.source ? "ring-2 ring-destructive/50" : ""}`}>
              {deliveryApps.filter(app => app.name !== "طلب مباشر").map((app) => (
                <button
                  key={app.id}
                  onClick={() => { setSourceApp(app.name); setErrors(p => ({ ...p, source: false })); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    sourceApp === app.name
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {app.icon} {app.name}
                </button>
              ))}
              <button
                onClick={() => { setSourceApp("طلب مباشر"); setErrors(p => ({ ...p, source: false })); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  sourceApp === "طلب مباشر"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border hover:border-primary/30"
                }`}
              >
                طلب مباشر
              </button>
            </div>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <label className="text-sm font-medium">الفرع المستهدف *</label>
            <div className={`grid grid-cols-2 gap-2 ${errors.branch ? "ring-2 ring-destructive/50 rounded-xl p-1" : ""}`}>
              {branches.map((branch) => {
                const activeCount = branchSessions[branch.id] || 0;
                const isOnline = activeCount > 0;
                return (
                  <button
                    key={branch.id}
                    onClick={() => { setSelectedBranch(branch); setErrors(p => ({ ...p, branch: false })); }}
                    className={`relative p-3 rounded-xl text-sm font-bold border-2 transition-all ${
                      selectedBranch?.id === branch.id
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : "bg-muted/30 text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {branch.name}
                    </div>
                    {/* Online/Offline indicator */}
                    <div className={`flex items-center justify-center gap-1 mt-1.5 text-[10px] font-medium ${
                      selectedBranch?.id === branch.id
                        ? isOnline ? "text-green-200" : "text-red-200"
                        : isOnline ? "text-green-600" : "text-red-500"
                    }`}>
                      {isOnline ? (
                        <>
                          <Wifi className="h-3 w-3" />
                          <span>{activeCount} كاشير متصل</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" />
                          <span>لا يوجد كاشير</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Warning if selected branch has no cashier */}
            {selectedBranch && (branchSessions[selectedBranch.id] || 0) === 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>لا يوجد كاشير مفتوح وردية الآن — الطلب سيُحفظ في قائمة انتظار الفرع ويظهر فور فتح أول وردية.</span>
              </div>
            )}
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <User className="h-3 w-3" /> اسم الزبون *
              </label>
              <Input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: false })); }} placeholder="الاسم" className={`h-10 ${fieldError("name")}`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <Phone className="h-3 w-3" /> رقم الجوال *
              </label>
              <Input value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: false })); }} placeholder="05xxxxxxxx" className={`h-10 ${fieldError("phone")}`} dir="ltr" />
            </div>
          </div>

          {/* Delivery Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الطلب *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setDeliveryType("delivery")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  deliveryType === "delivery"
                    ? "bg-orange-500 text-white border-orange-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-orange-300"
                }`}
              >
                <Truck className="h-4 w-4" /> توصيل
              </button>
              <button
                onClick={() => setDeliveryType("pickup")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  deliveryType === "pickup"
                    ? "bg-blue-500 text-white border-blue-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-blue-300"
                }`}
              >
                <ShoppingBag className="h-4 w-4" /> استلام
              </button>
              <button
                onClick={() => setDeliveryType("dine_in")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  deliveryType === "dine_in"
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-emerald-300"
                }`}
              >
                <Utensils className="h-4 w-4" /> طاولة
              </button>
            </div>
          </div>

          {/* Table label (dine-in only) */}
          {deliveryType === "dine_in" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <Utensils className="h-3 w-3" /> رقم / اسم الطاولة *
              </label>
              <Input
                value={tableLabel}
                onChange={e => { setTableLabel(e.target.value); setErrors(p => ({ ...p, table: false })); }}
                placeholder="مثال: T5 — صالة علوية"
                className={`h-10 ${fieldError("table")}`}
              />
              <p className="text-[10px] text-muted-foreground">
                الكاشير في الفرع رح يحجز الطاولة يدوياً بعد قبول الطلبية.
              </p>
            </div>
          )}

          {/* Delivery Address */}
          {deliveryType === "delivery" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" /> عنوان التوصيل *
              </label>
              <Input value={address} onChange={e => { setAddress(e.target.value); setErrors(p => ({ ...p, address: false })); }} placeholder="المدينة، الشارع، رقم البناية..." className={`h-10 ${fieldError("address")}`} />
            </div>
          )}

          {/* Delivery Zone Picker */}
          {deliveryType === "delivery" && (
            <div className={errors.zone ? "ring-2 ring-destructive/50 rounded-xl" : ""}>
              <DeliveryZonePicker
                dataOwnerId={dataOwnerId}
                value={deliveryInfo}
                onChange={setDeliveryInfo}
                lockedBranchId={editingOrderId ? editingBranchId : null}
              />
              {errors.zone && (
                <p className="text-[11px] font-bold text-destructive mt-1">
                  يرجى اختيار الفرع لأن سعر التوصيل قد يكون متساوٍ بين أكثر من فرع.
                </p>
              )}
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-sm font-medium">طريقة الدفع *</label>
            <div className={`grid grid-cols-2 gap-2 ${errors.payment ? "ring-2 ring-destructive/50 rounded-xl p-1" : ""}`}>
              {paymentOptions.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => { setPaymentMethod(opt.code); setErrors(p => ({ ...p, payment: false })); }}
                  className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                    paymentMethod === opt.code
                      ? opt.color + " shadow-md"
                      : "bg-muted/30 border-border hover:border-primary/30"
                  }`}
                >
                  {opt.icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1">
              <StickyNote className="h-3 w-3" /> ملاحظات (اختياري)
            </label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظات إضافية..." className="h-10" />
          </div>

          {/* Order Summary */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground">ملخص الطلب</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.name} × {item.qty}</span>
                  <span className="font-mono">₪{item.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-border pt-2">
              <span>المجموع</span>
              <span className="font-mono">₪{total.toFixed(2)}</span>
            </div>
            {deliveryType === "delivery" && deliveryInfo && (
              <>
                <div className="flex justify-between text-xs text-orange-700 dark:text-orange-300">
                  <span>رسوم توصيل ({deliveryInfo.area})</span>
                  <span className="font-mono">₪{Number(deliveryInfo.final_fee).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-border pt-2">
                  <span>الإجمالي النهائي</span>
                  <span className="font-mono">₪{(total + Number(deliveryInfo.final_fee)).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleDispatch}
            disabled={sending}
            className="gap-2"
            style={{ backgroundColor: "#16A34A" }}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال إلى {selectedBranch?.name || "الفرع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallCenterDispatchDialog;
