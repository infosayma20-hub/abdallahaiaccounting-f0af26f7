import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/components/layout/PageHeader";
import OrderStatusTimeline from "@/components/orders/OrderStatusTimeline";
import OrderStatusActions from "@/components/orders/OrderStatusActions";
import ProductionSubStages from "@/components/orders/ProductionSubStages";
import BackButton from "@/components/BackButton";
import ConvertToInvoiceModal from "@/components/orders/ConvertToInvoiceModal";
import RecordReceiptModal from "@/components/orders/RecordReceiptModal";

const F = "Cairo, sans-serif";
const NAVY = "#0D1B2E";

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceTable, setSourceTable] = useState<string>("orders");
  const [activeTab, setActiveTab] = useState<"info" | "items" | "timeline">("info");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => { if (id && user) fetchOrder(); }, [id, user]);

  const fetchOrder = async () => {
    if (!id || !user) return;
    setLoading(true);

    // Try qamar_orders first, then orders
    const { data: qamarOrder } = await supabase
      .from("qamar_orders" as any).select("*").eq("id", id).maybeSingle();

    if (qamarOrder) {
      setSourceTable("qamar_orders");
      const q = qamarOrder as any;
      setOrder({
        id: q.id, order_number: q.reference_number, customer_name: q.customer_name || "",
        customer_phone: q.customer_phone, customer_address: q.customer_address,
        customer_city: q.customer_city, order_date: q.created_at, status: q.status || "جديد",
        subtotal: q.subtotal || 0, discount: q.discount || 0, shipping_cost: q.shipping_cost || 0,
        total: q.total || 0, payment_status: q.payment_status === "paid" ? "مدفوع كاملاً" : q.payment_status === "partial" ? "مدفوع جزئياً" : "غير مدفوع",
        payment_method: q.payment_method, source: q.source || "قمر براند",
        notes: q.all_notes || q.customer_notes || null,
        agent_name: q.agent_name, priority: q.priority, production_notes: q.production_notes,
        linked_invoice_id: q.linked_invoice_id, invoice_number: q.invoice_number,
        paid_amount: q.amount_paid || 0, remaining_amount: (q.total || 0) - (q.amount_paid || 0),
        created_at: q.created_at, user_id: q.user_id,
      });
      setLoading(false);
      return;
    }

    const { data: legacyOrder } = await supabase
      .from("orders").select("*").eq("id", id).maybeSingle();

    if (legacyOrder) {
      setSourceTable("orders");
      setOrder(legacyOrder);
      // Fetch items
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      setOrderItems((items as any[]) || []);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ direction: "rtl", textAlign: "center", padding: "60px", fontFamily: F }}>
        <p style={{ color: "#94A3B8", fontSize: "16px" }}>جاري التحميل...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ direction: "rtl", textAlign: "center", padding: "60px", fontFamily: F }}>
        <p style={{ color: "#94A3B8", fontSize: "18px", marginBottom: "16px" }}>الطلبية غير موجودة</p>
        <button onClick={() => navigate("/orders")} style={{
          background: NAVY, color: "white", border: "none", borderRadius: "10px",
          padding: "10px 24px", fontFamily: F, fontSize: "14px", cursor: "pointer",
        }}>العودة للطلبيات</button>
      </div>
    );
  }

  const tabs = [
    { id: "info" as const, label: "معلومات الطلبية", icon: "📋" },
    { id: "items" as const, label: "بنود الطلبية", icon: "🛒" },
    { id: "timeline" as const, label: "سجل التتبع", icon: "📊" },
  ];

  const infoRows: [string, any][] = [
    ["العميل", order.customer_name],
    ["الهاتف", order.customer_phone],
    ["العنوان", order.customer_address],
    ["المدينة", order.customer_city],
    ["المصدر", order.source],
    ["طريقة الدفع", order.payment_method],
    ["حالة الدفع", order.payment_status],
    ["المندوب", order.agent_name],
    ["الأولوية", order.priority],
  ];

  const invoiceModalOrder = showInvoiceModal ? {
    ...order,
    invoice_id: order.linked_invoice_id,
  } : null;

  const receiptModalOrder = showReceiptModal ? {
    ...order,
    invoice_id: order.linked_invoice_id,
  } : null;

  return (
    <div style={{ direction: "rtl", textAlign: "right", fontFamily: F, padding: "16px 24px 96px", maxWidth: "1000px", margin: "0 auto" }}>
      <PageHeader title={`تفاصيل الطلبية ${order.order_number || ""}`} breadcrumb={["المبيعات", "الطلبيات", order.order_number || "تفاصيل"]} />
      <BackButton />

      {/* Status Actions Bar */}
      <OrderStatusActions
        orderId={order.id}
        currentStatus={order.status}
        orderTable={sourceTable}
        onStatusChanged={fetchOrder}
      />

      {/* Production sub-stages (only show when in production) */}
      {order.status === "قيد التصنيع" && (
        <ProductionSubStages orderId={order.id} orderTable={sourceTable} onUpdate={fetchOrder} />
      )}

      {/* Quick actions */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {!order.linked_invoice_id && (order.status === "جاهز للفوترة" || order.status === "مفوتر") && (
          <button onClick={() => setShowInvoiceModal(true)} style={{
            padding: "10px 20px", borderRadius: "10px", border: "1.5px solid #06B6D4",
            background: "#ECFEFF", color: "#0891B2", fontFamily: F, fontSize: "13px", fontWeight: "600",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}>
            🧾 تحويل لفاتورة مبيعات
          </button>
        )}
        {order.linked_invoice_id && order.payment_status !== "مدفوع كاملاً" && (
          <button onClick={() => setShowReceiptModal(true)} style={{
            padding: "10px 20px", borderRadius: "10px", border: "1.5px solid #16A34A",
            background: "#F0FDF4", color: "#16A34A", fontFamily: F, fontSize: "13px", fontWeight: "600",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}>
            💰 تسجيل قبض
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: "#F1F5F9", borderRadius: "12px", padding: "4px", marginBottom: "20px", width: "fit-content" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer",
            fontFamily: F, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.2s ease",
            ...(activeTab === tab.id
              ? { background: "white", color: NAVY, fontWeight: "700", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
              : { background: "transparent", color: "#94A3B8", fontWeight: "500" }),
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        <div style={{ background: "white", borderRadius: "16px", padding: "24px", border: "1px solid #F1F5F9" }}>
          {/* Financial summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "المجموع الفرعي", value: Number(order.subtotal).toLocaleString(), color: "#64748B" },
              { label: "الخصم", value: Number(order.discount).toLocaleString(), color: "#F59E0B" },
              { label: "الشحن", value: Number(order.shipping_cost).toLocaleString(), color: "#3B82F6" },
              { label: "الإجمالي", value: Number(order.total).toLocaleString(), color: NAVY },
            ].map((item, i) => (
              <div key={i} style={{
                padding: "16px", borderRadius: "12px", background: "#FAFBFC",
                border: "1px solid #F1F5F9", textAlign: "center",
              }}>
                <p style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F, marginBottom: "4px" }}>{item.label}</p>
                <p style={{ fontSize: "20px", fontWeight: "800", color: item.color, fontFamily: F }}>{item.value} ₪</p>
              </div>
            ))}
          </div>

          {/* Info rows */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {infoRows.map(([label, value]) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", padding: "10px 12px",
                borderBottom: "1px solid #F8FAFC", fontSize: "14px", fontFamily: F,
              }}>
                <span style={{ color: "#94A3B8" }}>{label}</span>
                <span style={{ fontWeight: "600", color: "#1E293B" }}>{value || "—"}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          {order.notes && (
            <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <p style={{ fontSize: "12px", color: "#92400E", fontFamily: F, marginBottom: "4px", fontWeight: "600" }}>📝 ملاحظات</p>
              <p style={{ fontSize: "13px", color: "#92400E", fontFamily: F, whiteSpace: "pre-wrap" }}>{order.notes}</p>
            </div>
          )}
          {order.production_notes && (
            <div style={{ marginTop: "8px", padding: "12px 16px", borderRadius: "10px", background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <p style={{ fontSize: "12px", color: "#166534", fontFamily: F, marginBottom: "4px", fontWeight: "600" }}>🏭 ملاحظات الإنتاج</p>
              <p style={{ fontSize: "13px", color: "#166534", fontFamily: F, whiteSpace: "pre-wrap" }}>{order.production_notes}</p>
            </div>
          )}

          {/* Paid amount info */}
          {(Number(order.paid_amount) > 0 || Number(order.remaining_amount) > 0) && (
            <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
              <div style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "#F0FDF4", border: "1px solid #BBF7D0", textAlign: "center" }}>
                <p style={{ fontSize: "11px", color: "#16A34A", fontFamily: F }}>المدفوع</p>
                <p style={{ fontSize: "18px", fontWeight: "700", color: "#16A34A", fontFamily: F }}>{Number(order.paid_amount || 0).toLocaleString()} ₪</p>
              </div>
              <div style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", textAlign: "center" }}>
                <p style={{ fontSize: "11px", color: "#DC2626", fontFamily: F }}>المتبقي</p>
                <p style={{ fontSize: "18px", fontWeight: "700", color: "#DC2626", fontFamily: F }}>{Number(order.remaining_amount || 0).toLocaleString()} ₪</p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "items" && (
        <div style={{ background: "white", borderRadius: "16px", overflow: "hidden", border: "1px solid #F1F5F9" }}>
          {orderItems.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", direction: "rtl", textAlign: "right" }}>
              <thead>
                <tr style={{ background: NAVY }}>
                  {["المنتج", "الكمية", "السعر", "الإجمالي"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", color: "white", fontSize: "13px", fontWeight: "600", fontFamily: F }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item: any, i: number) => (
                  <tr key={item.id || i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFC" }}>
                    <td style={{ padding: "12px 16px", fontFamily: F, fontSize: "14px", fontWeight: "600", color: "#1E293B" }}>{item.product_name}</td>
                    <td style={{ padding: "12px 16px", fontFamily: F, fontSize: "14px", color: "#64748B" }}>{item.quantity}</td>
                    <td style={{ padding: "12px 16px", fontFamily: F, fontSize: "14px", color: "#64748B" }}>{Number(item.unit_price).toLocaleString()} ₪</td>
                    <td style={{ padding: "12px 16px", fontFamily: F, fontSize: "14px", fontWeight: "700", color: NAVY }}>{Number(item.total).toLocaleString()} ₪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8", fontFamily: F, fontSize: "14px" }}>
              <p style={{ fontSize: "32px", marginBottom: "8px" }}>🛒</p>
              لا توجد بنود مسجلة لهذه الطلبية
            </div>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <div style={{ background: "white", borderRadius: "16px", padding: "24px", border: "1px solid #F1F5F9" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: NAVY, fontFamily: F, marginBottom: "20px" }}>
            📊 سجل التتبع
          </h3>
          <OrderStatusTimeline orderId={order.id} orderTable={sourceTable} />
        </div>
      )}

      {/* Modals */}
      <ConvertToInvoiceModal
        open={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        order={invoiceModalOrder}
        orderItems={orderItems}
        userId={user?.id || ""}
        onSuccess={() => { setShowInvoiceModal(false); fetchOrder(); }}
      />
      <RecordReceiptModal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        order={receiptModalOrder}
        userId={user?.id || ""}
        onSuccess={() => { setShowReceiptModal(false); fetchOrder(); }}
      />
    </div>
  );
};

export default OrderDetailPage;
