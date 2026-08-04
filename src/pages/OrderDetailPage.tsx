import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import OrderStatusTimeline from "@/components/orders/OrderStatusTimeline";

/**
 * Order details — Microsoft Dynamics 365 "Finance shell" read-only layout:
 * breadcrumb → record header (title + status) → command bar → KPI tile band →
 * FastTab-style pivot sections with dense field grids and a flat data grid.
 * Display only: no lifecycle actions (postpone / cancel), no emojis.
 */

const F = "Cairo, Tajawal, sans-serif";
const MONO = "JetBrains Mono, monospace";
const NAVY = "#0D1B2E";
const ACCENT = "#2A7B9B";

const T = {
  shell: "#F3F2F1",
  card: "#FFFFFF",
  head: "#FAFAFA",
  text: "#1B3A5C",
  muted: "rgba(27,58,92,0.62)",
  faint: "rgba(27,58,92,0.40)",
  border: "rgba(27,58,92,0.14)",
  zebra: "rgba(27,58,92,0.025)",
};

const STATUS_COLORS: Record<string, string> = {
  "جديد": "#3B82F6", "قيد المراجعة": "#6366F1", "مؤكد": "#8B5CF6",
  "قيد التصنيع": "#F59E0B", "قيد التجهيز": "#F59E0B", "جاهز للفوترة": "#8B5CF6",
  "مفوتر": "#06B6D4", "جاهز للشحن": "#14B8A6", "تم الشحن": "#22C55E",
  "تم التسليم": "#16A34A", "ملغي": "#EF4444", "مؤجل": "#EAB308",
};

const fmt = (v: any) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceTable] = useState<string>("orders");
  const [activeTab, setActiveTab] = useState<"info" | "items" | "timeline">("info");

  useEffect(() => { if (id && user) fetchOrder(); /* eslint-disable-next-line */ }, [id, user]);

  const fetchOrder = async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data: legacyOrder } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (legacyOrder) {
      setOrder(legacyOrder);
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      setOrderItems((items as any[]) || []);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ direction: "rtl", background: T.shell, minHeight: "100%", padding: "40px", fontFamily: F, textAlign: "center" }}>
        <p style={{ color: T.muted, fontSize: 13 }}>جارٍ تحميل سجل الطلبية…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ direction: "rtl", background: T.shell, minHeight: "100%", padding: "40px", fontFamily: F, textAlign: "center" }}>
        <p style={{ color: T.text, fontSize: 14, marginBottom: 14 }}>سجل الطلبية غير موجود</p>
        <button onClick={() => navigate("/orders")} style={{
          background: NAVY, color: "#FFF", border: "none", borderRadius: 2,
          padding: "8px 20px", fontFamily: F, fontSize: 12.5, cursor: "pointer",
        }}>العودة لقائمة الطلبيات</button>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[order.status] || ACCENT;

  const tabs = [
    { id: "info" as const, label: "معلومات الطلبية" },
    { id: "items" as const, label: "بنود الطلبية" },
    { id: "timeline" as const, label: "سجل التتبع" },
  ];

  const tiles = [
    { label: "المجموع الفرعي", value: fmt(order.subtotal), color: T.text },
    { label: "الخصم", value: fmt(order.discount), color: "#B45309" },
    { label: "الشحن", value: fmt(order.shipping_cost), color: ACCENT },
    { label: "الإجمالي", value: fmt(order.total), color: NAVY },
    { label: "المدفوع", value: fmt(order.paid_amount), color: "#15803D" },
    { label: "المتبقي", value: fmt(order.remaining_amount), color: "#B91C1C" },
  ];

  const customerFields: [string, any][] = [
    ["العميل", order.customer_name],
    ["الهاتف", order.customer_phone],
    ["العنوان", order.customer_address],
    ["المدينة", order.customer_city],
  ];

  const commercialFields: [string, any][] = [
    ["المصدر", order.source],
    ["طريقة الدفع", order.payment_method],
    ["حالة الدفع", order.payment_status],
    ["المندوب", order.agent_name],
    ["الأولوية", order.priority],
    ["تاريخ الطلب", order.order_date ? new Date(order.order_date).toLocaleDateString("en-GB") : null],
    ["تاريخ التسليم", order.delivery_date ? new Date(order.delivery_date).toLocaleDateString("en-GB") : null],
    ["رقم التتبع", order.tracking_number],
  ];

  const section: React.CSSProperties = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 2, marginBottom: 12,
  };
  const sectionHead: React.CSSProperties = {
    padding: "9px 14px", borderBottom: `1px solid ${T.border}`, background: T.head,
    fontSize: 12.5, fontWeight: 700, color: T.text, letterSpacing: "0.2px",
  };

  const FieldGrid = ({ rows }: { rows: [string, any][] }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ padding: "9px 14px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{value || "—"}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ direction: "rtl", textAlign: "right", fontFamily: F, background: T.shell, minHeight: "100%", padding: "0 0 80px" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 11.5, color: T.muted }}>
        <button onClick={() => navigate("/orders")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontFamily: F, fontSize: 11.5, padding: 0 }}>المبيعات</button>
        <ChevronRight size={11} style={{ transform: "rotate(180deg)" }} />
        <button onClick={() => navigate("/orders")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontFamily: F, fontSize: 11.5, padding: 0 }}>الطلبيات</button>
        <ChevronRight size={11} style={{ transform: "rotate(180deg)" }} />
        <span style={{ fontFamily: MONO }}>{order.order_number || "تفاصيل"}</span>
      </div>

      {/* Record header */}
      <div style={{
        background: T.card, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
        padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 3 }}>تفاصيل الطلبية</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: T.text, margin: 0 }}>{order.customer_name || "—"}</h1>
            <span style={{ fontFamily: MONO, fontSize: 13, color: T.muted }}>{order.order_number || ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: T.faint }}>الحالة</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 2,
            background: `${statusColor}14`, border: `1px solid ${statusColor}55`, color: statusColor,
            fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
            {order.status}
          </span>
        </div>
      </div>

      {/* Command bar (read-only utilities) */}
      <div style={{
        background: T.head, borderBottom: `1px solid ${T.border}`, padding: "6px 14px",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {[
          { label: "رجوع", icon: ChevronRight, onClick: () => navigate("/orders"), rotate: true },
          { label: "تحديث", icon: RefreshCw, onClick: fetchOrder },
          { label: "طباعة", icon: Printer, onClick: () => window.print() },
        ].map(({ label, icon: Icon, onClick, rotate }) => (
          <button key={label} onClick={onClick} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
            background: "transparent", border: "1px solid transparent", borderRadius: 2,
            color: T.text, fontFamily: F, fontSize: 12, cursor: "pointer",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(27,58,92,0.06)"; e.currentTarget.style.borderColor = T.border; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
          >
            <Icon size={13} style={rotate ? undefined : undefined} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {/* KPI tile band */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 2, marginBottom: 12 }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ background: T.card, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: t.color }}>
                {t.value} <span style={{ fontSize: 11, color: T.faint }}>ILS</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pivot tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "9px 16px", background: "transparent", border: "none", cursor: "pointer",
              fontFamily: F, fontSize: 12.5,
              color: activeTab === tab.id ? T.text : T.muted,
              fontWeight: activeTab === tab.id ? 700 : 500,
              borderBottom: `2px solid ${activeTab === tab.id ? ACCENT : "transparent"}`,
              marginBottom: -1,
            }}>{tab.label}</button>
          ))}
        </div>

        {activeTab === "info" && (
          <>
            <div style={section}>
              <div style={sectionHead}>بيانات العميل</div>
              <FieldGrid rows={customerFields} />
            </div>

            <div style={section}>
              <div style={sectionHead}>بيانات الطلب</div>
              <FieldGrid rows={commercialFields} />
            </div>

            {(order.notes || order.production_notes) && (
              <div style={section}>
                <div style={sectionHead}>ملاحظات</div>
                {order.notes && (
                  <div style={{ padding: "10px 14px", borderBottom: order.production_notes ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>ملاحظات عامة</div>
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.9 }}>{order.notes}</div>
                  </div>
                )}
                {order.production_notes && (
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>ملاحظات الإنتاج</div>
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.9 }}>{order.production_notes}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "items" && (
          <div style={section}>
            <div style={sectionHead}>بنود الطلبية ({orderItems.length})</div>
            {orderItems.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", direction: "rtl", textAlign: "right" }}>
                <thead>
                  <tr style={{ background: T.head }}>
                    {["#", "المنتج", "الكمية", "السعر", "الخصم", "الإجمالي"].map((h) => (
                      <th key={h} style={{
                        padding: "8px 12px", fontSize: 11, fontWeight: 700, color: T.muted,
                        borderBottom: `1px solid ${T.border}`, textAlign: h === "المنتج" || h === "#" ? "right" : "left",
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item: any, i: number) => (
                    <tr key={item.id || i} style={{ background: i % 2 ? T.zebra : T.card }}>
                      <td style={{ padding: "8px 12px", fontSize: 11.5, color: T.faint, fontFamily: MONO, borderBottom: `1px solid ${T.border}` }}>{i + 1}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 600, color: T.text, borderBottom: `1px solid ${T.border}` }}>
                        {item.product_name}
                        {item.fabric && <span style={{ marginRight: 8, fontSize: 11, color: T.faint, fontWeight: 500 }}>({item.fabric})</span>}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.text, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{item.quantity}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.muted, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.muted, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.discount)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, color: T.text, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: T.head }}>
                    <td colSpan={5} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700, color: T.muted }}>الإجمالي</td>
                    <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 800, color: NAVY, fontFamily: MONO, textAlign: "left" }}>
                      {fmt(orderItems.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div style={{ padding: "28px 14px", textAlign: "center", color: T.faint, fontSize: 12.5 }}>
                لا توجد بنود مسجلة لهذه الطلبية
              </div>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div style={section}>
            <div style={sectionHead}>سجل التتبع</div>
            <div style={{ padding: "14px" }}>
              <OrderStatusTimeline orderId={order.id} orderTable={sourceTable} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderDetailPage;
