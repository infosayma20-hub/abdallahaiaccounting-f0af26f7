import { useMemo, useState } from "react";
import { format, startOfDay, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { ar } from "date-fns/locale";

const statusColors: Record<string, string> = {
  "جديد": "#3B82F6",
  "قيد المراجعة": "#F59E0B",
  "قيد التصنيع": "#8B5CF6",
  "جاهز للتسليم": "#10B981",
  "تم التسليم": "#059669",
  "مفوتر": "#0D9488",
  "ملغي": "#EF4444",
};

interface Props {
  orders: any[];
}

export default function StoreTrackerReports({ orders }: Props) {
  const [activeReport, setActiveReport] = useState<"daily" | "agent" | "region" | "overdue">("daily");

  const reports = [
    { key: "daily" as const, label: "📅 ملخص يومي", icon: "📅" },
    { key: "agent" as const, label: "👩‍💼 حسب الموظفة", icon: "👩‍💼" },
    { key: "region" as const, label: "📍 حسب المنطقة", icon: "📍" },
    { key: "overdue" as const, label: "⏰ المتأخرة", icon: "⏰" },
  ];

  // Daily summary
  const dailySummary = useMemo(() => {
    const grouped: Record<string, { count: number; total: number; statuses: Record<string, number> }> = {};
    orders.forEach((o) => {
      const day = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!grouped[day]) grouped[day] = { count: 0, total: 0, statuses: {} };
      grouped[day].count++;
      grouped[day].total += o.total || 0;
      grouped[day].statuses[o.status] = (grouped[day].statuses[o.status] || 0) + 1;
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30);
  }, [orders]);

  // By agent
  const agentSummary = useMemo(() => {
    const grouped: Record<string, { count: number; total: number }> = {};
    orders.forEach((o) => {
      const name = o.agent_name || "غير محدد";
      if (!grouped[name]) grouped[name] = { count: 0, total: 0 };
      grouped[name].count++;
      grouped[name].total += o.total || 0;
    });
    return Object.entries(grouped).sort(([, a], [, b]) => b.total - a.total);
  }, [orders]);

  // By region
  const regionSummary = useMemo(() => {
    const grouped: Record<string, { count: number; total: number }> = {};
    orders.forEach((o) => {
      const city = o.customer_city || "غير محدد";
      if (!grouped[city]) grouped[city] = { count: 0, total: 0 };
      grouped[city].count++;
      grouped[city].total += o.total || 0;
    });
    return Object.entries(grouped).sort(([, a], [, b]) => b.total - a.total);
  }, [orders]);

  // Overdue (same status > 3 days)
  const overdueOrders = useMemo(() => {
    const threeDaysAgo = Date.now() - 3 * 86400000;
    return orders.filter(
      (o) => !["تم التسليم", "مفوتر", "ملغي"].includes(o.status) && new Date(o.created_at).getTime() < threeDaysAgo
    );
  }, [orders]);

  const cardStyle = {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  };

  const maxAgentTotal = agentSummary.length > 0 ? agentSummary[0][1].total : 1;
  const maxRegionTotal = regionSummary.length > 0 ? regionSummary[0][1].total : 1;

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", direction: "rtl", fontFamily: "Cairo" }}>
      {/* Report Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        {reports.map((r) => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            style={{
              padding: "8px 20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontFamily: "Cairo",
              fontWeight: activeReport === r.key ? "700" : "500",
              background: activeReport === r.key ? "#0D1B2E" : "#F1F5F9",
              color: activeReport === r.key ? "white" : "#475569",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Daily Summary */}
      {activeReport === "daily" && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "16px", fontFamily: "Cairo" }}>
            📅 ملخص الطلبيات اليومي
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Cairo" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "10px", textAlign: "right", fontSize: "13px", color: "#6B7280" }}>التاريخ</th>
                <th style={{ padding: "10px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>العدد</th>
                <th style={{ padding: "10px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>الإجمالي</th>
                <th style={{ padding: "10px", textAlign: "center", fontSize: "13px", color: "#6B7280" }}>الحالات</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.map(([date, data]) => (
                <tr key={date} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "10px", fontSize: "13px", fontWeight: "600" }}>
                    {format(new Date(date), "dd MMM yyyy", { locale: ar })}
                  </td>
                  <td style={{ padding: "10px", textAlign: "center", fontSize: "14px", fontWeight: "700" }}>{data.count}</td>
                  <td style={{ padding: "10px", textAlign: "center", fontSize: "14px", fontWeight: "700", color: "#0D1B2E" }}>
                    ₪{data.total.toLocaleString()}
                  </td>
                  <td style={{ padding: "10px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                      {Object.entries(data.statuses).map(([status, count]) => (
                        <span
                          key={status}
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            background: `${statusColors[status] || "#6B7280"}15`,
                            color: statusColors[status] || "#6B7280",
                            fontWeight: "600",
                          }}
                        >
                          {status} ({count})
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Agent */}
      {activeReport === "agent" && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "16px", fontFamily: "Cairo" }}>
            👩‍💼 طلبيات حسب الموظفة
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {agentSummary.map(([name, data], i) => (
              <div key={name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#1E293B" }}>
                    {i === 0 && "🏆 "}{name}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B7280" }}>
                    {data.count} طلبية — ₪{data.total.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    borderRadius: "4px",
                    background: `linear-gradient(90deg, #0D1B2E ${(data.total / maxAgentTotal) * 100}%, #F1F5F9 ${(data.total / maxAgentTotal) * 100}%)`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Region */}
      {activeReport === "region" && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "16px", fontFamily: "Cairo" }}>
            📍 طلبيات حسب المنطقة
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {regionSummary.map(([city, data]) => (
              <div key={city}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#1E293B" }}>{city}</span>
                  <span style={{ fontSize: "13px", color: "#6B7280" }}>
                    {data.count} طلبية — ₪{data.total.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    borderRadius: "4px",
                    background: `linear-gradient(90deg, #0D9488 ${(data.total / maxRegionTotal) * 100}%, #F1F5F9 ${(data.total / maxRegionTotal) * 100}%)`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue */}
      {activeReport === "overdue" && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#0D1B2E", marginBottom: "16px", fontFamily: "Cairo" }}>
            ⏰ الطلبيات المتأخرة (أكثر من 3 أيام بنفس الحالة)
          </h3>
          {overdueOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#10B981", fontSize: "16px" }}>
              ✅ لا توجد طلبيات متأخرة
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {overdueOrders.map((o) => {
                const daysOld = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
                return (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      background: "#FEF2F2",
                      borderRadius: "8px",
                      borderRight: "3px solid #EF4444",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{o.reference_number} — {o.customer_name}</span>
                      <span
                        style={{
                          marginRight: "12px",
                          padding: "2px 10px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          background: `${statusColors[o.status] || "#6B7280"}15`,
                          color: statusColors[o.status] || "#6B7280",
                          fontWeight: "600",
                        }}
                      >
                        {o.status}
                      </span>
                    </div>
                    <span style={{ fontSize: "13px", color: "#EF4444", fontWeight: "700" }}>
                      {daysOld} يوم
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
