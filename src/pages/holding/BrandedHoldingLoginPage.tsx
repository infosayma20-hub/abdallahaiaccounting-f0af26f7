import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Branding {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  logo_url: string | null;
  login_background_url: string | null;
  primary_color: string;
  secondary_color: string;
}

export default function BrandedHoldingLoginPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [holding, setHolding] = useState<Branding | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_holding_branding_by_slug", { p_slug: slug });
      if (!error && data && data.length > 0) setHolding(data[0] as Branding);
      setLoading(false);
    })();
  }, [slug]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding) return;
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      toast.error("بيانات الدخول غير صحيحة");
      return;
    }
    navigate(`/holding/${holding.id}`);
  };

  const primary = holding?.primary_color || "#0D1B2E";
  const bgStyle: React.CSSProperties = holding?.login_background_url
    ? { backgroundImage: `url(${holding.login_background_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundColor: primary };

  if (loading) {
    return (
      <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        جارٍ التحميل...
      </div>
    );
  }

  if (!holding) {
    return (
      <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", backgroundColor: "#0D1B2E", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>هذه الصفحة غير متاحة</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>تأكّد من الرابط أو راجع مسؤول النظام.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", ...bgStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", color: "#0D1B2E", borderRadius: 16, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          {holding.logo_url ? (
            <img src={holding.logo_url} alt={holding.name_ar} style={{ height: 72, objectFit: "contain", marginBottom: 12 }} />
          ) : null}
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: primary }}>{holding.name_ar}</h1>
          {holding.name_en && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{holding.name_en}</div>}
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            البريد الإلكتروني
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: "1px solid #D5DBE3", direction: "ltr", textAlign: "left", fontFamily: "inherit" }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            كلمة المرور
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: "1px solid #D5DBE3", direction: "ltr", textAlign: "left", fontFamily: "inherit" }}
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            style={{ marginTop: 8, padding: "12px 16px", borderRadius: 10, border: "none", backgroundColor: primary, color: "#FFFFFF", fontWeight: 700, fontSize: 15, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit" }}
          >
            {submitting ? "جارٍ الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>مدعوم بـ أموالي</div>
    </div>
  );
}