import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Building2, GraduationCap, Stethoscope, Lock, ArrowLeftRight } from "lucide-react";

interface Branding {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}
interface Sub {
  owner_id: string;
  display_name_ar: string;
  sector: string | null;
  sort_order: number | null;
}

const LS_KEY = "sparta:last-workspace";

const SECTOR_VISUAL: Record<string, { Icon: any; bg: string; fg: string; pillBg: string; pillFg: string; cur: string; sym: string }> = {
  dental: { Icon: Stethoscope, bg: "#F3EAF6", fg: "#7A4A8E", pillBg: "#F3EAF6", pillFg: "#7A4A8E", cur: "ILS", sym: "₪" },
  import: { Icon: Building2, bg: "#E7F3EE", fg: "#2E7D5B", pillBg: "#E7F3EE", pillFg: "#2E7D5B", cur: "JPY", sym: "¥" },
  education: { Icon: GraduationCap, bg: "#FBEEDB", fg: "#A06A1E", pillBg: "#FBEEDB", pillFg: "#A06A1E", cur: "ILS", sym: "₪" },
};
const SECTOR_LABEL: Record<string, string> = { dental: "زرعات أسنان", import: "عطاءات · استيراد", education: "تعليم وتدريب" };

export default function WorkspaceSelect() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [holding, setHolding] = useState<Branding | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [userName, setUserName] = useState("");
  const [lang, setLang] = useState<"ar" | "en">(() => (localStorage.getItem("holding-lang") as any) || "ar");

  useEffect(() => { localStorage.setItem("holding-lang", lang); }, [lang]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: bRows } = await supabase.rpc("get_holding_branding_by_slug", { p_slug: slug });
      const b = (bRows as any)?.[0] as Branding | undefined;
      if (!b) { setDenied(true); setLoading(false); return; }
      setHolding(b);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { navigate(`/g/${slug}`, { replace: true }); return; }
      setUserName((u.user.user_metadata as any)?.full_name || u.user.email || "");
      const { data: isMember } = await supabase.rpc("is_holding_member", { _holding_id: b.id });
      if (!isMember) { setDenied(true); setLoading(false); return; }
      const { data: list } = await supabase
        .from("holding_companies")
        .select("owner_id, display_name_ar, sector, sort_order")
        .eq("holding_id", b.id).eq("is_active", true).order("sort_order");
      setSubs((list as Sub[]) || []);
      setLoading(false);

      // Auto-resume last workspace if ?auto=1
      if (search.get("auto") === "1") {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const last = JSON.parse(raw);
            if (last?.holdingId === b.id) {
              if (last.workspace === "consolidated") navigate(`/holding/${b.id}`, { replace: true });
              else navigate(`/holding/${b.id}?company=${last.workspace}`, { replace: true });
            }
          }
        } catch { /* ignore */ }
      }
    })();
  }, [slug]);

  const accent = holding?.primary_color || "#9E2B43";
  const accent2 = holding?.secondary_color || "#B23A55";
  const gradient = `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`;
  const dir = lang === "ar" ? "rtl" : "ltr";

  const enter = (workspace: "consolidated" | string) => {
    if (!holding) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ holdingId: holding.id, workspace }));
    if (workspace === "consolidated") navigate(`/holding/${holding.id}`);
    else navigate(`/holding/${holding.id}?company=${workspace}`);
  };

  const summary = useMemo(() => {
    const n = subs.length;
    return lang === "ar"
      ? `عرض موحّد · ${n} شركات · بالشيكل (ILS)`
      : `Consolidated view · ${n} companies · ILS`;
  }, [subs, lang]);

  if (loading) {
    return (
      <div dir={dir} style={{ fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
        {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
      </div>
    );
  }
  if (denied || !holding) {
    return (
      <div dir={dir} style={{ fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
        {lang === "ar" ? "غير مصرّح" : "Not allowed"}
      </div>
    );
  }

  return (
    <div dir={dir} style={{ fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", background: "#FFFFFF", color: "#0F172A", padding: "32px 24px 64px" }}>
      {/* Lang toggle */}
      <div style={{ position: "absolute", top: 24, [dir === "rtl" ? "left" : "right"]: 24, display: "inline-flex", padding: 3, borderRadius: 999, background: "#F3F4F6", border: "1px solid #E5E7EB" } as React.CSSProperties}>
        {(["ar", "en"] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)} style={{
            padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: lang === l ? gradient : "transparent", color: lang === l ? "#FFFFFF" : "#6B7280", fontFamily: "'Inter', sans-serif", letterSpacing: 0.5,
          }}>{l.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36, paddingTop: 12 }}>
          <div style={{ color: accent, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {lang === "ar" ? `مرحباً بعودتك، ${userName}` : `Welcome back, ${userName}`}
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
            {lang === "ar" ? "اختر مساحة العمل" : "Choose a workspace"}
          </h1>
          <p style={{ color: "#6B7280", fontSize: 14, marginTop: 10 }}>
            {lang === "ar"
              ? "ادخل إلى «القابضة» لعرض موحّد لكل الشركات، أو افتح دفتر شركة واحدة على حدة."
              : "Enter the Holding for a consolidated view, or open a single company ledger."}
          </p>
        </div>

        {/* Holding card */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 0 }}>
          <button onClick={() => enter("consolidated")} style={{
            position: "relative", width: "min(560px, 100%)", border: "1px solid #EEE3E8", borderRadius: 18,
            background: "#FFFFFF", padding: "22px 24px", cursor: "pointer", textAlign: "inherit",
            boxShadow: "0 18px 40px -28px rgba(15,23,42,.18)", fontFamily: "inherit",
          }}>
            <div style={{ position: "absolute", top: 0, insetInlineStart: 20, insetInlineEnd: 20, height: 3, borderRadius: 2, background: gradient }} />
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 52, height: 60, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#FBEDF0", color: accent }}>
                {holding.logo_url ? <img src={holding.logo_url} alt="" style={{ height: 50, objectFit: "contain" }} /> : <span style={{ fontSize: 28, fontWeight: 900 }}>Λ</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{holding.name_ar}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{summary}</div>
              </div>
              <span style={{ background: "#FBEDF0", color: accent, fontSize: 12, fontWeight: 800, padding: "5px 14px", borderRadius: 999 }}>
                {lang === "ar" ? "موحّد" : "Consolidated"}
              </span>
            </div>
          </button>
        </div>

        {/* Tree connectors */}
        {subs.length > 0 && (
          <div style={{ position: "relative", height: 56, margin: "0 auto", maxWidth: 1000 }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 28, width: 2, background: "#E5E7EB", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", left: `${100 / (subs.length * 2)}%`, right: `${100 / (subs.length * 2)}%`, bottom: 28, height: 2, background: "#E5E7EB" }} />
            {subs.map((_, i) => (
              <div key={i} style={{
                position: "absolute", bottom: 0, height: 28, width: 2, background: "#E5E7EB",
                left: `${(100 / subs.length) * (i + 0.5)}%`, transform: "translateX(-50%)",
              }} />
            ))}
          </div>
        )}

        {/* Subsidiary cards */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(subs.length, 1)}, minmax(0, 1fr))`, gap: 18, maxWidth: 1000, margin: "0 auto" }}>
          {subs.map((s) => {
            const sv = (s.sector && SECTOR_VISUAL[s.sector]) || { Icon: Building2, bg: "#F3F4F6", fg: "#374151", pillBg: "#F3F4F6", pillFg: "#374151", cur: "ILS", sym: "₪" };
            const SIcon = sv.Icon;
            const canAccess = true; // Phase 1: holding members see all
            return (
              <div key={s.owner_id} style={{
                position: "relative", border: "1px solid #EEE3E8", borderRadius: 18, background: "#FFFFFF",
                padding: "20px 18px", textAlign: "center", boxShadow: "0 14px 32px -24px rgba(15,23,42,.16)",
                opacity: canAccess ? 1 : 0.65,
              }}>
                <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: 14, background: sv.bg, color: sv.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <SIcon size={26} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, minHeight: 40, lineHeight: 1.4 }}>{s.display_name_ar}</div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ display: "inline-block", background: sv.pillBg, color: sv.pillFg, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>
                    {(s.sector && SECTOR_LABEL[s.sector]) || s.sector || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14, fontSize: 11, color: "#6B7280" }}>
                  <span style={{ fontFamily: "'Inter', sans-serif" }}>{sv.cur} {sv.sym}</span>
                  <span>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
                    {lang === "ar" ? "نشط" : "Active"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  <button onClick={() => canAccess && enter(s.owner_id)} disabled={!canAccess} style={{
                    width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", cursor: canAccess ? "pointer" : "not-allowed",
                    background: canAccess ? gradient : "#E5E7EB", color: canAccess ? "#FFFFFF" : "#9CA3AF",
                    fontFamily: "inherit", fontWeight: 800, fontSize: 12,
                  }}>{lang === "ar" ? "عرض الميزان" : "View Balance"}</button>
                  <button disabled title={lang === "ar" ? "قريباً" : "Coming soon"} style={{
                    width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB", cursor: "not-allowed",
                    background: "#F9FAFB", color: "#9CA3AF", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <Lock size={12} />
                    {lang === "ar" ? "تشغيل الشركة · قريباً" : "Open ledger · Soon"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: 48, color: "#9CA3AF", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center" }}>
          <ArrowLeftRight size={12} />
          {lang === "ar" ? "مدعوم بـ " : "Powered by "}
          <span style={{ color: accent, fontWeight: 700 }}>أموالي</span>
        </div>
      </div>
    </div>
  );
}