import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Phone, Truck, RefreshCw, X, Send } from "lucide-react";

interface POSDeliveryPanelProps {
  orderId: string | null;
  isDelivery: boolean;
  customerAddress: string;
  zoneCode: string;
  areaName: string;
  deliveryStatus: string;
  captainName: string;
  captainPhone: string;
  captainVehicle: string;
  onDeliveryFieldsChange: (fields: {
    customerAddress?: string;
    zoneCode?: string;
    areaName?: string;
  }) => void;
  onDeliveryStatusChange: (status: string, captain?: {
    name: string;
    phone: string;
    vehicle: string;
  }) => void;
}

const ZONES = [
  { code: "A", label: "منطقة A", price: "10 ₪" },
  { code: "B", label: "منطقة B", price: "15 ₪" },
  { code: "C", label: "منطقة C", price: "20 ₪" },
  { code: "D", label: "منطقة D", price: "25 ₪" },
  { code: "E", label: "منطقة E", price: "30 ₪" },
];

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.8)",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "11px",
  width: "100%",
  outline: "none",
  fontFamily: "Tajawal, sans-serif",
};

export default function POSDeliveryPanel({
  orderId,
  isDelivery,
  customerAddress,
  zoneCode,
  areaName,
  deliveryStatus,
  captainName,
  captainPhone,
  captainVehicle,
  onDeliveryFieldsChange,
  onDeliveryStatusChange,
}: POSDeliveryPanelProps) {
  const [sending, setSending] = useState(false);
  const [wheelsEligible, setWheelsEligible] = useState(false);
  const [wheelsStatus, setWheelsStatus] = useState<string>("not_sent");
  const [wheelsPrice, setWheelsPrice] = useState<number | null>(null);
  const [wheelsError, setWheelsError] = useState<string>("");
  const [wheelsSending, setWheelsSending] = useState(false);

  // Check Wheels eligibility (branch active + area has wheels_area_id) and current status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId || !isDelivery) {
        setWheelsEligible(false);
        return;
      }
      try {
        const { data: order } = await supabase
          .from("pos_orders")
          .select("branch_id, area_name, wheels_request_status, wheels_last_error, wheels_delivery_price")
          .eq("id", orderId)
          .maybeSingle();
        if (cancelled || !order?.branch_id) { setWheelsEligible(false); return; }
        setWheelsStatus((order as any).wheels_request_status || "not_sent");
        setWheelsError((order as any).wheels_last_error || "");
        setWheelsPrice((order as any).wheels_delivery_price ?? null);

        const { data: cfg } = await supabase
          .from("wheels_branch_config")
          .select("is_active")
          .eq("branch_id", order.branch_id)
          .maybeSingle();
        if (cancelled || !cfg?.is_active) { setWheelsEligible(false); return; }

        const area = (areaName || (order as any).area_name || "").trim();
        if (!area) { setWheelsEligible(false); return; }
        const { data: zone } = await supabase
          .from("delivery_zones")
          .select("wheels_area_id")
          .eq("branch_id", order.branch_id)
          .eq("area_name", area)
          .maybeSingle();
        if (cancelled) return;
        setWheelsEligible(!!zone?.wheels_area_id);
      } catch {
        if (!cancelled) setWheelsEligible(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, isDelivery, areaName]);

  const handleSendToWheels = async () => {
    if (!orderId) return;
    setWheelsSending(true);
    setWheelsError("");
    setWheelsStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("send-to-wheels", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      if (data?.success) {
        setWheelsStatus("sent");
        setWheelsPrice(data.wheels_delivery_price ?? null);
        toast.success("✅ تم إرسال الطلب إلى Wheels");
      } else {
        setWheelsStatus("failed");
        const msg = data?.error || "فشل الإرسال إلى Wheels";
        setWheelsError(msg);
        toast.error(`❌ ${msg}`);
      }
    } catch (e: any) {
      setWheelsStatus("failed");
      const msg = e?.message || "فشل الإرسال إلى Wheels";
      setWheelsError(msg);
      toast.error(`❌ ${msg}`);
    } finally {
      setWheelsSending(false);
    }
  };

  // Realtime subscription for captain updates
  useEffect(() => {
    if (!orderId || deliveryStatus !== "dispatching") return;

    const channel = supabase
      .channel(`delivery-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pos_orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (updated.delivery_status === "accepted" && updated.assigned_captain_name) {
            onDeliveryStatusChange("accepted", {
              name: updated.assigned_captain_name,
              phone: updated.assigned_captain_phone || "",
              vehicle: updated.assigned_captain_vehicle || "",
            });
            toast.success(`✅ الكابتن ${updated.assigned_captain_name} قبل الطلب!`);
          } else if (updated.delivery_status === "failed") {
            onDeliveryStatusChange("failed");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, deliveryStatus]);

  const handleSendToDelivery = async () => {
    if (!orderId) {
      toast.error("يجب حفظ الطلب أولاً قبل إرساله للتوصيل");
      return;
    }
    if (!customerAddress.trim()) {
      toast.error("يرجى إدخال عنوان التوصيل");
      return;
    }

    setSending(true);
    onDeliveryStatusChange("dispatching");

    try {
      // Save delivery fields to DB first
      await supabase
        .from("pos_orders")
        .update({
          is_delivery: true,
          customer_address: customerAddress,
          zone_code: zoneCode,
          area_name: areaName,
          delivery_status: "pending",
        } as any)
        .eq("id", orderId);

      const { data, error } = await supabase.functions.invoke("send-to-delivery", {
        body: { order_id: orderId },
      });

      if (error) throw error;

      if (data?.success) {
        if (data.status === "accepted" && data.captain_name) {
          onDeliveryStatusChange("accepted", {
            name: data.captain_name,
            phone: data.captain_phone || "",
            vehicle: data.vehicle_type || "",
          });
          toast.success(`✅ الكابتن ${data.captain_name} قبل الطلب!`);
        } else {
          // dispatching — waiting for captain via realtime
          toast.info("⏳ جاري البحث عن كابتن...");
        }
      } else {
        onDeliveryStatusChange("failed");
        toast.error(data?.error || "❌ لا يوجد كابتن متاح");
      }
    } catch (err: any) {
      console.error("Delivery error:", err);
      onDeliveryStatusChange("failed");
      toast.error("❌ فشل الإرسال — حاول مرة أخرى");
    } finally {
      setSending(false);
    }
  };

  if (!isDelivery) return null;

  return (
    <div className="px-3 pb-1 space-y-1.5">
      {/* Address */}
      <input
        value={customerAddress}
        onChange={(e) => onDeliveryFieldsChange({ customerAddress: e.target.value })}
        placeholder="📍 عنوان التوصيل..."
        style={inputStyle}
      />

      {/* Zone + Area */}
      {/* Hidden — سيتم ربط المناطق وسعر التوصيل ببرنامج ويلز لاحقاً */}
      <div className="flex gap-1.5" style={{ display: "none" }}>
        <select
          value={zoneCode}
          onChange={(e) => onDeliveryFieldsChange({ zoneCode: e.target.value })}
          style={{ ...inputStyle, width: "50%", cursor: "pointer" }}
        >
          <option value="">المنطقة</option>
          {ZONES.map((z) => (
            <option key={z.code} value={z.code}>
              {z.label} — {z.price}
            </option>
          ))}
        </select>
        <input
          value={areaName}
          onChange={(e) => onDeliveryFieldsChange({ areaName: e.target.value })}
          placeholder="المنطقة الفرعية..."
          style={{ ...inputStyle, width: "50%" }}
        />
      </div>

      {/* Send button */}
      {false && deliveryStatus === "none" && (
        <button
          onClick={handleSendToDelivery}
          disabled={sending || !customerAddress.trim()}
          style={{
            width: "100%",
            height: "36px",
            borderRadius: "10px",
            border: "1.5px solid #3B82F6",
            background: "rgba(59,130,246,0.15)",
            color: "#93C5FD",
            fontSize: "12px",
            fontWeight: "600",
            cursor: sending ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontFamily: "Tajawal, sans-serif",
            opacity: !customerAddress.trim() ? 0.4 : 1,
          }}
        >
          <Truck className="h-4 w-4" />
          🛵 إرسال للتوصيل
        </button>
      )}

      {/* Status Cards */}
      {deliveryStatus === "dispatching" && (
        <div
          style={{
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.3)",
            borderRadius: "10px",
            padding: "10px 12px",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="animate-spin"
              style={{
                width: "14px",
                height: "14px",
                border: "2px solid rgba(251,191,36,0.3)",
                borderTopColor: "#FBBF24",
                borderRadius: "50%",
              }}
            />
            <span style={{ fontSize: "12px", color: "#FBBF24", fontFamily: "Tajawal, sans-serif", fontWeight: "600" }}>
              ⏳ جاري البحث عن كابتن...
            </span>
          </div>
        </div>
      )}

      {deliveryStatus === "accepted" && (
        <div
          style={{
            background: "#F0FDF4",
            border: "1.5px solid #22C55E",
            borderRadius: "10px",
            padding: "10px 12px",
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: "700", color: "#166534", marginBottom: "6px", fontFamily: "Tajawal, sans-serif" }}>
            ✅ تم قبول الطلب
          </p>
          <div style={{ fontSize: "11px", color: "#166534", lineHeight: "1.8", fontFamily: "Tajawal, sans-serif" }}>
            <div className="flex items-center gap-1.5">
              <span>🏍️</span>
              <span>الكابتن: <strong>{captainName}</strong></span>
            </div>
            {captainPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3" />
                <span>الجوال: <strong dir="ltr">{captainPhone}</strong></span>
              </div>
            )}
            {captainVehicle && (
              <div className="flex items-center gap-1.5">
                <span>🚗</span>
                <span>المركبة: <strong>{captainVehicle}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {deliveryStatus === "failed" && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1.5px solid #EF4444",
            borderRadius: "10px",
            padding: "10px 12px",
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: "600", color: "#DC2626", marginBottom: "6px", fontFamily: "Tajawal, sans-serif" }}>
            ❌ لا يوجد كابتن متاح
          </p>
          <button
            onClick={() => {
              onDeliveryStatusChange("none");
            }}
            style={{
              fontSize: "11px",
              color: "#DC2626",
              background: "rgba(220,38,38,0.1)",
              border: "1px solid rgba(220,38,38,0.3)",
              borderRadius: "8px",
              padding: "4px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontFamily: "Tajawal, sans-serif",
            }}
          >
            <RefreshCw className="h-3 w-3" />
            🔄 إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  );
}
