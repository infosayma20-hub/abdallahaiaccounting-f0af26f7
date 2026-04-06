import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getStageColor, getStageIcon, getNextStage, ORDER_STAGES, SPECIAL_STAGES } from "./OrderStatusTimeline";
import { syncProductionToWebhook } from "@/lib/syncProductionWebhook";

const F = "Cairo, sans-serif";
const NAVY = "#0D1B2E";

interface Props {
  orderId: string;
  currentStatus: string;
  orderTable: string;
  onStatusChanged: () => void;
}

export default function OrderStatusActions({ orderId, currentStatus, orderTable, onStatusChanged }: Props) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const nextStage = getNextStage(currentStatus);
  const currentColor = getStageColor(currentStatus);
  const currentIcon = getStageIcon(currentStatus);

  const changeStatus = async (newStatus: string, metadata?: Record<string, any>) => {
    if (!user) return;
    setLoading(true);
    try {
      // Get user profile for name
      const { data: profile } = await supabase
        .from("profiles" as any)
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const userName = (profile as any)?.display_name || user.email || "مستخدم";

      // Insert status log
      const ownerId = user.id;
      const { data: ownerIdResult } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const effectiveUserId = ownerIdResult || user.id;

      await supabase.from("order_status_log" as any).insert({
        user_id: effectiveUserId,
        order_id: orderId,
        order_table: orderTable,
        from_status: currentStatus,
        to_status: newStatus,
        changed_by: user.id,
        changed_by_name: userName,
        changed_by_role: "admin",
        notes: metadata?.notes || null,
        metadata: metadata || {},
      });

      // Update order status in the appropriate table
      if (orderTable === "qamar_orders") {
        await supabase.from("qamar_orders" as any).update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", orderId);
      } else {
        await supabase.from("orders").update({ status: newStatus } as any).eq("id", orderId);
      }

      // Auto-sync to webhook log
      syncProductionToWebhook({
        user_id: effectiveUserId,
        order_id: orderId,
        event_type: "status_change",
        from_status: currentStatus,
        to_status: newStatus,
        changed_by_name: userName,
        changed_by_role: "admin",
        metadata: metadata || {},
      });

      toast.success(`تم تحديث الحالة: ${newStatus}`);
      setShowModal(null);
      setModalData({});
      onStatusChanged();
    } catch (err: any) {
      toast.error("خطأ في تحديث الحالة: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // Determine if the next stage needs extra fields
  const stagesWithExtras: Record<string, { fields: { key: string; label: string; required?: boolean }[] }> = {
    "تم الشحن": { fields: [{ key: "driver", label: "اسم السائق", required: true }, { key: "tracking", label: "رقم التتبع (اختياري)" }] },
    "تم التسليم": { fields: [{ key: "received_by", label: "استلمه (اسم المستلم)", required: true }, { key: "photo_url", label: "صورة التسليم (اختياري)" }] },
    "مؤجل": { fields: [{ key: "reason", label: "سبب التأجيل", required: true }] },
    "ملغي": { fields: [{ key: "reason", label: "سبب الإلغاء", required: true }] },
  };

  const handleNextClick = () => {
    if (!nextStage) return;
    const extras = stagesWithExtras[nextStage.key];
    if (extras) {
      setShowModal(nextStage.key);
      setModalData({});
    } else {
      changeStatus(nextStage.key);
    }
  };

  const handleSpecialClick = (status: string) => {
    setShowModal(status);
    setModalData({});
  };

  const handleModalConfirm = () => {
    if (!showModal) return;
    const extras = stagesWithExtras[showModal];
    if (extras) {
      const missingRequired = extras.fields.filter(f => f.required && !modalData[f.key]?.trim());
      if (missingRequired.length > 0) {
        toast.error(`يرجى ملء: ${missingRequired.map(f => f.label).join("، ")}`);
        return;
      }
    }
    changeStatus(showModal, { ...modalData, notes: modalData.notes || undefined });
  };

  return (
    <div style={{ background: "white", borderRadius: "16px", padding: "20px", border: "1px solid #F1F5F9", marginBottom: "20px" }}>
      {/* Current status */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "14px", color: "#64748B", fontFamily: F }}>الحالة الحالية:</span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 16px",
          borderRadius: "24px", fontSize: "14px", fontWeight: "700", fontFamily: F,
          background: `${currentColor}15`, color: currentColor, border: `1.5px solid ${currentColor}30`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentColor }} />
          {currentStatus} {currentIcon}
        </span>
      </div>

      {/* Next step button */}
      {nextStage && (
        <button onClick={handleNextClick} disabled={loading} style={{
          width: "100%", background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a5f 100%)`,
          color: "white", border: "none", borderRadius: "14px", padding: "16px 24px",
          fontSize: "16px", fontWeight: "700", fontFamily: F, cursor: loading ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          boxShadow: "0 4px 15px rgba(13,27,46,0.25)", transition: "all 0.2s ease",
          opacity: loading ? 0.7 : 1,
          marginBottom: "12px",
        }}>
          ⬅ الخطوة التالية: {nextStage.label} {nextStage.icon}
        </button>
      )}

      {/* Special actions */}
      {currentStatus !== "ملغي" && currentStatus !== "تم التسليم" && (
        <div style={{ display: "flex", gap: "8px" }}>
          {currentStatus !== "مؤجل" && (
            <button onClick={() => handleSpecialClick("مؤجل")} style={{
              flex: 1, padding: "10px 16px", borderRadius: "10px", border: "1.5px solid #EAB308",
              background: "#FFFBEB", color: "#92400E", fontFamily: F, fontSize: "13px", fontWeight: "600",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}>
              ⏸️ تأجيل
            </button>
          )}
          <button onClick={() => handleSpecialClick("ملغي")} style={{
            flex: 1, padding: "10px 16px", borderRadius: "10px", border: "1.5px solid #EF4444",
            background: "#FEF2F2", color: "#DC2626", fontFamily: F, fontSize: "13px", fontWeight: "600",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            ❌ إلغاء
          </button>
        </div>
      )}

      {/* Modal for extra fields */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: "20px", padding: "28px", width: "90%", maxWidth: "420px",
            direction: "rtl", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: NAVY, fontFamily: F, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              تحديث الحالة: {showModal} {getStageIcon(showModal)}
            </h3>

            {stagesWithExtras[showModal]?.fields.map(field => (
              <div key={field.key} style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "13px", color: "#64748B", fontFamily: F, marginBottom: "6px", display: "block" }}>
                  {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
                </label>
                <input
                  value={modalData[field.key] || ""}
                  onChange={e => setModalData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #E2E8F0",
                    fontSize: "14px", fontFamily: F, color: "#1E293B", outline: "none", direction: "rtl",
                  }}
                />
              </div>
            ))}

            {/* Notes (always show) */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "13px", color: "#64748B", fontFamily: F, marginBottom: "6px", display: "block" }}>
                ملاحظات (اختياري)
              </label>
              <textarea
                value={modalData.notes || ""}
                onChange={e => setModalData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #E2E8F0",
                  fontSize: "14px", fontFamily: F, color: "#1E293B", outline: "none", direction: "rtl",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={() => setShowModal(null)} style={{
                flex: 1, padding: "12px", borderRadius: "10px", border: "1.5px solid #E2E8F0",
                background: "white", color: "#64748B", fontFamily: F, fontSize: "14px", fontWeight: "600", cursor: "pointer",
              }}>
                إلغاء
              </button>
              <button onClick={handleModalConfirm} disabled={loading} style={{
                flex: 1, padding: "12px", borderRadius: "10px", border: "none",
                background: showModal === "ملغي" ? "#EF4444" : `linear-gradient(135deg, ${NAVY}, #1e3a5f)`,
                color: "white", fontFamily: F, fontSize: "14px", fontWeight: "700", cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}>
                {showModal === "ملغي" ? "❌ تأكيد الإلغاء" : `✅ تأكيد`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
