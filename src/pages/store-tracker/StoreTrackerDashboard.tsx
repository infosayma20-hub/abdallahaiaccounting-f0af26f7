import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import StoreTrackerLayout from "./StoreTrackerLayout";
import StoreTrackerReports from "./StoreTrackerReports";

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

const sourceMap: Record<string, string> = {
  whatsapp: "واتساب",
  visit: "زيارة مباشرة",
  store: "المتجر",
  other: "أخرى",
};

export default function StoreTrackerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [activeTab, setActiveTab] = useState<"orders" | "reports">("orders");
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Get team owner
      const { data: profile } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", user.id)
        .single();
      const ownerId = profile?.invited_by || user.id;
      setCompanyId(ownerId);

      const { data } = await supabase
        .from("qamar_orders")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });
      setOrders(data || []);
      setLoading(false);
    };
    fetchData();

    // Real-time subscription
    const channel = supabase
      .channel(`store-tracker-orders-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qamar_orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setOrders((prev) => [payload.new as any, ...prev]);
          // Play notification sound
          try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
        } else if (payload.eventType === "UPDATE") {
          setOrders((prev) => prev.map((o) => (o.id === (payload.new as any).id ? payload.new : o)));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleAdvanceStatus = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "جديد") return;
    await supabase.from("qamar_orders").update({ status: "قيد المراجعة" }).eq("id", orderId);
    // Log status change
    await supabase.from("order_status_log").insert({
      order_id: orderId,
      from_status: "جديد",
      to_status: "قيد المراجعة",
      changed_by: user?.id,
      changed_by_name: user?.email || "متابع متاجر",
      user_id: companyId,
    });
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "قيد المراجعة" } : o))
    );
  };

  const statuses = ["الكل", "جديد", "قيد المراجعة", "قيد التصنيع", "جاهز للتسليم", "تم التسليم", "مفوتر"];
  const statusCounts = statuses.reduce((acc, s) => {
    acc[s] = s === "الكل" ? orders.length : orders.filter((o) => o.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === "الكل" || o.status === statusFilter;
    const matchSearch =
      !search ||
      o.customer_name?.includes(search) ||
      o.reference_number?.includes(search) ||
      o.customer_phone?.includes(search);
    return matchStatus && matchSearch;
  });

  const kpis = [
    { label: "جديدة", count: statusCounts["جديد"] || 0, color: "#3B82F6", icon: "🆕" },
    { label: "قيد المراجعة", count: statusCounts["قيد المراجعة"] || 0, color: "#F59E0B", icon: "🔍" },
    { label: "تحتاج متابعة", count: orders.filter((o) => o.status === "جديد" && new Date(o.created_at) < new Date(Date.now() - 86400000)).length, color: "#EF4444", icon: "⚠️" },
  ];

  if (loading) {
    return (
      <StoreTrackerLayout activeTab={activeTab} onTabChange={setActiveTab}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", fontFamily: "Cairo" }}>
          <div style={{ fontSize: "18px", color: "#6B7280" }}>جاري التحميل...</div>
        </div>
      </StoreTrackerLayout>
    );
  }

  return (
    <StoreTrackerLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "reports" ? (
        <StoreTrackerReports orders={orders} />
      ) : (
        <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", direction: "rtl", fontFamily: "Cairo" }}>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  borderRight: `4px solid ${kpi.color}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>{kpi.icon}</div>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#0D1B2E", fontFamily: "Cairo" }}>{kpi.count}</div>
                <div style={{ fontSize: "14px", color: "#6B7280", fontFamily: "Cairo" }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="🔍 بحث بالاسم أو رقم الطلبية أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
                fontSize: "14px",
                fontFamily: "Cairo",
                direction: "rtl",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#0D1B2E")}
              onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Status Filters */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontFamily: "Cairo",
                  fontWeight: statusFilter === s ? "700" : "500",
                  background: statusFilter === s ? "#0D1B2E" : "#F1F5F9",
                  color: statusFilter === s ? "white" : "#475569",
                  transition: "all 0.2s",
                }}
              >
                {s} ({statusCounts[s] || 0})
              </button>
            ))}
          </div>

          {/* Orders List */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF", fontFamily: "Cairo" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>📭</div>
              <div style={{ fontSize: "16px" }}>لا توجد طلبيات مطابقة</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filtered.map((order) => (
                <div
                  key={order.id}
                  style={{
                    background: "white",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    borderRight: `4px solid ${statusColors[order.status] || "#6B7280"}`,
                    transition: "box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "13px", color: "#0D1B2E", fontWeight: "700", fontFamily: "Cairo" }}>
                        {order.reference_number || "—"}
                      </span>
                      <span style={{ fontSize: "15px", fontWeight: "600", color: "#1E293B", fontFamily: "Cairo" }}>
                        {order.customer_name || "بدون اسم"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", fontFamily: "Cairo" }}>
                        ₪{(order.total || 0).toLocaleString()}
                      </span>
                      <span
                        style={{
                          padding: "3px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "600",
                          fontFamily: "Cairo",
                          background: `${statusColors[order.status] || "#6B7280"}15`,
                          color: statusColors[order.status] || "#6B7280",
                        }}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#6B7280", fontFamily: "Cairo", marginBottom: "10px" }}>
                    {order.customer_phone && <span>📞 {order.customer_phone}</span>}
                    {order.customer_city && <span>📍 {order.customer_city}</span>}
                    {order.source && <span>📱 {sourceMap[order.source] || order.source}</span>}
                    {order.agent_name && <span>👤 {order.agent_name}</span>}
                    <span>🕐 {formatDistanceToNow(new Date(order.created_at), { locale: ar, addSuffix: true })}</span>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => navigate(`/store-tracker/orders/${order.id}`)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: "8px",
                        border: "1px solid #E5E7EB",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontFamily: "Cairo",
                        color: "#475569",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      👁️ عرض
                    </button>
                    {order.status === "جديد" && (
                      <button
                        onClick={() => handleAdvanceStatus(order.id)}
                        style={{
                          padding: "5px 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: "linear-gradient(135deg, #0D1B2E, #1E3A5F)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontFamily: "Cairo",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ✅ بدء المراجعة
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </StoreTrackerLayout>
  );
}
