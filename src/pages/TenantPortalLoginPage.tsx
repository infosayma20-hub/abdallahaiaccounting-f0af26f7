import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

interface Branding { slug: string; display_name: string; logo_url: string | null; primary_color: string }

export default function TenantPortalLoginPage({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [b, setB] = useState<Branding | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_tenant_portal_branding", { p_slug: slug });
      const row = Array.isArray(data) ? data[0] : null;
      setB((row as Branding) || null);
      if (row) document.title = `${(row as Branding).display_name} — تسجيل الدخول`;
      setLoading(false);
    })();
  }, [slug]);

  const accent = b?.primary_color || "#0D1B2E";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); toast.error("بيانات الدخول غير صحيحة"); return; }
    const { data: ok } = await supabase.rpc("check_tenant_portal_access", { p_slug: slug });
    if (ok !== true) {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error("هذا الحساب غير تابع لهذه الشركة");
      return;
    }
    window.location.replace("/");
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) { toast.error("تعذر إرسال الرابط"); return; }
    toast.success("تم إرسال رابط إعادة التعيين إلى بريدك");
    setReset(false);
  };

  const shell: React.CSSProperties = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#F5F7FA", fontFamily: "Tajawal, Cairo, sans-serif", color: "#0F172A" };
  if (loading) return <div dir="rtl" style={shell}>جارٍ التحميل...</div>;
  if (!b) return (
    <div dir="rtl" style={{ ...shell, textAlign: "center" }}>
      <div><h1 style={{ fontSize: 22, fontWeight: 800 }}>هذه الصفحة غير متاحة</h1><p style={{ opacity: .7 }}>تأكد من الرابط أو راجع مسؤول النظام.</p></div>
    </div>
  );

  const input: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 14, direction: "ltr", textAlign: "left", boxSizing: "border-box", outline: "none", background: "#fff" };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginBottom: 6, display: "block" };
  const btn: React.CSSProperties = { width: "100%", padding: "13px", borderRadius: 10, border: "none", background: accent, color: "#fff", fontWeight: 800, fontSize: 15, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" };

  return (
    <div dir="rtl" style={shell}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {b.logo_url
            ? <img src={b.logo_url} alt={b.display_name} style={{ height: 96, maxWidth: 240, objectFit: "contain", margin: "0 auto 12px", display: "block" }} />
            : <div style={{ width: 72, height: 72, borderRadius: 18, background: accent, color: "#fff", fontSize: 32, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>{b.display_name.charAt(0)}</div>}
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{b.display_name}</h1>
          <div style={{ width: 56, height: 3, borderRadius: 2, background: accent, margin: "12px auto 0" }} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #E9EDF2", borderRadius: 16, padding: 24, boxShadow: "0 20px 40px -24px rgba(15,23,42,.2)" }}>
          {!reset ? (
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>تسجيل الدخول</h2>
              <div><label style={label}>البريد الإلكتروني</label><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={input} /></div>
              <div>
                <label style={label}>كلمة المرور</label>
                <div style={{ position: "relative" }}>
                  <input type={show ? "text" : "password"} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...input, paddingRight: 42 }} />
                  <button type="button" onClick={() => setShow(s => !s)} aria-label="إظهار كلمة المرور" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748B", cursor: "pointer", padding: 6, display: "flex" }}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => setReset(true)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: accent, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}>نسيت كلمة المرور؟</button>
              <button type="submit" disabled={busy} style={btn}>{busy ? "جارٍ الدخول..." : "دخول"}</button>
            </form>
          ) : (
            <form onSubmit={onReset} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>إعادة تعيين كلمة المرور</h2>
              <div><label style={label}>البريد الإلكتروني</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={input} /></div>
              <button type="submit" disabled={busy} style={btn}>{busy ? "جارٍ الإرسال..." : "إرسال الرابط"}</button>
              <button type="button" onClick={() => setReset(false)} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontFamily: "inherit" }}>رجوع</button>
            </form>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "#94A3B8" }}>مدعوم بـ يونيفاي</div>
      </div>
    </div>
  );
}
