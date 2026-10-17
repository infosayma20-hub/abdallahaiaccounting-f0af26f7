import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FinanceShell } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { NAVY, BORDER, MUTED, card } from "./waStyles";
import LeadsTab from "./LeadsTab";
import SettingsTab from "./SettingsTab";
import ChannelTab from "./ChannelTab";
import UsageTab from "./UsageTab";

const TABS = [
  { key: "leads", label: "الطلبات" },
  { key: "settings", label: "الإعدادات" },
  { key: "channel", label: "الرقم" },
  { key: "usage", label: "الاستهلاك" },
] as const;

export default function WaAgentPage() {
  const { tab = "leads" } = useParams();
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!dataOwnerId) return;
    supabase.from("wa_agent_profiles").select("id").eq("owner_id", dataOwnerId).limit(1)
      .then(({ data }) => setEnabled(!!data?.length));
  }, [dataOwnerId]);

  const active = TABS.some((t) => t.key === tab) ? tab : "leads";

  return (
    <FinanceShell title="وكيل واتساب" subtitle="مساعد ذكي يستقبل عملاء واتساب ويلخّص طلباتهم"
      breadcrumb={[{ label: "التطبيقات", href: "/apps" }, { label: "وكيل واتساب" }]}>
      <div dir="rtl" style={{ fontFamily: "Cairo, sans-serif", color: NAVY, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => navigate(`/wa-agent/${t.key}`)}
              style={{
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "Cairo, sans-serif",
                padding: "10px 18px", fontSize: 14, fontWeight: 700,
                color: active === t.key ? NAVY : MUTED,
                borderBottom: active === t.key ? `3px solid ${NAVY}` : "3px solid transparent",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {enabled === false ? (
          <div style={{ ...card, textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>وكيل واتساب غير مفعّل لهذه الشركة</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>تواصل مع إدارة يونيفاي لتفعيل الوحدة.</div>
          </div>
        ) : !dataOwnerId || enabled === null ? (
          <div style={{ color: MUTED, fontSize: 13 }}>جارٍ التحميل…</div>
        ) : active === "leads" ? <LeadsTab ownerId={dataOwnerId} />
          : active === "settings" ? <SettingsTab ownerId={dataOwnerId} />
          : active === "channel" ? <ChannelTab ownerId={dataOwnerId} />
          : <UsageTab ownerId={dataOwnerId} />}
      </div>
    </FinanceShell>
  );
}
