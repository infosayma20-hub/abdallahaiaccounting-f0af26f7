import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  /** Pre-selected visa GL account (from a previously dispatched order being edited). */
  editingVisaGlAccountCode?: string | null;
  /** Pre-selected "skip wheels dispatch" flag from the original order (edit mode). */
  editingSkipWheelsDispatch?: boolean | null;
  /**
   * مفتاح ثابت للمسودة (عادة معرّف لسان الطلب النشط) — يفعّل الحفظ التلقائي
   * لبيانات النموذج عبر الإغلاق/الفتح ضمن نفس الطلب.
   */
  draftKey?: string | null;
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

// ---------------------------------------------------------------------------
// مسودة نموذج التحويل — تُحفظ تلقائياً في sessionStorage حتى لا تضيع البيانات
// التي عبّأها موظف الكول سنتر عندما يغلق النافذة مؤقتاً (لتعديل سلة المشتريات
// مثلاً) ثم يعود إليها. المفتاح مرتبط بلسان الطلب النشط في نقطة البيع (أو
// بالطلبية نفسها في وضع التعديل)، وتُمسح المسودة فقط بعد نجاح الإرسال/الحفظ،
// وتُتجاهل تلقائياً المسودات الأقدم من 12 ساعة.
// ---------------------------------------------------------------------------
interface DispatchDraft {
  savedAt: number;
  /** لقطة للقيم القادمة من شاشة نقطة البيع لحظة الحفظ — لتمييز ما كتبه الموظف يدوياً. */
  props: { customerName: string; customerPhone: string; deliveryAddress: string; orderNote: string };
  sourceApp: string;
  deliveryType: "delivery" | "pickup" | "dine_in";
  tableLabel: string;
  paymentMethod: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  deliveryInfo: DeliveryInfo | null;
  autoFilledPrefix: string;
  skipWheelsDispatch: boolean;
  skipWheelsTouched: boolean;
  selectedBranchId: string | null;
}

const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

function readDispatchDraft(key: string | null): DispatchDraft | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as DispatchDraft;
    if (!d || typeof d.savedAt !== "number" || Date.now() - d.savedAt > DRAFT_TTL_MS) return null;
    return d;
  } catch {
    return null;
  }
}

function clearDispatchDraft(key: string | null) {
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch { /* sessionStorage غير متاح */ }
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
  editingDeliveryInfo, editingDeliveryFee, editingVisaGlAccountCode, editingSkipWheelsDispatch,
  draftKey,
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

  // Some orders (e.g. from Wheels app itself) already exist on the Wheels
  // courier screen, so we must NOT re-dispatch them to Wheels after payment
  // or it creates a duplicate trip. Defaults to true whenever the source is
  // a Wheels-family app; agent can toggle off if needed.
  const [skipWheelsDispatch, setSkipWheelsDispatch] = useState<boolean>(false);
  // Tracks whether the agent manually toggled the checkbox so we don't
  // override their choice when they switch source apps afterwards.
  const [skipWheelsTouched, setSkipWheelsTouched] = useState<boolean>(false);

  // مفتاح تخزين المسودة: في وضع التعديل يرتبط بالطلبية نفسها، وغير ذلك بلسان
  // الطلب النشط في نقطة البيع حتى لا تتسرب مسودة طلب إلى طلب آخر.
  const draftStorageKey = useMemo(() => {
    if (!dataOwnerId) return null;
    if (editingOrderId) return `cc-dispatch-draft:${dataOwnerId}:edit-${editingOrderId}`;
    return draftKey ? `cc-dispatch-draft:${dataOwnerId}:${draftKey}` : null;
  }, [dataOwnerId, editingOrderId, draftKey]);
  // يمنع كتابة المسودة قبل أن تنتهي تهيئة النموذج (حتى لا نكتب القيم الفارغة فوق مسودة سليمة).
  const hydratedRef = useRef(false);

  // Auto-recompute the default whenever the source app changes — only when
  // the agent hasn't explicitly toggled the checkbox themselves.
  useEffect(() => {
    if (skipWheelsTouched) return;
    setSkipWheelsDispatch(/wheels/i.test(sourceApp || ""));
  }, [sourceApp, skipWheelsTouched]);

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
    hydratedRef.current = false;
    const draft = readDispatchDraft(draftStorageKey);
    setName(customerName);
    setPhone(customerPhone);
    setAddress(deliveryAddress);
    setNote(orderNote);
    setErrors({});
    setAutoFilledPrefix("");
    setDispatchedOrderId(null);
    setDispatchStatus(null);
    setTableLabel("");
    setSkipWheelsTouched(false);
    // In edit mode honor the saved flag; in new-order mode the auto-effect
    // above will set the default once sourceApp is initialized.
    if (editingOrderId) {
      setSkipWheelsDispatch(!!editingSkipWheelsDispatch);
      setSkipWheelsTouched(true); // preserve original choice unless agent toggles
    }
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
        } else if (draft?.selectedBranchId) {
          // استعادة الفرع المختار من المسودة (وضع طلب جديد فقط — في التعديل الفرع مقفل).
          const match = filtered.find(b => b.id === draft.selectedBranchId);
          if (match) setSelectedBranch(match);
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
      // If the original order carried a specific visa GL account, re-select
      // the matching variant button (e.g. "فيزا Yummy") instead of the
      // generic "visa" so the GL account stays bound across edits.
      if (editingPaymentMethod) {
        if (editingVisaGlAccountCode) {
          // Defer the precise match to after deliveryApps load (see effect below).
          setPaymentMethod(editingPaymentMethod);
        } else {
          setPaymentMethod(editingPaymentMethod);
        }
      }
      const rawType = (editingDeliveryInfo as any)?.delivery_type;
      if (rawType === "dine_in" || rawType === "table") {
        setDeliveryType("dine_in");
        setTableLabel((editingDeliveryInfo as any)?.table_label || "");
      } else {
        setDeliveryType(deliveryAddress ? "delivery" : "pickup");
      }
    }

    // استعادة المسودة المحفوظة (إن وجدت) فوق القيم الافتراضية — حتى لا تضيع
    // بيانات الموظف عند إغلاق النافذة للعودة إلى سلة المشتريات ثم فتحها مجدداً.
    if (draft) {
      setSourceApp(draft.sourceApp || "طلب مباشر");
      setDeliveryType(draft.deliveryType || "delivery");
      setTableLabel(draft.tableLabel || "");
      setPaymentMethod(draft.paymentMethod || "cash");
      // الحقول المرتبطة بشاشة نقطة البيع: نحتفظ بقيمة المسودة فقط إذا كان الموظف
      // قد عدّلها يدوياً، وإلا نتبع القيمة الجديدة القادمة من الشاشة (مثلاً عند
      // اختيار زبون آخر أثناء إغلاق النافذة).
      setName(draft.name !== draft.props.customerName ? draft.name : customerName);
      setPhone(draft.phone !== draft.props.customerPhone ? draft.phone : customerPhone);
      setAddress(draft.address !== draft.props.deliveryAddress ? draft.address : deliveryAddress);
      setNote(draft.note !== draft.props.orderNote ? draft.note : orderNote);
      if (draft.deliveryInfo && draft.deliveryInfo.area) setDeliveryInfo(draft.deliveryInfo);
      setAutoFilledPrefix(draft.autoFilledPrefix || "");
      setSkipWheelsDispatch(!!draft.skipWheelsDispatch);
      setSkipWheelsTouched(!!draft.skipWheelsTouched);
    }
    hydratedRef.current = true;

    return () => {
      hydratedRef.current = false;
      // Cleanup tracking
      if (trackingTimeoutRef.current) clearTimeout(trackingTimeoutRef.current);
      if (trackingChannelRef.current) supabase.removeChannel(trackingChannelRef.current);
    };
  }, [open, dataOwnerId, customerName, customerPhone, deliveryAddress, orderNote, editingOrderId, editingBranchId, editingBranchName, editingPaymentMethod, editingSourceApp, draftStorageKey]);

  // حفظ تلقائي للمسودة عند أي تغيير في الحقول — لا يبدأ إلا بعد اكتمال التهيئة
  // (hydratedRef) حتى لا تُكتب القيم الفارغة فوق مسودة سليمة.
  useEffect(() => {
    if (!open || !draftStorageKey || !hydratedRef.current) return;
    const draft: DispatchDraft = {
      savedAt: Date.now(),
      props: { customerName, customerPhone, deliveryAddress, orderNote },
      sourceApp,
      deliveryType,
      tableLabel,
      paymentMethod,
      name,
      phone,
      address,
      note,
      deliveryInfo,
      autoFilledPrefix,
      skipWheelsDispatch,
      skipWheelsTouched,
      selectedBranchId: selectedBranch?.id || null,
    };
    try { sessionStorage.setItem(draftStorageKey, JSON.stringify(draft)); } catch { /* sessionStorage غير متاح */ }
  }, [open, draftStorageKey, sourceApp, deliveryType, tableLabel, paymentMethod, name, phone, address, note, deliveryInfo, autoFilledPrefix, skipWheelsDispatch, skipWheelsTouched, selectedBranch, customerName, customerPhone, deliveryAddress, orderNote]);

  // After delivery apps load in edit mode, snap paymentMethod to the variant
  // whose gl_note matches the saved visa_gl_account_code on the order.
  useEffect(() => {
    if (!editingOrderId || !editingVisaGlAccountCode || deliveryApps.length === 0) return;
    const match = deliveryApps.find(a => a.visa_gl_account_code === editingVisaGlAccountCode);
    if (match) {
      const code = `visa_${match.name.toLowerCase().replace(/\s+/g, "_")}`;
      setPaymentMethod(code);
    }
  }, [editingOrderId, editingVisaGlAccountCode, deliveryApps]);

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
        // Persist the explicit GL account chosen by the agent (e.g. Yummy /
        // FoodOnTime / Wheels visa). This becomes the single source of truth
        // for downstream POS posting — independent of source_app name match.
        visa_gl_account_code:
          paymentOptions.find(o => o.code === paymentMethod)?.gl_note || null,
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
        // Server-side gate for the post-payment Wheels auto-dispatch. The
        // edge function and DB trigger both consult this flag — leave it
        // false (default) for any non-Wheels-sourced order so existing
        // behaviour is unchanged.
        skip_wheels_dispatch: !!skipWheelsDispatch,
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
        // The RPC doesn't take visa_gl_account_code — write it separately so
        // edits that change the visa variant are persisted correctly.
        const newGl = paymentOptions.find(o => o.code === paymentMethod)?.gl_note || null;
        const newSkip = !!skipWheelsDispatch;
        const patch: Record<string, unknown> = {};
        if (newGl !== (editingVisaGlAccountCode ?? null)) patch.visa_gl_account_code = newGl;
        if (newSkip !== !!editingSkipWheelsDispatch) patch.skip_wheels_dispatch = newSkip;
        if (Object.keys(patch).length > 0) {
          await supabase
            .from("call_center_orders" as any)
            .update(patch as any)
            .eq("id", editingOrderId);
        }
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

      // الطلب أُرسل/حُفظ بنجاح — المسودة لم تعد مطلوبة لهذا الطلب.
      clearDispatchDraft(draftStorageKey);
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
            {/* Skip Wheels auto-dispatch — visible for ALL source apps. Even
                "طلب مباشر" orders may already exist on Wheels (e.g. the Wheels
                Bot picked the same call), so the agent must always be able to
                flag the order to avoid duplicate trips on the courier screen. */}
            <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={skipWheelsDispatch}
                onChange={(e) => {
                  setSkipWheelsDispatch(e.target.checked);
                  setSkipWheelsTouched(true);
                }}
              />
              <span className="text-[12px] leading-tight text-amber-900 dark:text-amber-200">
                <b>لا تُرسل إلى Wheels تلقائياً</b> — استخدمه إذا كانت الطلبية
                موجودة أصلاً على شاشة Wheels (App/Bot) لتجنّب تكرار الرحلة.
              </span>
            </label>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <label className="text-sm font-medium">الفرع المستهدف *</label>
            {deliveryType === "delivery" ? (
              // B1: In delivery mode the branch is dictated by the chosen zone
              // (cheapest mapped to that area). Showing the manual grid here
              // creates a W2 conflict where the agent could pick a different
              // branch than the one the zone resolved to. We render a read-only
              // summary instead and keep the online/offline indicator visible.
              selectedBranch ? (
                (() => {
                  const activeCount = branchSessions[selectedBranch.id] || 0;
                  const isOnline = activeCount > 0;
                  return (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-primary/5 border-2 border-primary/30">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span>{selectedBranch.name}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">(من المنطقة المختارة)</span>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] font-medium ${isOnline ? "text-green-600" : "text-red-500"}`}>
                        {isOnline ? (
                          <><Wifi className="h-3 w-3" /><span>{activeCount} كاشير متصل</span></>
                        ) : (
                          <><WifiOff className="h-3 w-3" /><span>لا يوجد كاشير</span></>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className={`p-3 rounded-xl border-2 border-dashed text-xs text-muted-foreground text-center ${errors.branch || errors.zone ? "border-destructive/60" : "border-border"}`}>
                  اختر المنطقة من الأسفل لتحديد الفرع تلقائياً
                </div>
              )
            ) : (
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
                      <div className={`flex items-center justify-center gap-1 mt-1.5 text-[10px] font-medium ${
                        selectedBranch?.id === branch.id
                          ? isOnline ? "text-green-200" : "text-red-200"
                          : isOnline ? "text-green-600" : "text-red-500"
                      }`}>
                        {isOnline ? (
                          <><Wifi className="h-3 w-3" /><span>{activeCount} كاشير متصل</span></>
                        ) : (
                          <><WifiOff className="h-3 w-3" /><span>لا يوجد كاشير</span></>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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

          {/* Delivery Zone Picker — area → branch → live Wheels price */}
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

          {/* Delivery Address — auto-filled from zone, editable for extra details */}
          {deliveryType === "delivery" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" /> عنوان التوصيل *
                <span className="text-[9px] text-muted-foreground font-normal mr-1">(يُعبّأ تلقائياً — أضف الشارع/البناية إن لزم)</span>
              </label>
              <Input value={address} onChange={e => { setAddress(e.target.value); setErrors(p => ({ ...p, address: false })); }} placeholder="سيُعبّأ تلقائياً بعد اختيار المنطقة..." className={`h-10 ${fieldError("address")}`} />
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

          {/* Note — prominent, multi-line so agents see what they typed */}
          <div className="space-y-1.5 p-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30">
            <label className="text-sm font-bold flex items-center gap-1 text-amber-900 dark:text-amber-200">
              <StickyNote className="h-4 w-4" /> ملاحظات للفرع (مهم — ستظهر على الفاتورة)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="مثال: بدل الأجنحة دبابيس — بدون بصل — حار جداً"
              rows={2}
              dir="rtl"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
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
            {note.trim() && (
              <div className="mt-2 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-xs">
                <span className="font-bold text-amber-900 dark:text-amber-200">📝 ملاحظة سترسل: </span>
                <span className="text-amber-900 dark:text-amber-100">{note.trim()}</span>
              </div>
            )}
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
