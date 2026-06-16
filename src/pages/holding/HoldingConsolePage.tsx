import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LayoutGrid,
  Building2,
  Scale,
  FileText,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  Download,
  Search,
  Stethoscope,
  Ship,
  GraduationCap,
} from "lucide-react";

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
  dental: "زرعات أسنان",
  import_medical: "عطاءات · استيراد",
  training: "تعليم وتدريب",
};

// Sector → (icon, pill colors). Falls back to a neutral grey pill.
const SECTOR_VISUAL: Record<string, { icon: any; bg: string; fg: string; iconBg: string }> = {
  medical_dental: { icon: Stethoscope, bg: "#F3E8FF", fg: "#6B21A8", iconBg: "#FBEAF1" },
  dental: { icon: Stethoscope, bg: "#F3E8FF", fg: "#6B21A8", iconBg: "#FBEAF1" },
  medical_tender: { icon: Ship, bg: "#DCFCE7", fg: "#166534", iconBg: "#FBEAF1" },
  import_medical: { icon: Ship, bg: "#DCFCE7", fg: "#166534", iconBg: "#FBEAF1" },
  education: { icon: GraduationCap, bg: "#FEF3C7", fg: "#92400E", iconBg: "#FBEAF1" },
  training: { icon: GraduationCap, bg: "#FEF3C7", fg: "#92400E", iconBg: "#FBEAF1" },
};

// Currency hint by sector — until we add a real currency column to holding_companies.
const SECTOR_CURRENCY: Record<string, { code: string; symbol: string }> = {
  medical_tender: { code: "JPY", symbol: "¥" },
  import_medical: { code: "JPY", symbol: "¥" },
};

const ACCENT = "#9E2B43";
const ACCENT2 = "#B23A55";
const GRADIENT = `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`;

type Lang = "ar" | "en";
type NavKey = "dashboard" | "subsidiaries" | "trial_balance" | "reports" | "settings";

const T = {
  ar: {
    holding: "القابضة",
    group: "مجموعة",
    nav: {
      dashboard: "لوحة التحكم",
      subsidiaries: "الشركات الفرعية",
      trial_balance: "الميزان الموحّد",
      reports: "التقارير",
      settings: "الإعدادات",
    },
    signOut: "تسجيل الخروج",
    fyLabel: "السنة المالية",
    pageTitle: "الشركات الفرعية",
    eyebrow: "§ 01 · سجلّ المجموعة",
    bigTitle: "شجرة الشركات",
    linkCompany: "ربط شركة",
    consolidatedTB: "الميزان الموحّد",
    exportExcel: "تصدير Excel",
    kpis: {
      companies: "الشركات",
      revenue: "الإيرادات الموحّدة",
      expense: "المصروفات",
      net: "صافي النتيجة",
    },
    kpiSubs: {
      allActive: "كلها نشطة",
      currentFY: "السنة المالية الحالية",
      beforeElim: "قبل الاستبعادات البينية",
    },
    cols: { icon: "الأيقونة", company: "الشركة", sector: "القطاع", currency: "العملة", status: "الحالة", actions: "الإجراءات" },
    statusActive: "نشط",
    details: "تفاصيل",
    viewTB: "عرض الميزان",
    searchPlaceholder: "ابحث باسم الشركة...",
    allSectors: "كل القطاعات",
    from: "من",
    to: "إلى",
    empty: "لا توجد شركات مرتبطة بعد",
    loading: "جارٍ التحميل...",
    deny: "لا تملك صلاحية",
    denySub: "هذه الطبقة مخصّصة لأعضاء القابضة فقط.",
    backLogin: "العودة لتسجيل الدخول",
    tbHeading: "ميزان المراجعة الموحّد",
    tbSub: "عرض للقراءة فقط · بعملة العرض (ILS)",
    code: "الكود",
    accountName: "اسم الحساب",
    debit: "مدين",
    credit: "دائن",
    balance: "الرصيد",
    noRows: "لا توجد حركات في الفترة المحدّدة",
    loadingRows: "جارٍ تحميل البيانات...",
    balanced: "متوازن",
    notBalanced: "غير متوازن",
  },
  en: {
    holding: "Holding",
    group: "Group",
    nav: {
      dashboard: "Dashboard",
      subsidiaries: "Subsidiaries",
      trial_balance: "Consolidated TB",
      reports: "Reports",
      settings: "Settings",
    },
    signOut: "Sign out",
    fyLabel: "Fiscal year",
    pageTitle: "Subsidiaries",
    eyebrow: "§ 01 · Group registry",
    bigTitle: "Company tree",
    linkCompany: "Link company",
    consolidatedTB: "Consolidated TB",
    exportExcel: "Export Excel",
    kpis: { companies: "Companies", revenue: "Consolidated revenue", expense: "Expenses", net: "Net result" },
    kpiSubs: { allActive: "All active", currentFY: "Current FY", beforeElim: "Before intercompany elims" },
    cols: { icon: "Icon", company: "Company", sector: "Sector", currency: "Currency", status: "Status", actions: "Actions" },
    statusActive: "Active",
    details: "Details",
    viewTB: "View balance",
    searchPlaceholder: "Search by company name...",
    allSectors: "All sectors",
    from: "From",
    to: "To",
    empty: "No subsidiaries linked yet",
    loading: "Loading...",
    deny: "Access denied",
    denySub: "This layer is reserved for holding members only.",
    backLogin: "Back to sign in",
    tbHeading: "Consolidated Trial Balance",
    tbSub: "Read-only · presentation currency (ILS)",
    code: "Code",
    accountName: "Account",
    debit: "Debit",
    credit: "Credit",
    balance: "Balance",
    noRows: "No transactions in the selected period",
    loadingRows: "Loading data...",
    balanced: "Balanced",
    notBalanced: "Out of balance",
  },
} as const;

function SpartaShield({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 140" width={size} height={(size * 140) / 120} aria-hidden>
      <defs>
        <linearGradient id="hcg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ACCENT} />
          <stop offset="100%" stopColor={ACCENT2} />
        </linearGradient>
      </defs>
      <path d="M60 4 L112 22 L112 70 C112 102 88 126 60 136 C32 126 8 102 8 70 L8 22 Z" fill="url(#hcg)" />
      <text x="60" y="92" textAnchor="middle" fontFamily="'Cormorant Garamond', 'Times New Roman', serif" fontWeight={700} fontSize="78" fill="#FFFFFF">Λ</text>
    </svg>
  );
}

function fmt(n: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n || 0));
}
function fmt0(n: number) { return fmt(n, 0); }

function currentFY(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function HoldingConsolePage() {
  const { id: holdingId = "" } = useParams();
  const navigate = useNavigate();
  const location = (typeof window !== "undefined") ? window.location : ({ search: "" } as any);
  const initialCompany = new URLSearchParams(location.search).get("company");

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [holdingName, setHoldingName] = useState<string>("");
  const [holdingSlug, setHoldingSlug] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subsidiary[]>([]);
  const [selected, setSelected] = useState<string | null>(initialCompany); // null = root (consolidated)
  const [nav, setNav] = useState<NavKey>("subsidiaries");
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("holding-lang") as Lang) || "ar");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const fy = useMemo(currentFY, []);
  const [fromDate, setFromDate] = useState(fy.from);
  const [toDate, setToDate] = useState(fy.to);
  const [rows, setRows] = useState<TBRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const t = T[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => { localStorage.setItem("holding-lang", lang); }, [lang]);

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
        supabase.from("holdings").select("name_ar, slug, logo_url").eq("id", holdingId).maybeSingle(),
        supabase
          .from("holding_companies")
          .select("owner_id, display_name_ar, sector, sort_order")
          .eq("holding_id", holdingId)
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (h) {
        setHoldingName(h.name_ar);
        setHoldingSlug((h as any).slug || "");
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

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (sectorFilter && s.sector !== sectorFilter) return false;
      if (q && !s.display_name_ar.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subs, search, sectorFilter]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    subs.forEach((s) => { if (s.sector) set.add(s.sector); });
    return Array.from(set);
  }, [subs]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate(`/g/${holdingSlug || holdingId}`);
  };

  const provisionSubs = async () => {
    if (provisioning) return;
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-sparta-subs", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("تم إنشاء الفروع الثلاثة وربطها ✓");
      const { data: list } = await supabase
        .from("holding_companies")
        .select("owner_id, display_name_ar, sector, sort_order")
        .eq("holding_id", holdingId).eq("is_active", true).order("sort_order");
      setSubs((list as Subsidiary[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "فشل الإنشاء");
    } finally {
      setProvisioning(false);
    }
  };

  if (checking) {
    return (
      <div style={{ direction: dir, fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#FFFFFF", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {t.loading}
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ direction: dir, fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#FFFFFF", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{t.deny}</h1>
          <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 16 }}>{t.denySub}</p>
          <button onClick={() => navigate("/auth")} style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: GRADIENT, color: "#FFFFFF", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
            {t.backLogin}
          </button>
        </div>
      </div>
    );
  }

  // --- Sidebar nav config ---
  const NAV_ITEMS: { key: NavKey; label: string; Icon: any }[] = [
    { key: "dashboard", label: t.nav.dashboard, Icon: LayoutGrid },
    { key: "subsidiaries", label: t.nav.subsidiaries, Icon: Building2 },
    { key: "trial_balance", label: t.nav.trial_balance, Icon: Scale },
    { key: "reports", label: t.nav.reports, Icon: FileText },
    { key: "settings", label: t.nav.settings, Icon: SettingsIcon },
  ];

  const headerLabelByNav: Record<NavKey, string> = {
    dashboard: t.nav.dashboard,
    subsidiaries: t.pageTitle,
    trial_balance: t.nav.trial_balance,
    reports: t.nav.reports,
    settings: t.nav.settings,
  };

  // ===== Layout =====
  return (
    <div className="holding-console" style={{ direction: dir, fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#FFFFFF", color: "#0F172A" }}>
      <style>{`
        .holding-console thead,
        .holding-console thead tr,
        .holding-console thead th {
          background: #F5F1F3 !important;
          color: #867C88 !important;
          border-color: #EEE3E8 !important;
        }
        .holding-console thead th { font-weight: 700 !important; }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100dvh" }}>
        {/* Main area */}
        <main style={{ padding: "28px 36px 48px", order: 2 }}>
          {/* Top bar: page title + lang switcher */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#0F172A" }}>{headerLabelByNav[nav]}</h1>
            <div style={{ display: "inline-flex", padding: 3, borderRadius: 999, backgroundColor: "#F3F4F6", border: "1px solid #E5E7EB" }}>
              {(["en", "ar"] as Lang[]).map((l) => {
                const active = lang === l;
                return (
                  <button key={l} onClick={() => setLang(l)} style={{ padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: active ? GRADIENT : "transparent", color: active ? "#FFFFFF" : "#6B7280", fontFamily: "'Inter', sans-serif", letterSpacing: 0.5 }}>
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {nav === "subsidiaries" && (
            <>
              {/* Eyebrow + big title + actions */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
                <div>
                  <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>{t.eyebrow}</div>
                  <h2 style={{ fontSize: 40, fontWeight: 900, margin: 0, color: "#0F172A", lineHeight: 1 }}>{t.bigTitle}</h2>
                  <div style={{ width: 96, height: 4, borderRadius: 2, background: GRADIENT, marginTop: 12 }} />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button style={btnGhost()}><Download size={14} />{t.exportExcel}</button>
                  <button onClick={() => setNav("trial_balance")} style={btnGhost()}><Scale size={14} />{t.consolidatedTB}</button>
                  <button onClick={provisionSubs} disabled={provisioning} style={btnPrimary()}>
                    <Plus size={14} />
                    {subs.length === 0 ? (provisioning ? "جارٍ الإنشاء..." : "إنشاء فروع سبارتا (3)") : t.linkCompany}
                  </button>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
                <KpiCard label={t.kpis.companies} value={fmt0(subs.length)} sub={t.kpiSubs.allActive} valueColor="#0F172A" />
                <KpiCard label={t.kpis.revenue} value={`${fmt0(kpi.revenue)} ₪`} sub={t.kpiSubs.currentFY} valueColor={ACCENT} />
                <KpiCard label={t.kpis.expense} value={`${fmt0(kpi.expense)} ₪`} sub={t.kpiSubs.currentFY} valueColor={ACCENT} />
                <KpiCard label={t.kpis.net} value={`${fmt0(kpi.net)} ₪`} sub={t.kpiSubs.beforeElim} valueColor={ACCENT} />
              </div>

              {/* Filters */}
              <div style={{ display: "grid", gridTemplateColumns: "180px 180px 200px 1fr", gap: 12, marginBottom: 16 }}>
                <DateInput value={fromDate} onChange={setFromDate} prefix={t.from} />
                <DateInput value={toDate} onChange={setToDate} prefix={t.to} />
                <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} style={selectStyle()}>
                  <option value="">{t.allSectors}</option>
                  {sectorOptions.map((s) => (<option key={s} value={s}>{SECTOR_LABEL[s] || s}</option>))}
                </select>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [dir === "rtl" ? "right" : "left"]: 14, color: "#9CA3AF" } as React.CSSProperties} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} style={{ ...selectStyle(), [dir === "rtl" ? "paddingRight" : "paddingLeft"]: 38 } as React.CSSProperties} />
                </div>
              </div>

              {/* Companies table — div-grid (independent from shared <table>) */}
              <div className="holding-table" style={{ backgroundColor: "#FFFFFF", border: "1px solid #EEF0F3", borderRadius: 16, overflow: "hidden" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1.6fr 1.1fr 0.9fr 0.9fr 1fr",
                  gap: 14,
                  background: "#F5F1F3",
                  color: "#867C88",
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  padding: "14px 18px",
                  borderBottom: "1px solid #EEE3E8",
                }}>
                  <span>{t.cols.icon}</span>
                  <span>{t.cols.company}</span>
                  <span>{t.cols.sector}</span>
                  <span>{t.cols.currency}</span>
                  <span>{t.cols.status}</span>
                  <span>{t.cols.actions}</span>
                </div>
                {filteredSubs.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>{t.empty}</div>
                ) : filteredSubs.map((s) => {
                  const sv = (s.sector && SECTOR_VISUAL[s.sector]) || { icon: Building2, bg: "#F3F4F6", fg: "#374151", iconBg: "#FBEAF1" };
                  const SIcon = sv.icon;
                  const cur = (s.sector && SECTOR_CURRENCY[s.sector]) || { code: "ILS", symbol: "₪" };
                  return (
                    <div key={s.owner_id} style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1.6fr 1.1fr 0.9fr 0.9fr 1fr",
                      gap: 14,
                      alignItems: "center",
                      padding: "14px 18px",
                      borderBottom: "1px solid #F1F2F4",
                      fontSize: 13,
                    }}>
                      <div>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: sv.iconBg, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <SIcon size={20} />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#0F172A" }}>{s.display_name_ar}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, fontFamily: "'Inter', sans-serif", letterSpacing: 0.5 }}>
                          SPARTA-{(s.sector || "CO").slice(0, 4).toUpperCase()} · {String(s.sort_order || 0).padStart(4, "0")}
                        </div>
                      </div>
                      <div><Pill bg={sv.bg} fg={sv.fg}>{(s.sector && SECTOR_LABEL[s.sector]) || s.sector || "—"}</Pill></div>
                      <div><span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: "#374151" }}>{cur.code} {cur.symbol}</span></div>
                      <div><Pill bg="#FBEAF1" fg={ACCENT}>{t.statusActive}</Pill></div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <button onClick={() => { setSelected(s.owner_id); setNav("trial_balance"); }} style={linkBtn()}>{t.viewTB}</button>
                        <button style={linkBtn()}>{t.details}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {nav === "trial_balance" && (
            <TrialBalanceView
              t={t}
              dir={dir}
              accent={ACCENT}
              gradient={GRADIENT}
              selectedSub={selectedSub}
              subs={subs}
              selected={selected}
              setSelected={setSelected}
              fromDate={fromDate} setFromDate={setFromDate}
              toDate={toDate} setToDate={setToDate}
              rows={rows} loadingRows={loadingRows}
              kpi={kpi}
            />
          )}

          {(nav === "dashboard" || nav === "reports" || nav === "settings") && (
            <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", border: "1px dashed #E5E7EB", borderRadius: 16 }}>
              {headerLabelByNav[nav]} — قريباً
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside style={{
          order: 1,
          backgroundColor: "#FFFFFF",
          borderInlineStart: dir === "rtl" ? "1px solid #EEF0F3" : undefined,
          borderInlineEnd: dir === "ltr" ? "1px solid #EEF0F3" : undefined,
          padding: "24px 20px",
          display: "flex", flexDirection: "column",
          position: "sticky", top: 0, height: "100dvh",
        }}>
          {/* Logo card */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16 }}>
            <div style={{ width: 44, height: 50, position: "relative" }}>
              {logoUrl ? <img src={logoUrl} alt="" style={{ height: 50, objectFit: "contain" }} /> : <SpartaShield size={44} />}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>{holdingName || "سبارتا"}</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>{t.holding} · {t.group}</div>
            </div>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: GRADIENT, marginBottom: 20 }} />

          {/* Nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {holdingSlug && (
              <button
                onClick={() => navigate(`/g/${holdingSlug}/select`)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  color: ACCENT, background: "#FBEDF0", border: "1px solid #F6E5E9",
                  padding: "10px 14px", borderRadius: 12, marginBottom: 10,
                  textAlign: dir === "rtl" ? "right" : "left",
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7" />
                </svg>
                {lang === "ar" ? "تبديل مساحة العمل" : "Switch workspace"}
              </button>
            )}
            {NAV_ITEMS.map((it) => {
              const active = nav === it.key;
              const Icon = it.Icon;
              return (
                <button key={it.key} onClick={() => setNav(it.key)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 999,
                  border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: active ? 800 : 600,
                  textAlign: dir === "rtl" ? "right" : "left",
                  background: active ? GRADIENT : "transparent",
                  color: active ? "#FFFFFF" : "#374151",
                  boxShadow: active ? `0 10px 20px -10px ${ACCENT}66` : "none",
                }}>
                  <Icon size={18} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sign out + FY */}
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 3, borderRadius: 2, background: GRADIENT, marginBottom: 16, opacity: 0.5 }} />
            <button onClick={signOut} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "12px 16px", borderRadius: 999, border: "none", cursor: "pointer",
              background: GRADIENT, color: "#FFFFFF", fontFamily: "inherit", fontWeight: 800, fontSize: 14,
              boxShadow: `0 12px 24px -12px ${ACCENT}99`,
            }}>
              <LogOut size={16} />
              {t.signOut}
            </button>
            <div style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center", marginTop: 14, fontFamily: "'Inter', sans-serif", letterSpacing: 2 }}>
              {t.fyLabel.toUpperCase()} · {new Date().getFullYear()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ===== Style helpers (kept inline to match existing style-prop pattern) =====
function btnGhost(): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#0F172A", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" };
}
function btnPrimary(): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: "none", background: GRADIENT, color: "#FFFFFF", fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `0 12px 24px -12px ${ACCENT}99` };
}
function selectStyle(): React.CSSProperties {
  return { width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#0F172A", fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" };
}
function linkBtn(): React.CSSProperties {
  return { background: "transparent", border: "none", padding: 0, color: ACCENT, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" };
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "12px 16px", textAlign: "inherit", fontWeight: 700, color: "#867C88", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, background: "#F5F1F3", borderBottom: "1px solid #EEE3E8" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>{children}</td>;
}
function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 700 }}>{children}</span>;
}
function DateInput({ value, onChange, prefix }: { value: string; onChange: (v: string) => void; prefix: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 14px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#FFFFFF", minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#4B4550", flexShrink: 0 }}>{prefix}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", outline: "none", fontSize: 13, color: "#0F172A", direction: "ltr", minWidth: 0, width: "100%" } as React.CSSProperties} />
    </label>
  );
}
function KpiCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div style={{ backgroundColor: "#FFFFFF", border: "1px solid #EEF0F3", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color: valueColor, fontFamily: "'Inter', sans-serif", letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>{sub}</div>
    </div>
  );
}

// ===== Trial Balance subview (white/burgundy retheme of the original TB UI) =====
function TrialBalanceView(props: any) {
  const { t, dir, accent, gradient, selectedSub, subs, selected, setSelected, fromDate, setFromDate, toDate, setToDate, rows, loadingRows, kpi } = props;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #EEF0F3", borderRadius: 16, padding: 14 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, fontWeight: 700 }}>شجرة الشركات</div>
        <button onClick={() => setSelected(null)} style={{
          width: "100%", textAlign: dir === "rtl" ? "right" : "left", padding: "10px 12px", borderRadius: 12,
          border: "1px solid " + (selected === null ? accent : "#E5E7EB"),
          background: selected === null ? "#FBEAF1" : "#FFFFFF", color: "#0F172A", fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8,
        }}>موحّد</button>
        {subs.map((s: Subsidiary) => (
          <button key={s.owner_id} onClick={() => setSelected(s.owner_id)} style={{
            width: "100%", textAlign: dir === "rtl" ? "right" : "left", padding: "10px 12px", borderRadius: 12,
            border: "1px solid " + (selected === s.owner_id ? accent : "#E5E7EB"),
            background: selected === s.owner_id ? "#FBEAF1" : "#FFFFFF", color: "#0F172A", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", marginBottom: 6,
          }}>{s.display_name_ar}</button>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 6 }}>§ 02 · TRIAL BALANCE</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{selectedSub ? selectedSub.display_name_ar : t.tbHeading}</h2>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{t.tbSub}</div>
            <div style={{ width: 64, height: 3, borderRadius: 2, background: gradient, marginTop: 10 }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <DateInput value={fromDate} onChange={setFromDate} prefix={t.from} />
            <DateInput value={toDate} onChange={setToDate} prefix={t.to} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <KpiCard label={t.kpis.revenue} value={fmt(kpi.revenue)} sub="—" valueColor={accent} />
          <KpiCard label={t.kpis.expense} value={fmt(kpi.expense)} sub="—" valueColor={accent} />
          <KpiCard label={t.kpis.net} value={fmt(kpi.net)} sub="—" valueColor={kpi.net >= 0 ? accent : "#EF4444"} />
          <div style={{ background: kpi.balanced ? "#ECFDF5" : "#FEF2F2", border: "1px solid " + (kpi.balanced ? "#A7F3D0" : "#FECACA"), borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: kpi.balanced ? "#065F46" : "#991B1B", marginBottom: 8 }}>توازن مدين = دائن</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: kpi.balanced ? "#10B981" : "#EF4444" }}>{kpi.balanced ? "✓ " + t.balanced : "⚠ " + t.notBalanced}</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", border: "1px solid #EEF0F3", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FAFAFB", borderBottom: "1px solid #EEF0F3" }}>
                <Th>{t.code}</Th><Th>{t.accountName}</Th><Th>{t.debit}</Th><Th>{t.credit}</Th><Th>{t.balance}</Th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>{t.loadingRows}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>{t.noRows}</td></tr>
              ) : rows.map((r: TBRow) => (
                <tr key={r.account_code} style={{ borderBottom: "1px solid #F1F2F4" }}>
                  <Td><span style={{ fontFamily: "'Inter', sans-serif" }}>{r.account_code}</span></Td>
                  <Td>{r.account_name}</Td>
                  <Td><span style={{ color: "#10B981", fontFamily: "'Inter', sans-serif" }}>{fmt(r.total_debit)}</span></Td>
                  <Td><span style={{ color: "#EF4444", fontFamily: "'Inter', sans-serif" }}>{fmt(r.total_credit)}</span></Td>
                  <Td><span style={{ fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>{fmt(r.balance)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}