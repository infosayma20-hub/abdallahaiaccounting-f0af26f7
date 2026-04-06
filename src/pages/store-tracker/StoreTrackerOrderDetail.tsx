import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { ar } from "date-fns/locale";
import StoreTrackerLayout from "./StoreTrackerLayout";

const statusColors: Record<string, string> = {
  "جديد": "#3B82F6",
  "قيد المراجعة": "#F59E0B",
  "قيد التصنيع": "#8B5CF6",
  "جاهز للتسليم": "#10B981",
  "تم التسليم": "#059669",
  "مفوتر": "#0D9488",
  "ملغي": "#EF4444",
  "مؤجل": "#6B7280",
};

export default function StoreTrackerOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [statusLog, setStatusLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    const fetchOrder = async () => {
      const { data: orderData } = await supabase
        .from("qamar_orders")
        .select("*")
        .eq("id", id)
        .single();
      setOrder(orderData);

      const { data: itemsData } = await supabase
        .from("qamar_order_items")
        .select("*")
        .eq("order_id", id);
      setItems(itemsData || []);

      const { data: logData } = await supabase
        .from("order_status_log")
        .select("*")
        .eq("order_id", id)
        .order("created_at", { ascending: false });
      setStatusLog(logData || []);

      setLoading(false);
    };
    fetchOrder();
  }, [id, user]);

  const handleAddNote = async () => {
    if (!note.trim() || !order || !user) return;
    setSubmitting(true);
    const profile = await supabase.from("profiles").select("invited_by").eq("user_id", user.id).single();
    const ownerId = profile.data?.invited_by || user.id;

    await supabase.from("order_status_log").insert({
      order_id: order.id,
      from_status: order.status,
      to_status: order.status,
      changed_by: user.id,
      changed_by_name: user.email || "متابع متاجر",
      notes: note,
      user_id: ownerId,
    });
    setNote("");
    // Refresh log
    const { data } = await supabase
      .from("order_status_log")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    setStatusLog(data || []);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <StoreTrackerLayout activeTab="orders" onTabChange={() => navigate("/store-tracker")}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", fontFamily: "Cairo" }}>
          <div style={{ fontSize: "18px", color: "#6B7280" }}>جاري التحميل...</div>
        </div>
      </StoreTrackerLayout>
    );
  }

  if (!order) {
    return (
      <StoreTrackerLayout activeTab="orders" onTabChange={() => navigate("/store-tracker")}>
        <div style={{ textAlign: "center", padding: "80px", fontFamily: "Cairo", color: "#EF4444" }}>
          الطلبية غير موجودة
        </div>
      </StoreTrackerLayout>
    );
  }

  return (
    <StoreTrackerLayout activeTab="orders" onTabChange={() => navigate("/store-tracker")}>
      <div style={{ padding: "24px", maxWidth: "900px", margin: "0 auto", direction: "rtl", fontFamily: "Cairo" }}>
        {/* Back button */}
        <button
          onClick={() => navigate("/store-tracker")}
          style={{
            padding: "6px 16px",
            borderRadius: "8px",
            border: "1px solid #E5E7EB",
            background: "white",
            cursor: "pointer",
            fontSize: "13px",
            fontFamily: "Cairo",
            marginBottom: "16px",
          }}
        >
          → العودة للطلبيات
        </button>

        {/* Order Header */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "16px",
            borderRight: `4px solid ${statusColors[order.status] || "#6B7280"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0D1B2E", margin: 0 }}>
              {order.reference_number || "طلبية"}
            </h2>
            <span
              style={{
                padding: "4px 16px",
                borderRadius: "20px",
                fontSize: "14px",
                fontWeight: "600",
                background: `${statusColors[order.status] || "#6B7280"}15`,
                color: statusColors[order.status] || "#6B7280",
              }}
            >
              {order.status}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "#475569" }}>
            <div>👤 <strong>العميل:</strong> {order.customer_name || "—"}</div>
            <div>📞 <strong>الهاتف:</strong> {order.customer_phone || "—"}</div>
            <div>📍 <strong>المدينة:</strong> {order.customer_city || "—"}</div>
            <div>🏠 <strong>العنوان:</strong> {order.customer_address || "—"}</div>
            <div>👤 <strong>الموظفة:</strong> {order.agent_name || "—"}</div>
            <div>📱 <strong>المصدر:</strong> {order.source || "—"}</div>
            <div>💰 <strong>الإجمالي:</strong> ₪{(order.total || 0).toLocaleString()}</div>
            <div>🕐 <strong>التاريخ:</strong> {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ar })}</div>
          </div>

          {order.all_notes && (
            <div style={{ marginTop: "12px", padding: "12px", background: "#FEF3C7", borderRadius: "8px", fontSize: "13px" }}>
              📝 <strong>ملاحظات:</strong> {order.all_notes}
            </div>
          )}
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "12px" }}>🛒 الأصناف</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ padding: "8px", textAlign: "right", fontSize: "13px", color: "#6B7280" }}>الصنف</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>الكمية</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>السعر</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px", fontSize: "13px", fontWeight: "600" }}>{item.product_name}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontSize: "13px" }}>{item.quantity}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontSize: "13px" }}>₪{(item.unit_price || 0).toLocaleString()}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontSize: "13px", fontWeight: "600" }}>₪{(item.line_total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Note */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "12px" }}>📝 إضافة ملاحظة</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اكتب ملاحظتك هنا..."
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
                fontSize: "14px",
                fontFamily: "Cairo",
                direction: "rtl",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            />
            <button
              onClick={handleAddNote}
              disabled={submitting || !note.trim()}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: "#0D1B2E",
                color: "white",
                cursor: submitting ? "wait" : "pointer",
                fontSize: "13px",
                fontFamily: "Cairo",
                opacity: submitting || !note.trim() ? 0.5 : 1,
              }}
            >
              إرسال
            </button>
          </div>
        </div>

        {/* Status Timeline */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "16px" }}>🕐 سجل التتبع</h3>
          {statusLog.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9CA3AF", padding: "20px" }}>لا يوجد سجل بعد</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {statusLog.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "#F8FAFC",
                    borderRight: `3px solid ${statusColors[log.to_status] || "#6B7280"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600" }}>
                      {log.from_status === log.to_status
                        ? `📝 ملاحظة على "${log.to_status}"`
                        : `${log.from_status} → ${log.to_status}`}
                    </span>
                    <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
                      {formatDistanceToNow(new Date(log.created_at), { locale: ar, addSuffix: true })}
                    </span>
                  </div>
                  {log.notes && <div style={{ fontSize: "13px", color: "#475569" }}>{log.notes}</div>}
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>بواسطة: {log.changed_by_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StoreTrackerLayout>
  );
}
