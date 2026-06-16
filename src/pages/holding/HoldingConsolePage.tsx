import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Subsidiary {
  owner_id: string;
  display_name_ar: string;
  sector: string | null;
  sort_order: number;
}

interface TBRow {
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

const SECTOR_LABEL: Record<string, string> = {
  medical_dental: "طب أسنان",
  medical_tender: "مستلزمات طبية",
  education: "تعليم",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}

function currentFY(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function HoldingConsolePage() {
  const { id: holdingId = "" } = useParams();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [holdingName, setHoldingName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subsidiary[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // null = root (consolidated)
  const fy = useMemo(currentFY, []);
  const [fromDate, setFromDate] = useState(fy.from);
  const [toDate, setToDate] = useState(fy.to);
  const [rows, setRows] = useState<TBRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // Guard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("is_holding_member", { _holding_id: holdingId });
      setAllowed(Boolean(data));
      setChecking(false);
    })();
  }, [holdingId]);

  // Load holding header + subsidiaries
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const [{ data: h }, { data: list }] = await Promise.all([
        supabase.from("holdings").select("name_ar, logo_url").eq("id", holdingId).maybeSingle(),
        supabase
          .from("holding_companies")
          .select("owner_id, display_name_ar, sector, sort_order")
          .eq("holding_id", holdingId)
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (h) {
        setHoldingName(h.name_ar);
        setLogoUrl(h.logo_url);
      }
      setSubs((list as Subsidiary[]) || []);
    })();
  }, [allowed, holdingId]);

  // Load trial balance whenever selection or dates change
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      setLoadingRows(true);
      const args = selected
        ? { p_holding_id: holdingId, p_owner_id: selected, p_from: fromDate, p_to: toDate }
        : { p_holding_id: holdingId, p_from: fromDate, p_to: toDate };
      const fnName = selected ? "holding_subsidiary_trial_balance" : "holding_consolidated_trial_balance";
      const { data, error } = await supabase.rpc(fnName as any, args as any);
      if (!error && data) setRows(data as TBRow[]);
      else setRows([]);
      setLoadingRows(false);
    })();
  }, [allowed, holdingId, selected, fromDate, toDate]);

  const kpi = useMemo(() => {
    let revenue = 0, expense = 0, td = 0, tc = 0;
    for (const r of rows) {
      td += Number(r.total_debit || 0);
      tc += Number(r.total_credit || 0);
      const p = (r.account_code || "")[0];
      if (p === "4") revenue += Number(r.total_credit) - Number(r.total_debit);
      else if (p === "5") expense += Number(r.total_debit) - Number(r.total_credit);
    }
    return { revenue, expense, net: revenue - expense, totalDebit: td, totalCredit: tc, balanced: Math.abs(td - tc) < 0.01 };
  }, [rows]);

  const selectedSub = subs.find((s) => s.owner_id === selected) || null;

  if (checking) {
    return (
      <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        جارٍ التحقق...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>لا تملك صلاحية</h1>
          <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 16 }}>هذه الطبقة مخصّصة لأعضاء القابضة فقط.</p>
          <button onClick={() => navigate("/auth")} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #FFFFFF", backgroundColor: "transparent", color: "#FFFFFF", cursor: "pointer", fontFamily: "inherit" }}>
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 36 }} />}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{holdingName || "القابضة"}</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>كونسول القابضة — قراءة فقط</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 20, padding: 20, alignItems: "start" }}>
        {/* Company tree (right rail visually in RTL = first grid column) */}
        <aside style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>شجرة الشركات</div>

          <button
            onClick={() => setSelected(null)}
            style={{
              width: "100%", textAlign: "right", padding: "10px 12px", borderRadius: 8,
              border: selected === null ? "1px solid #FFFFFF" : "1px solid rgba(255,255,255,0.1)",
              backgroundColor: selected === null ? "rgba(255,255,255,0.08)" : "transparent",
              color: "#FFFFFF", fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8,
            }}
          >
            🏢 {holdingName || "القابضة"} <span style={{ opacity: 0.5, fontWeight: 400, fontSize: 11 }}>(موحّد)</span>
          </button>

          <div style={{ paddingRight: 12, borderRight: "1px dashed rgba(255,255,255,0.15)", marginRight: 8 }}>
            {subs.length === 0 && <div style={{ fontSize: 12, opacity: 0.5, padding: 8 }}>لا توجد شركات مرتبطة بعد</div>}
            {subs.map((s) => (
              <div key={s.owner_id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setSelected(s.owner_id)}
                  style={{
                    width: "100%", textAlign: "right", padding: "8px 10px", borderRadius: 8,
                    border: selected === s.owner_id ? "1px solid #FFFFFF" : "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: selected === s.owner_id ? "rgba(255,255,255,0.08)" : "transparent",
                    color: "#FFFFFF", fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>{s.display_name_ar}</span>
                    {s.sector && (
                      <span style={{ backgroundColor: "#E8F0FE", color: "#0D1B2E", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontFamily: "'Cairo', sans-serif" }}>
                        {SECTOR_LABEL[s.sector] || s.sector}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  disabled
                  title="متاح في المرحلة 2"
                  style={{ marginTop: 4, width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px dashed rgba(255,255,255,0.2)", backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", fontFamily: "inherit", fontSize: 11, cursor: "not-allowed" }}
                >
                  تشغيل الشركة
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Main area */}
        <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Header bar */}
          <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {selectedSub ? selectedSub.display_name_ar : "ميزان المراجعة الموحّد"}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                {selectedSub?.sector && (
                  <span style={{ backgroundColor: "#E8F0FE", color: "#0D1B2E", borderRadius: 6, padding: "1px 6px", fontSize: 10 }}>
                    {SECTOR_LABEL[selectedSub.sector] || selectedSub.sector}
                  </span>
                )}
                <span>عرض للقراءة فقط · بعملة العرض (ILS)</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                من
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(0,0,0,0.25)", color: "#FFFFFF", fontFamily: "inherit", direction: "ltr" }} />
              </label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                إلى
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(0,0,0,0.25)", color: "#FFFFFF", fontFamily: "inherit", direction: "ltr" }} />
              </label>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { label: "الإيرادات", value: kpi.revenue, color: "#10B981" },
              { label: "المصروفات", value: kpi.expense, color: "#EF4444" },
              { label: "صافي النتيجة", value: kpi.net, color: kpi.net >= 0 ? "#10B981" : "#EF4444" },
              { label: "إجمالي مدين", value: kpi.totalDebit, color: "#FFFFFF" },
              { label: "إجمالي دائن", value: kpi.totalCredit, color: "#FFFFFF" },
            ].map((k) => (
              <div key={k.label} style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color, direction: "ltr", textAlign: "right" }}>{fmt(k.value)}</div>
              </div>
            ))}
            <div style={{ backgroundColor: kpi.balanced ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.15)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>توازن مدين = دائن</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: kpi.balanced ? "#10B981" : "#EF4444" }}>
                {kpi.balanced ? "✓ متوازن" : "⚠ غير متوازن"}
              </div>
            </div>
          </div>

          {/* Trial balance table */}
          <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ textAlign: "right", padding: "10px 8px", fontWeight: 700, opacity: 0.7 }}>الكود</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", fontWeight: 700, opacity: 0.7 }}>اسم الحساب</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700, opacity: 0.7 }}>مدين</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700, opacity: 0.7 }}>دائن</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700, opacity: 0.7 }}>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows ? (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>جارٍ تحميل البيانات...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>لا توجد حركات في الفترة المحدّدة</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.account_code} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px", direction: "ltr", textAlign: "right" }}>{r.account_code}</td>
                      <td style={{ padding: "8px" }}>{r.account_name}</td>
                      <td style={{ padding: "8px", direction: "ltr", textAlign: "left", color: "#10B981" }}>{fmt(r.total_debit)}</td>
                      <td style={{ padding: "8px", direction: "ltr", textAlign: "left", color: "#EF4444" }}>{fmt(r.total_credit)}</td>
                      <td style={{ padding: "8px", direction: "ltr", textAlign: "left", fontWeight: 700 }}>{fmt(r.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}