import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PRODUCTION_SUB_STAGES } from "./OrderStatusTimeline";
import { syncProductionToWebhook } from "@/lib/syncProductionWebhook";

const F = "Cairo, sans-serif";
const NAVY = "#0D1B2E";

interface Props {
  orderId: string;
  orderTable: string;
  onUpdate: () => void;
}

type SubStageLog = {
  id: string;
  sub_stage: string;
  changed_by_name: string;
  changed_at: string;
  actual_duration_hours: number | null;
  metadata: any;
};

export default function ProductionSubStages({ orderId, orderTable, onUpdate }: Props) {
  const { user } = useAuth();
  const [subLogs, setSubLogs] = useState<SubStageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => { fetchSubLogs(); }, [orderId]);

  const fetchSubLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("order_status_log" as any)
      .select("*")
      .eq("order_id", orderId)
      .eq("to_status", "قيد التصنيع")
      .not("sub_stage", "is", null)
      .order("changed_at", { ascending: true });
    setSubLogs((data as any[]) || []);
    setLoading(false);
  };

  const completedStages = new Set(subLogs.filter(l => l.metadata?.completed).map(l => l.sub_stage));
  const activeStageIndex = PRODUCTION_SUB_STAGES.findIndex(s => !completedStages.has(s));
  const progress = (completedStages.size / PRODUCTION_SUB_STAGES.length) * 100;
  const allComplete = completedStages.size === PRODUCTION_SUB_STAGES.length;

  const completeCurrentStage = async () => {
    if (!user || activeStageIndex === -1) return;
    setCompleting(true);
    try {
      const stageName = PRODUCTION_SUB_STAGES[activeStageIndex];
      const { data: profile } = await supabase.from("profiles" as any).select("display_name").eq("user_id", user.id).maybeSingle();
      const userName = (profile as any)?.display_name || user.email || "مستخدم";
      const { data: ownerIdResult } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });

      await supabase.from("order_status_log" as any).insert({
        user_id: ownerIdResult || user.id,
        order_id: orderId,
        order_table: orderTable,
        from_status: "قيد التصنيع",
        to_status: "قيد التصنيع",
        sub_stage: stageName,
        changed_by: user.id,
        changed_by_name: userName,
        changed_by_role: "production_manager",
        metadata: { completed: true },
      });

      // Auto-sync sub-stage completion to webhook
      syncProductionToWebhook({
        user_id: ownerIdResult || user.id,
        order_id: orderId,
        event_type: "sub_stage_complete",
        to_status: "قيد التصنيع",
        sub_stage: stageName,
        changed_by_name: userName,
        changed_by_role: "production_manager",
        metadata: { completed: true },
      });

      toast.success(`✅ تم إنهاء: ${stageName}`);
      fetchSubLogs();
      onUpdate();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ background: "white", borderRadius: "16px", padding: "20px", border: "1px solid #F1F5F9", marginBottom: "20px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: "700", color: NAVY, fontFamily: F, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        🏭 مراحل الإنتاج
      </h3>

      {/* Progress bar */}
      <div style={{ width: "100%", height: "8px", borderRadius: "4px", background: "#F1F5F9", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{
          width: `${progress}%`, height: "100%", borderRadius: "4px",
          background: "linear-gradient(90deg, #0D1B2E, #3B82F6)",
          transition: "width 0.5s ease",
        }} />
      </div>

      <div style={{ fontSize: "12px", color: "#94A3B8", fontFamily: F, marginBottom: "12px", textAlign: "left" }}>
        {Math.round(progress)}%
      </div>

      {/* Sub-stage rows */}
      {PRODUCTION_SUB_STAGES.map((stage, idx) => {
        const isDone = completedStages.has(stage);
        const isActive = idx === activeStageIndex;
        const log = subLogs.find(l => l.sub_stage === stage && l.metadata?.completed);
        const dateStr = log ? new Date(log.changed_at).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" }) : "—";
        const timeStr = log ? new Date(log.changed_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";

        return (
          <div key={stage} style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "10px 16px", borderRadius: "10px", marginBottom: "6px",
            background: isActive ? "#FEF3C7" : isDone ? "#F0FDF4" : "#FAFBFC",
            border: isActive ? "1px solid #FDE68A" : "1px solid transparent",
            fontFamily: F, fontSize: "14px",
          }}>
            <span style={{ fontSize: "16px", width: "24px", textAlign: "center" }}>
              {isDone ? "✅" : isActive ? "🔄" : "⬜"}
            </span>
            <span style={{ flex: 1, color: isDone ? "#16A34A" : isActive ? "#92400E" : "#94A3B8", fontWeight: isActive ? "600" : "400" }}>
              {stage}
            </span>
            <span style={{ fontSize: "12px", color: "#94A3B8", width: "60px", textAlign: "center" }}>
              {log?.actual_duration_hours ? `${log.actual_duration_hours}س` : "—"}
            </span>
            <span style={{ fontSize: "12px", color: "#94A3B8", width: "80px", textAlign: "center" }}>
              {log?.changed_by_name || "—"}
            </span>
            <span style={{ fontSize: "11px", color: "#94A3B8", width: "100px", textAlign: "center" }}>
              {dateStr} {timeStr}
            </span>
          </div>
        );
      })}

      {/* Complete button */}
      {!allComplete && activeStageIndex >= 0 && (
        <button onClick={completeCurrentStage} disabled={completing} style={{
          width: "100%", marginTop: "16px", padding: "14px", borderRadius: "12px",
          background: allComplete ? "#F1F5F9" : "linear-gradient(135deg, #16A34A, #22C55E)",
          color: "white", border: "none", fontFamily: F, fontSize: "14px", fontWeight: "700",
          cursor: completing ? "wait" : "pointer", opacity: completing ? 0.7 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}>
          ✅ إنهاء المرحلة الحالية: {PRODUCTION_SUB_STAGES[activeStageIndex]}
        </button>
      )}

      {allComplete && (
        <div style={{
          marginTop: "16px", padding: "14px", borderRadius: "12px", textAlign: "center",
          background: "#F0FDF4", border: "1px solid #BBF7D0", fontFamily: F, fontSize: "14px",
          fontWeight: "600", color: "#16A34A",
        }}>
          ✅ تم إنهاء جميع مراحل الإنتاج — يمكنك الآن نقل الطلبية لـ "جاهز للفوترة"
        </div>
      )}
    </div>
  );
}
