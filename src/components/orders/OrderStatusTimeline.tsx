import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const F = "Cairo, sans-serif";

export const ORDER_STAGES = [
  { key: "جديد", label: "جديد", color: "#3B82F6", icon: "🆕", order: 1 },
  { key: "قيد المراجعة", label: "قيد المراجعة", color: "#6366F1", icon: "👁️", order: 2 },
  { key: "مؤكد", label: "مؤكد", color: "#8B5CF6", icon: "✅", order: 3 },
  { key: "قيد التصنيع", label: "قيد التصنيع", color: "#F59E0B", icon: "🏭", order: 4 },
  { key: "جاهز للفوترة", label: "جاهز للفوترة", color: "#8B5CF6", icon: "📄", order: 5 },
  { key: "مفوتر", label: "مفوتر", color: "#06B6D4", icon: "🧾", order: 6 },
  { key: "جاهز للشحن", label: "جاهز للشحن", color: "#14B8A6", icon: "📦", order: 7 },
  { key: "تم الشحن", label: "تم الشحن", color: "#22C55E", icon: "🚚", order: 8 },
  { key: "تم التسليم", label: "تم التسليم", color: "#16A34A", icon: "✅📦", order: 9 },
];

export const SPECIAL_STAGES = [
  { key: "مؤجل", label: "مؤجل", color: "#EAB308", icon: "⏸️" },
  { key: "ملغي", label: "ملغي", color: "#EF4444", icon: "❌" },
];

export const PRODUCTION_SUB_STAGES = [
  "تجهيز الخشب",
  "تصنيع الهيكل",
  "تركيب الزجاج",
  "الدهان والتشطيب",
  "فحص الجودة",
];

export const getStageColor = (status: string) => {
  const stage = [...ORDER_STAGES, ...SPECIAL_STAGES].find(s => s.key === status);
  return stage?.color || "#94A3B8";
};

export const getStageIcon = (status: string) => {
  const stage = [...ORDER_STAGES, ...SPECIAL_STAGES].find(s => s.key === status);
  return stage?.icon || "📋";
};

export const getStageOrder = (status: string) => {
  const stage = ORDER_STAGES.find(s => s.key === status);
  return stage?.order || 0;
};

export const getNextStage = (currentStatus: string) => {
  const currentOrder = getStageOrder(currentStatus);
  return ORDER_STAGES.find(s => s.order === currentOrder + 1) || null;
};

type StatusLog = {
  id: string;
  from_status: string | null;
  to_status: string;
  sub_stage: string | null;
  changed_by_name: string;
  changed_by_role: string | null;
  changed_at: string;
  notes: string | null;
  metadata: any;
  estimated_duration_hours: number | null;
  actual_duration_hours: number | null;
};

interface Props {
  orderId: string;
  orderTable?: string;
}

export default function OrderStatusTimeline({ orderId, orderTable = "orders" }: Props) {
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [orderId]);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("order_status_log" as any)
      .select("*")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: false });
    if (!error && data) setLogs(data as any[]);
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8", fontFamily: F, fontSize: "14px" }}>جاري التحميل...</div>;
  }

  if (logs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8", fontFamily: F, fontSize: "14px" }}>
        <p style={{ fontSize: "32px", marginBottom: "8px" }}>📋</p>
        لا يوجد سجل تتبع بعد
      </div>
    );
  }

  // Group sub-stages under their parent production stage
  const groupedLogs: (StatusLog & { subStages?: StatusLog[] })[] = [];
  let currentProduction: (StatusLog & { subStages?: StatusLog[] }) | null = null;

  // Process in chronological order, then reverse
  const chronological = [...logs].reverse();
  for (const log of chronological) {
    if (log.to_status === "قيد التصنيع" && !log.sub_stage) {
      currentProduction = { ...log, subStages: [] };
      groupedLogs.push(currentProduction);
    } else if (log.sub_stage && currentProduction) {
      currentProduction.subStages!.push(log);
    } else {
      groupedLogs.push(log);
    }
  }
  groupedLogs.reverse();

  return (
    <div style={{ position: "relative", paddingRight: "32px", direction: "rtl" }}>
      {/* Vertical line */}
      <div style={{
        position: "absolute", right: "11px", top: "24px", bottom: "24px",
        width: "2px", background: "linear-gradient(to bottom, #0D1B2E, #E2E8F0)",
      }} />

      {groupedLogs.map((log, idx) => {
        const isLatest = idx === 0;
        const color = getStageColor(log.to_status);
        const icon = getStageIcon(log.to_status);
        const meta = log.metadata || {};
        const date = new Date(log.changed_at);
        const dateStr = date.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
        const timeStr = date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

        return (
          <div key={log.id} style={{ position: "relative", paddingRight: "40px", paddingBottom: "28px" }}>
            {/* Dot */}
            <div style={{
              position: "absolute", right: "-27px", top: "4px",
              width: isLatest ? "22px" : "16px", height: isLatest ? "22px" : "16px",
              borderRadius: "50%", background: color,
              border: isLatest ? `3px solid ${color}33` : "3px solid white",
              boxShadow: isLatest
                ? `0 0 0 4px ${color}22, 0 2px 8px ${color}44`
                : "0 1px 3px rgba(0,0,0,0.1)",
              zIndex: 2,
            }} />

            {/* Status title */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{
                fontSize: isLatest ? "16px" : "14px",
                fontWeight: isLatest ? "700" : "600",
                color: isLatest ? "#0D1B2E" : "#475569",
                fontFamily: F,
              }}>
                {log.to_status}
              </span>
              <span style={{ fontSize: "16px" }}>{icon}</span>
            </div>

            {/* Who + When */}
            <div style={{ fontSize: "13px", color: "#94A3B8", fontFamily: F, lineHeight: "1.6" }}>
              <span>{log.changed_by_name}</span>
              {log.changed_by_role && <span> ({log.changed_by_role})</span>}
              <br />
              <span>{dateStr} — {timeStr}</span>
            </div>

            {/* Notes */}
            {log.notes && (
              <p style={{ fontSize: "13px", color: "#64748B", fontFamily: F, marginTop: "4px" }}>{log.notes}</p>
            )}

            {/* Metadata extras */}
            {meta.driver && (
              <p style={{ fontSize: "12px", color: "#64748B", fontFamily: F, marginTop: "4px" }}>
                السائق: {meta.driver}{meta.tracking ? ` • رقم التتبع: ${meta.tracking}` : ""}
              </p>
            )}
            {meta.received_by && (
              <p style={{ fontSize: "12px", color: "#64748B", fontFamily: F, marginTop: "4px" }}>
                استلمه: {meta.received_by}
              </p>
            )}
            {meta.reason && (
              <p style={{ fontSize: "12px", color: "#EF4444", fontFamily: F, marginTop: "4px" }}>
                السبب: {meta.reason}
              </p>
            )}
            {meta.invoice_number && (
              <p style={{ fontSize: "12px", color: "#06B6D4", fontFamily: F, marginTop: "4px" }}>
                فاتورة رقم: {meta.invoice_number}
              </p>
            )}
            {meta.source && (
              <p style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F, marginTop: "4px" }}>
                مصدر: {meta.source}
              </p>
            )}

            {/* Production sub-stages */}
            {(log as any).subStages && (log as any).subStages.length > 0 && (
              <div style={{ marginTop: "8px", paddingRight: "16px" }}>
                {(log as any).subStages.map((sub: StatusLog) => {
                  const isDone = sub.metadata?.completed;
                  return (
                    <div key={sub.id} style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      fontSize: "12px", color: isDone ? "#16A34A" : "#94A3B8",
                      fontFamily: F, marginTop: "4px",
                    }}>
                      <span>{isDone ? "├─ " : "├─ "}</span>
                      <span>{sub.sub_stage}</span>
                      <span>{isDone ? "✅" : "🔄"}</span>
                      {sub.actual_duration_hours && (
                        <span style={{ color: "#94A3B8" }}>({sub.actual_duration_hours} ساعات)</span>
                      )}
                      {sub.changed_by_name && (
                        <span style={{ color: "#94A3B8" }}>— {sub.changed_by_name}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
