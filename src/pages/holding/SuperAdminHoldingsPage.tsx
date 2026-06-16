import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Holding {
  id: string;
  slug: string;
  name_ar: string;
  is_active: boolean;
}
interface CompanyRow { owner_id: string; company_id: string | null; name: string; tax_number: string | null }
interface LinkRow { id: string; owner_id: string; display_name_ar: string; sector: string | null; sort_order: number }

const SECTORS = [
  { value: "medical_dental", label: "طب أسنان" },
  { value: "medical_tender", label: "مستلزمات طبية" },
  { value: "education", label: "تعليم" },
  { value: "other", label: "أخرى" },
];

export default function SuperAdminHoldingsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);

  // Create form
  const [slug, setSlug] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bgUrl, setBgUrl] = useState("");
  const [primary, setPrimary] = useState("#0D1B2E");

  // Link form
  const [linkOwner, setLinkOwner] = useState("");
  const [linkDisplay, setLinkDisplay] = useState("");
  const [linkSector, setLinkSector] = useState("other");
  const [linkSort, setLinkSort] = useState(0);

  // Member form
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"holding_admin" | "holding_viewer">("holding_viewer");

  // Gate via admin_list_companies (super_admin only)
  useEffect(() => {
    (async () => {
      const { error } = await supabase.rpc("admin_list_companies");
      setAllowed(!error);
    })();
  }, []);

  const loadHoldings = async () => {
    const { data } = await supabase.from("holdings").select("id, slug, name_ar, is_active").order("created_at", { ascending: false });
    setHoldings((data as Holding[]) || []);
  };

  const loadCompanies = async () => {
    const { data } = await supabase.rpc("admin_list_companies");
    setCompanies((data as CompanyRow[]) || []);
  };

  const loadLinks = async (hid: string) => {
    const { data } = await supabase
      .from("holding_companies")
      .select("id, owner_id, display_name_ar, sector, sort_order")
      .eq("holding_id", hid)
      .order("sort_order");
    setLinks((data as LinkRow[]) || []);
  };

  useEffect(() => {
    if (allowed) {
      loadHoldings();
      loadCompanies();
    }
  }, [allowed]);

  useEffect(() => {
    if (selectedId) loadLinks(selectedId);
    else setLinks([]);
  }, [selectedId]);

  const createHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !nameAr) { toast.error("الـ slug والاسم العربي مطلوبان"); return; }
    const { data, error } = await supabase
      .from("holdings")
      .insert({
        slug: slug.trim(),
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || null,
        logo_url: logoUrl.trim() || null,
        login_background_url: bgUrl.trim() || null,
        primary_color: primary || "#0D1B2E",
        secondary_color: "#FFFFFF",
        presentation_currency: "ILS",
      })
      .select("id, slug")
      .single();
    if (error) { toast.error(error.message); return; }
    toast.success(`تم إنشاء القابضة: ${data.slug}`);
    setSlug(""); setNameAr(""); setNameEn(""); setLogoUrl(""); setBgUrl(""); setPrimary("#0D1B2E");
    await loadHoldings();
    setSelectedId(data.id);
  };

  const linkCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !linkOwner || !linkDisplay) { toast.error("اختر القابضة والشركة وادخل اسم العرض"); return; }
    const picked = companies.find((c) => c.owner_id === linkOwner);
    const { error } = await supabase.from("holding_companies").insert({
      holding_id: selectedId,
      owner_id: linkOwner,
      company_id: picked?.company_id || null,
      display_name_ar: linkDisplay.trim(),
      sector: linkSector,
      sort_order: linkSort,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم ربط الشركة بالقابضة");
    setLinkOwner(""); setLinkDisplay(""); setLinkSort(0);
    await loadLinks(selectedId);
  };

  const removeLink = async (id: string) => {
    if (!confirm("إزالة هذا الربط؟ (لا تُحذف بيانات الشركة)")) return;
    const { error } = await supabase.from("holding_companies").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (selectedId) await loadLinks(selectedId);
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !memberEmail) return;
    const { error } = await supabase.rpc("add_holding_member_by_email", {
      p_holding_id: selectedId,
      p_email: memberEmail.trim(),
      p_role: memberRole,
    });
    if (error) {
      if (error.message.includes("USER_NOT_FOUND")) toast.error("لا يوجد حساب بهذا الإيميل — على المستخدم التسجيل أولاً");
      else toast.error(error.message);
      return;
    }
    toast.success("تم إضافة العضو");
    setMemberEmail("");
  };

  if (allowed === null) {
    return <div style={{ padding: 24, fontFamily: "'Cairo', sans-serif", direction: "rtl" }}>جارٍ التحقق...</div>;
  }
  if (!allowed) {
    return (
      <div style={{ padding: 24, fontFamily: "'Cairo', sans-serif", direction: "rtl", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>مخصّصة للسوبر أدمن</h1>
      </div>
    );
  }

  const selectedHolding = holdings.find((h) => h.id === selectedId);

  return (
    <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF", padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>إدارة القابضات</h1>
      <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 20 }}>إنشاء قابضة · ربط دفاتر الشركات · إضافة أعضاء</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 20 }}>
        {/* Holdings list */}
        <aside style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>القابضات الموجودة</div>
          {holdings.length === 0 && <div style={{ fontSize: 12, opacity: 0.5, padding: 8 }}>لا توجد قابضات بعد</div>}
          {holdings.map((h) => (
            <button key={h.id} onClick={() => setSelectedId(h.id)}
              style={{
                width: "100%", textAlign: "right", padding: "8px 10px", borderRadius: 8, marginBottom: 6,
                border: selectedId === h.id ? "1px solid #FFFFFF" : "1px solid rgba(255,255,255,0.1)",
                backgroundColor: selectedId === h.id ? "rgba(255,255,255,0.08)" : "transparent",
                color: "#FFFFFF", fontFamily: "inherit", cursor: "pointer",
              }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{h.name_ar}</div>
              <div style={{ fontSize: 10, opacity: 0.6, direction: "ltr", textAlign: "right" }}>/g/{h.slug}</div>
            </button>
          ))}
        </aside>

        <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* A) Create holding */}
          <section style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>إنشاء قابضة جديدة</h2>
            <form onSubmit={createHolding} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <Field label="Slug (للدخول)" value={slug} onChange={setSlug} placeholder="abc-group" ltr required />
              <Field label="الاسم بالعربية" value={nameAr} onChange={setNameAr} required />
              <Field label="الاسم بالإنجليزية" value={nameEn} onChange={setNameEn} ltr />
              <Field label="رابط الشعار" value={logoUrl} onChange={setLogoUrl} ltr />
              <Field label="رابط خلفية الدخول" value={bgUrl} onChange={setBgUrl} ltr />
              <Field label="اللون الأساسي" value={primary} onChange={setPrimary} ltr />
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" style={btnPrimary}>إنشاء</button>
              </div>
            </form>
          </section>

          {/* B) Link subsidiaries */}
          <section style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16, opacity: selectedHolding ? 1 : 0.5 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>ربط الشركات الفرعية</h2>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
              {selectedHolding ? `القابضة المختارة: ${selectedHolding.name_ar}` : "اختر قابضة من القائمة"}
            </div>

            {selectedHolding && (
              <>
                <form onSubmit={linkCompany} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <label style={lbl}>
                    الشركة (الدفتر)
                    <select value={linkOwner} onChange={(e) => setLinkOwner(e.target.value)} style={inp} required>
                      <option value="">— اختر —</option>
                      {companies.map((c) => (
                        <option key={c.owner_id} value={c.owner_id}>{c.name}{c.tax_number ? ` · ${c.tax_number}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  <Field label="اسم العرض" value={linkDisplay} onChange={setLinkDisplay} required />
                  <label style={lbl}>
                    القطاع
                    <select value={linkSector} onChange={(e) => setLinkSector(e.target.value)} style={inp}>
                      {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <Field label="الترتيب" value={String(linkSort)} onChange={(v) => setLinkSort(Number(v) || 0)} ltr />
                  <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" style={btnPrimary}>ربط</button>
                  </div>
                </form>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>المرتبطة حالياً ({links.length})</div>
                  {links.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.5, padding: 8 }}>لم تُربط شركات بعد</div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {links.map((l) => (
                        <li key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                          <span><strong>{l.display_name_ar}</strong> <span style={{ opacity: 0.5, fontSize: 11 }}>· {l.sector || "—"}</span></span>
                          <button onClick={() => removeLink(l.id)} style={btnDanger}>إزالة</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>

          {/* C) Add member */}
          <section style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16, opacity: selectedHolding ? 1 : 0.5 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>إضافة عضو بالإيميل</h2>
            {selectedHolding && (
              <form onSubmit={addMember} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, alignItems: "end" }}>
                <Field label="البريد الإلكتروني" value={memberEmail} onChange={setMemberEmail} ltr required />
                <label style={lbl}>
                  الصلاحية
                  <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as any)} style={inp}>
                    <option value="holding_viewer">قراءة فقط</option>
                    <option value="holding_admin">مدير قابضة</option>
                  </select>
                </label>
                <button type="submit" style={btnPrimary}>إضافة</button>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, display: "flex", flexDirection: "column", gap: 4, color: "#FFFFFF" };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(0,0,0,0.25)", color: "#FFFFFF", fontFamily: "inherit" };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "1px solid #FFFFFF", backgroundColor: "#FFFFFF", color: "#0D1B2E", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "1px solid #EF4444", backgroundColor: "transparent", color: "#EF4444", fontFamily: "inherit", cursor: "pointer", fontSize: 11 };

function Field({ label, value, onChange, placeholder, ltr, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; required?: boolean }) {
  return (
    <label style={lbl}>
      {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
        style={{ ...inp, direction: ltr ? "ltr" : "rtl", textAlign: ltr ? "left" : "right" }} />
    </label>
  );
}