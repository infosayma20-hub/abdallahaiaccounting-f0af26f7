import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanFace, Mail, Lock } from "lucide-react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

const FinancialCanvas = lazy(() => import("@/components/auth/FinancialCanvas"));

type Mode = "login" | "signup" | "forgot";

const AuthPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");

  useEffect(() => {
    setSupportsPasskeys(browserSupportsWebAuthn());
    const stored = localStorage.getItem("passkey_email");
    if (stored) setSavedEmail(stored);
  }, []);

  const resolveRedirect = useCallback(async (userId: string): Promise<string> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (data || []).map((r) => r.role);
    if (roles.includes("super_admin")) return "/super-admin/dashboard";
    if (roles.includes("employee") && roles.length === 1) return "/employee";
    if (roles.includes("cashier") && !roles.includes("admin")) return "/pos";
    return "/apps";
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "تم الإرسال", description: "تحقق من بريدك الإلكتروني لإعادة تعيين كلمة المرور" });
        setMode("login");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { signup_method: "email", locale: "ar", currency: "ILS" },
          },
        });
        if (error) throw error;
        toast({ title: "تم إنشاء الحساب ✅", description: "تحقق من بريدك الإلكتروني لتأكيد الحساب" });
        setMode("login");
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          const dest = await resolveRedirect(data.user.id);
          navigate(dest);
        } else {
          navigate("/apps");
        }
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    const biometricEmail = savedEmail || email;
    if (!biometricEmail) {
      toast({ title: "أدخل البريد الإلكتروني أولاً", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: options, error: optErr } = await supabase.functions.invoke("webauthn", {
        body: { action: "auth-options", email: biometricEmail },
      });
      if (optErr || options?.error) throw new Error(options?.error || optErr?.message);
      const credential = await startAuthentication({ optionsJSON: options });
      const { data: result, error: verErr } = await supabase.functions.invoke("webauthn", {
        body: { action: "auth-verify", credentialId: credential.id, email: biometricEmail },
      });
      if (verErr || result?.error) throw new Error(result?.error || verErr?.message);
      if (result?.actionLink) {
        const url = new URL(result.actionLink);
        const token_hash = url.searchParams.get("token") || url.hash?.split("token=")[1];
        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: token_hash || "", type: "magiclink" });
        if (verifyErr) throw verifyErr;
      }
      toast({ title: "تم تسجيل الدخول بنجاح ✅" });
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const dest = await resolveRedirect(currentUser.id);
        navigate(dest);
      } else {
        navigate("/apps");
      }
    } catch (err: any) {
      const msg = err.message || "فشل التحقق البيومتري";
      if (msg.includes("No passkeys")) {
        toast({ title: "لا يوجد مفتاح مرور", description: "سجل الدخول أولاً ثم فعّل Face ID من الإعدادات", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-row" dir="ltr">
      {/* LEFT panel — brand showcase with animated canvas (desktop only) */}
      <div
        className="hidden lg:flex lg:w-[48%] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F2235 0%, #1B3A5C 50%, #0F2235 100%)" }}
      >
        {/* Animated canvas background */}
        <Suspense fallback={null}>
          <FinancialCanvas />
        </Suspense>

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <div className="text-center space-y-8 max-w-sm">
            {/* Logo — full white QOYOD logo */}
            <div className="flex flex-col items-center gap-4" dir="ltr">
              <img src="/brand/logo-white.svg" alt="QOYOD قيود" width={220} style={{ maxHeight: 200 }} />
            </div>

            <div className="space-y-4 mt-10" dir="rtl">
              {[
                "✦ محاسبة ذكية بالذكاء الاصطناعي",
                "✦ تقارير فورية وتحليلات عميقة",
                "✦ نقطة بيع متكاملة",
                "✦ إدارة كاملة لأعمالك",
              ].map((f) => (
                <p key={f} className="text-sm text-white/70 font-medium" style={{ fontFamily: "Tajawal" }}>
                  {f}
                </p>
              ))}
            </div>

            <p className="text-lg font-bold mt-8" style={{ color: "#C9A84C", fontFamily: "Tajawal" }}>
              أعمالك في أبهى صورها
            </p>
          </div>
        </div>
      </div>

      {/* Vertical divider bridge */}
      <div className="hidden lg:block w-px" style={{
        background: "linear-gradient(to bottom, transparent 0%, rgba(201,168,76,0.4) 30%, rgba(201,168,76,0.4) 70%, transparent 100%)",
      }} />

      {/* RIGHT panel — form */}
      <div className="flex-1 flex flex-col relative" dir="rtl" style={{ background: "#F8F7F4" }}>
        {/* Top accent bar */}
        <div className="hidden lg:block" style={{ height: 4, background: "linear-gradient(to left, #1B3A5C, #C9A84C)" }} />

        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm space-y-6">
            {/* Mobile logo */}
            <div className="text-center space-y-2 lg:hidden">
              <div className="flex flex-col items-center gap-2" dir="ltr">
                <img src="/logo-icon.svg" alt="قيود" width={40} height={40} />
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 22, color: "#1B3A5C", letterSpacing: "0.03em", lineHeight: 1 }}>
                  QOYOD
                </span>
              </div>
            </div>

            {/* Desktop header with stacked logo */}
            <div className="lg:flex hidden flex-col items-center gap-3 mb-4">
              <div className="flex flex-col items-center gap-2" dir="ltr">
                <img src="/logo-icon.svg" alt="قيود" width={64} height={64} />
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 28, color: "#1B3A5C", letterSpacing: "0.04em", lineHeight: 1 }}>
                  QOYOD
                </span>
              </div>
              <h2 className="text-2xl font-bold" style={{ fontFamily: "Tajawal", color: "#1B3A5C", fontSize: 26 }}>
                مرحباً بك
              </h2>
              <p className="text-sm" style={{ color: "rgba(27,58,92,0.55)", fontSize: 14 }}>
                {mode === "login" ? "سجل دخولك للمتابعة" : mode === "signup" ? "أنشئ حسابك المجاني" : "أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة"}
              </p>
            </div>

            {/* Biometric */}
            {mode === "login" && supportsPasskeys && savedEmail && (
              <Button variant="outline" className="w-full gap-3 h-14 text-base" onClick={handleBiometricSignIn} disabled={loading}
                style={{ borderColor: "#D9D4C7", color: "#1B3A5C", background: "#FFFFFF" }}>
                <ScanFace className="h-6 w-6" style={{ color: "#C9A84C" }} />
                <span className="font-semibold">تسجيل الدخول بـ Face ID</span>
              </Button>
            )}

            {/* Google */}
            {mode !== "forgot" && (
              <div className="space-y-2">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 h-14 text-base rounded-lg transition-all font-semibold"
                  style={{
                    fontFamily: "Tajawal",
                    background: "#FFFFFF",
                    border: "1.5px solid #D9D4C7",
                    color: "#1B3A5C",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#C9A84C")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#D9D4C7")}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {mode === "signup" ? "متابعة مع Google" : "متابعة مع Google"}
                </button>
              </div>
            )}

            {/* Divider */}
            {mode !== "forgot" && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "#D9D4C7" }} />
                <span className="text-xs" style={{ color: "rgba(27,58,92,0.4)" }}>
                  {mode === "signup" ? "أو أنشئ حساب بالبريد الإلكتروني" : "أو استخدم بريدك الإلكتروني"}
                </span>
                <div className="flex-1 h-px" style={{ background: "#D9D4C7" }} />
              </div>
            )}

            {/* Email Form */}
            <Card className="border-0 shadow-none" style={{ background: "transparent" }}>
              <CardContent className="p-0">
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="relative group">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-colors" style={{ color: "rgba(27,58,92,0.4)" }} />
                    <Input type="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pr-10 auth-input" dir="ltr" style={{ textAlign: "left", background: "#FFFFFF", border: "1.5px solid #D9D4C7", color: "#1B3A5C", borderRadius: 8 }} />
                  </div>
                  {mode !== "forgot" && (
                    <div className="relative group">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-colors" style={{ color: "rgba(27,58,92,0.4)" }} />
                      <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={1} className="pr-10 auth-input" dir="ltr" style={{ textAlign: "left", background: "#FFFFFF", border: "1.5px solid #D9D4C7", color: "#1B3A5C", borderRadius: 8 }} />
                    </div>
                  )}
                  {mode === "signup" && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer" dir="rtl" style={{ color: "rgba(27,58,92,0.55)" }}>
                      <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" style={{ accentColor: "#C9A84C" }} />
                      <span>
                        أوافق على{" "}
                        <Link to="/terms" className="hover:underline" style={{ color: "#C9A84C" }}>الشروط</Link>
                        {" "}و{" "}
                        <Link to="/privacy" className="hover:underline" style={{ color: "#C9A84C" }}>سياسة الخصوصية</Link>
                      </span>
                    </label>
                  )}
                  <button
                    type="submit"
                    disabled={loading || (mode === "signup" && !agreedToTerms)}
                    className="w-full h-12 rounded-lg text-base font-bold transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                    style={{
                      background: "#C9A84C",
                      color: "#1B3A5C",
                      boxShadow: "0 4px 14px rgba(201,168,76,0.3)",
                      border: "none",
                      borderRadius: 8,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#B8973B"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#C9A84C"; e.currentTarget.style.transform = "translateY(0)"; }}
                    onMouseDown={(e) => { e.currentTarget.style.background = "#A8872B"; e.currentTarget.style.transform = "translateY(0)"; }}
                    onMouseUp={(e) => { e.currentTarget.style.background = "#B8973B"; }}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === "login" ? "دخول" : mode === "signup" ? "إنشاء حساب مجاني" : "إرسال رابط الاستعادة"}
                  </button>
                </form>
              </CardContent>
            </Card>

            {/* Links */}
            <div className="text-center space-y-3">
              {mode === "login" && (
                <>
                  <button onClick={() => setMode("forgot")} className="block w-full text-xs transition-colors"
                    style={{ color: "rgba(27,58,92,0.5)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#C9A84C")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(27,58,92,0.5)")}>
                    نسيت كلمة المرور؟
                  </button>
                  <p className="text-sm" style={{ color: "rgba(27,58,92,0.55)" }}>
                    ليس لديك حساب؟{" "}
                    <button onClick={() => setMode("signup")} className="font-semibold hover:underline" style={{ color: "#C9A84C" }}>أنشئ حساب مجاناً</button>
                  </p>
                </>
              )}
              {mode === "signup" && (
                <p className="text-sm" style={{ color: "rgba(27,58,92,0.55)" }}>
                  لديك حساب؟{" "}
                  <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: "#C9A84C" }}>تسجيل الدخول</button>
                </p>
              )}
              {mode === "forgot" && (
                <p className="text-sm" style={{ color: "rgba(27,58,92,0.55)" }}>
                  <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: "#C9A84C" }}>العودة لتسجيل الدخول</button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auth input focus styles */}
      <style>{`
        .auth-input:focus {
          border-color: #C9A84C !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.15) !important;
          outline: none !important;
        }
        .auth-input::placeholder {
          color: rgba(27,58,92,0.35) !important;
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
