import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { QOYOD_COLORS as C } from "@/constants/colors";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanFace, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

const FinancialCanvas = lazy(() => import("@/components/auth/FinancialCanvas"));

type Mode = "login" | "signup" | "forgot";

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    if (roles.includes("portal") && !roles.includes("admin")) return "/portal/dashboard";
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
        if (password.length < 6) {
          toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast({ title: "خطأ", description: "كلمتا المرور غير متطابقتين", variant: "destructive" });
          setLoading(false);
          return;
        }
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
        localStorage.removeItem("trial_banner_dismissed");
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
      localStorage.removeItem("trial_banner_dismissed");
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
      localStorage.removeItem("trial_banner_dismissed");
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
        style={{ background: C.navy.primary }}
      >
        <Suspense fallback={null}>
          <FinancialCanvas />
        </Suspense>

        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <div className="text-center space-y-8 max-w-sm">
            <div className="flex flex-col items-center gap-4" dir="ltr">
              <img src="/logo-white.png" alt="QOYOD قيود" width={220} />
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

            <p className="text-lg font-bold mt-8" style={{ color: C.gold.primary, fontFamily: "Tajawal" }}>
              أعمالك في أبهى صورها
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 auth-light-panel" dir="rtl">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="text-center space-y-3 lg:hidden py-4">
            <div className="flex flex-col items-center gap-3">
              <img src="/q-logo-navy.png" alt="QOYOD" className="w-24 h-24 object-contain" />
              <h1 className="text-2xl font-bold text-foreground tracking-wide" style={{ fontFamily: "Tajawal" }}>
                QOYOD قيود
              </h1>
              <p className="text-sm text-muted-foreground" style={{ fontFamily: "Tajawal" }}>أهلاً بك</p>
            </div>
          </div>

          {/* Desktop header */}
          <div className="lg:flex hidden flex-col items-center gap-3 mb-4">
            <img src="/q-logo-navy.png" alt="QOYOD قيود" width={100} />
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal" }}>
              مرحباً بك
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "سجل دخولك للمتابعة" : mode === "signup" ? "أنشئ حسابك المجاني" : "أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة"}
            </p>
          </div>

          {/* Biometric */}
          {mode === "login" && supportsPasskeys && savedEmail && (
            <Button variant="outline" className="w-full gap-3 h-14 text-base" onClick={handleBiometricSignIn} disabled={loading}>
              <ScanFace className="h-6 w-6 text-accent" />
              <span className="font-semibold">تسجيل الدخول بـ Face ID</span>
            </Button>
          )}

          {/* Google */}
          {mode !== "forgot" && (
            <div className="space-y-2">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-14 text-base border border-border rounded-lg hover:bg-muted/50 transition-all font-semibold"
                style={{ fontFamily: "Tajawal" }}
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
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {mode === "signup" ? "أو أنشئ حساب بالبريد الإلكتروني" : "أو استخدم بريدك الإلكتروني"}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Email Form */}
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input type="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pr-10" dir="ltr" style={{ textAlign: "left" }} />
                </div>
                {mode !== "forgot" && (
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input type={showPassword ? "text" : "password"} placeholder={mode === "signup" ? "كلمة المرور (6 أحرف على الأقل)" : "••••••••"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 6 : 1} className="pr-10 pl-10" dir="ltr" style={{ textAlign: "left" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}
                {mode === "signup" && (
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input type={showPassword ? "text" : "password"} placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="pr-10 pl-10" dir="ltr" style={{ textAlign: "left" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}
                {mode === "signup" && (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer" dir="rtl">
                    <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input accent-accent" />
                    <span>
                      أوافق على{" "}
                      <Link to="/terms" className="text-accent hover:underline">الشروط</Link>
                      {" "}و{" "}
                      <Link to="/privacy" className="text-accent hover:underline">سياسة الخصوصية</Link>
                    </span>
                  </label>
                )}
                <button
                  type="submit"
                  disabled={loading || (mode === "signup" && !agreedToTerms)}
                  className="w-full h-12 rounded-lg text-base font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  style={{
                    background: C.gold.primary,
                    boxShadow: `0 4px 12px ${C.gold.shadow}`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.gold.hover}
                  onMouseLeave={e => e.currentTarget.style.background = C.gold.primary}
                  onMouseDown={e => e.currentTarget.style.background = C.gold.active}
                  onMouseUp={e => e.currentTarget.style.background = C.gold.hover}
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
                <button onClick={() => setMode("forgot")} className="block w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                  نسيت كلمة المرور؟
                </button>
                <p className="text-sm text-muted-foreground">
                  ليس لديك حساب؟{" "}
                  <button onClick={() => setMode("signup")} className="font-semibold hover:underline" style={{ color: C.gold.primary }}>أنشئ حساب مجاناً</button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-sm text-muted-foreground">
                لديك حساب؟{" "}
                <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: C.gold.primary }}>تسجيل الدخول</button>
              </p>
            )}
            {mode === "forgot" && (
              <p className="text-sm text-muted-foreground">
                <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: C.gold.primary }}>العودة لتسجيل الدخول</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
