import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

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

type Lang = "ar" | "en";

const T = {
  ar: {
    tagline: "هوية واحدة. سجلّ واحد. مجموعة واحدة.",
    signIn: "تسجيل الدخول",
    welcome: "أهلًا بعودتك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    remember: "تذكّرني",
    forgot: "نسيت كلمة المرور؟",
    submit: "تسجيل الدخول",
    submitting: "جارٍ الدخول...",
    badCreds: "بيانات الدخول غير صحيحة",
    poweredBy: "مدعوم بـ أموالي",
    resetTitle: "إعادة تعيين كلمة المرور",
    resetDesc: "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.",
    sendReset: "إرسال الرابط",
    sending: "جارٍ الإرسال...",
    back: "رجوع",
    resetSent: "تم إرسال رابط الإعادة إلى بريدك",
    unavailable: "هذه الصفحة غير متاحة",
    checkLink: "تأكّد من الرابط أو راجع مسؤول النظام.",
    loading: "جارٍ التحميل...",
  },
  en: {
    tagline: "One identity. One ledger. One group.",
    signIn: "Sign in",
    welcome: "Welcome back.",
    email: "Email address",
    password: "Password",
    remember: "Remember me",
    forgot: "Forgot your password?",
    submit: "Sign in",
    submitting: "Signing in...",
    badCreds: "Invalid credentials",
    poweredBy: "Powered by Amwali",
    resetTitle: "Reset your password",
    resetDesc: "Enter your email and we'll send you a reset link.",
    sendReset: "Send reset link",
    sending: "Sending...",
    back: "Back",
    resetSent: "Reset link sent to your inbox",
    unavailable: "This page is unavailable",
    checkLink: "Check the link or contact your admin.",
    loading: "Loading...",
  },
} as const;

function SpartaShield({ size = 84, accent = "#9E2B43", accent2 = "#B23A55" }: { size?: number; accent?: string; accent2?: string }) {
  return (
    <svg viewBox="0 0 120 140" width={size} height={(size * 140) / 120} aria-hidden>
      <defs>
        <linearGradient id="sparta-shield-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>
      <path
        d="M60 4 L112 22 L112 70 C112 102 88 126 60 136 C32 126 8 102 8 70 L8 22 Z"
        fill="url(#sparta-shield-grad)"
      />
      <path
        d="M60 14 L104 28 L104 70 C104 96 84 117 60 126 C36 117 16 96 16 70 L16 28 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.5"
      />
      <text
        x="60"
        y="92"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', 'Times New Roman', serif"
        fontWeight={700}
        fontSize="78"
        fill="#FFFFFF"
      >
        Λ
      </text>
    </svg>
  );
}

export default function BrandedHoldingLoginPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [holding, setHolding] = useState<Branding | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isReset, setIsReset] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("holding-lang") as Lang) || "ar");

  const t = T[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem("holding-lang", lang);
  }, [lang]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_holding_branding_by_slug", { p_slug: slug });
      if (!error && data && data.length > 0) setHolding(data[0] as Branding);
      setLoading(false);
    })();
  }, [slug]);

  const accent = holding?.primary_color || "#9E2B43";
  const accent2 = holding?.secondary_color || "#B23A55";
  const gradient = `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding) return;
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      toast.error(t.badCreds);
      return;
    }
    // Always go to the workspace selection portal after login
    navigate(`/g/${holding.slug}/select`, { replace: true });
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t.resetSent);
    setIsReset(false);
  };

  const fontStack = useMemo(
    () => (lang === "ar" ? "'Cairo', system-ui, sans-serif" : "'Inter', system-ui, sans-serif"),
    [lang]
  );

  if (loading) {
    return (
      <div style={{ direction: dir, fontFamily: fontStack, minHeight: "100dvh", backgroundColor: "#FFFFFF", color: "#1F2937", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {t.loading}
      </div>
    );
  }

  if (!holding) {
    return (
      <div style={{ direction: dir, fontFamily: fontStack, minHeight: "100dvh", backgroundColor: "#FFFFFF", color: "#1F2937", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{t.unavailable}</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>{t.checkLink}</p>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 999,
    border: "1px solid #E5E7EB",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    direction: "ltr",
    textAlign: "left",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 6, display: "block" };

  return (
    <div
      style={{
        direction: dir,
        fontFamily: fontStack,
        minHeight: "100dvh",
        backgroundColor: "#FFFFFF",
        color: "#111827",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Soft ambient blobs */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          [dir === "rtl" ? "right" : "left"]: -120,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${accent}22, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
        } as React.CSSProperties}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -140,
          [dir === "rtl" ? "left" : "right"]: -140,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${accent2}1f, transparent 70%)`,
          filter: "blur(24px)",
          pointerEvents: "none",
        } as React.CSSProperties}
      />

      {/* Language switcher */}
      <div style={{ position: "absolute", top: 20, [dir === "rtl" ? "left" : "right"]: 20, zIndex: 2 } as React.CSSProperties}>
        <div style={{ display: "inline-flex", padding: 4, borderRadius: 999, backgroundColor: "#F3F4F6", border: "1px solid #E5E7EB" }}>
          {(["en", "ar"] as Lang[]).map((l) => {
            const active = lang === l;
            return (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: active ? gradient : "transparent",
                  color: active ? "#FFFFFF" : "#6B7280",
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: 0.5,
                }}
              >
                {l.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, textAlign: "center" }}>
          {holding.logo_url ? (
            <img src={holding.logo_url} alt={holding.name_ar} style={{ height: 96, objectFit: "contain", marginBottom: 16 }} />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <SpartaShield accent={accent} accent2={accent2} />
            </div>
          )}
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, color: "#0F172A", letterSpacing: lang === "ar" ? 0 : -0.5 }}>
            {lang === "ar" ? holding.name_ar : (holding.name_en || holding.name_ar)}
          </h1>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 13,
              letterSpacing: 6,
              color: accent,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            SPARTA · HOLDING
          </div>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 12, marginBottom: 10, maxWidth: 380 }}>{t.tagline}</p>
          <div style={{ width: 64, height: 3, borderRadius: 2, background: gradient }} />
        </div>

        {/* Card */}
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            backgroundColor: "#FFFFFF",
            border: "1px solid #EEF0F3",
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 24px 48px -24px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.04)",
          }}
        >
          {!isReset ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: accent, letterSpacing: 1, marginBottom: 6 }}>
                {t.signIn.toUpperCase()}
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 20px", color: "#0F172A" }}>{t.welcome}</h2>

              <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t.email}</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>{t.password}</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...inputStyle, paddingRight: dir === "ltr" ? 44 : 14, paddingLeft: dir === "ltr" ? 14 : 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide" : "Show"}
                      style={{
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        [dir === "ltr" ? "right" : "left"]: 10,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#6B7280",
                        padding: 6,
                        display: "flex",
                        alignItems: "center",
                      } as React.CSSProperties}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginTop: 2 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#374151", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      style={{ accentColor: accent, width: 16, height: 16 }}
                    />
                    {t.remember}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsReset(true)}
                    style={{ background: "transparent", border: "none", color: accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
                  >
                    {t.forgot}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    marginTop: 10,
                    padding: "14px 18px",
                    borderRadius: 999,
                    border: "none",
                    background: gradient,
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: submitting ? "wait" : "pointer",
                    fontFamily: "inherit",
                    boxShadow: `0 10px 24px -10px ${accent}88`,
                    transition: "transform 0.05s ease",
                  }}
                >
                  {submitting ? t.submitting : t.submit}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: accent, letterSpacing: 1, marginBottom: 6 }}>
                {t.resetTitle.toUpperCase()}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px", color: "#0F172A" }}>{t.resetTitle}</h2>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 18px" }}>{t.resetDesc}</p>

              <form onSubmit={onReset} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t.email}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetSending}
                  style={{
                    marginTop: 4,
                    padding: "14px 18px",
                    borderRadius: 999,
                    border: "none",
                    background: gradient,
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: resetSending ? "wait" : "pointer",
                    fontFamily: "inherit",
                    boxShadow: `0 10px 24px -10px ${accent}88`,
                  }}
                >
                  {resetSending ? t.sending : t.sendReset}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReset(false)}
                  style={{ background: "transparent", border: "none", color: "#6B7280", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
                >
                  ← {t.back}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: "#94A3B8" }}>{t.poweredBy}</div>
      </div>
    </div>
  );
}