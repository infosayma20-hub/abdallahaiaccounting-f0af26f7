import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanFace, Mail, Lock, Eye, EyeOff, Check } from "lucide-react";
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

  const inputStyle = {
    background: '#F3F7FB',
    border: '1.5px solid #E5E7EB',
    color: '#1B3A5C',
  };

  const inputFocusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#1B3A5C';
      e.target.style.background = '#EEF4FB';
      e.target.style.boxShadow = '0 0 0 3px rgba(27,58,92,0.08)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#E5E7EB';
      e.target.style.background = '#F3F7FB';
      e.target.style.boxShadow = 'none';
    },
  };

  const features = [
    'محاسبة ذكية بالذكاء الاصطناعي',
    'تقارير فورية وتحليلات عميقة',
    'نقطة بيع متكاملة',
    'إدارة كاملة لأعمالك',
  ];

  return (
    <div className="min-h-screen flex flex-col" dir="ltr">
      {/* Top Nav */}
      <nav
        className="w-full flex items-center justify-between px-6 py-3 z-50"
        style={{ background: '#1B3A5C' }}
      >
        <img src="/logo-white.png" alt="AMWALI" className="h-8 object-contain" />
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: '#FFFFFF', color: '#1B3A5C' }}
            onClick={() => setMode("signup")}
            onMouseEnter={e => { e.currentTarget.style.background = '#EEF4FB'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            ابدأ مجاناً الآن
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-row">
        {/* LEFT — Brand panel (desktop) */}
        <div
          className="hidden lg:flex lg:w-[46%] relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #1B3A5C 0%, #1E4976 40%, #2A6396 100%)' }}
        >
          <Suspense fallback={null}>
            <FinancialCanvas />
          </Suspense>

          <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
            <div className="text-center space-y-8 max-w-sm">
              <div className="flex flex-col items-center gap-4">
                <img src="/logo-white.png" alt="AMWALI أموالي" width={200} />
              </div>

              <div className="space-y-3 mt-8" dir="rtl">
                {features.map(feat => (
                  <div key={feat} className="flex items-center gap-3 justify-start">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(74,144,217,0.25)' }}
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm text-white/80 font-medium" style={{ fontFamily: 'Tajawal' }}>
                      {feat}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className="text-xl font-bold mt-10"
                style={{ color: '#4A90D9', fontFamily: 'Tajawal' }}
              >
                أعمالك في أبهى صورها
              </p>
            </div>
          </div>

          {/* Trust badge */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(74,144,217,0.3)' }}>
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs text-white/70" style={{ fontFamily: 'Tajawal' }}>
                تثق به آلاف المنشآت في المنطقة العربية
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — Form panel */}
        <div className="flex-1 flex items-center justify-center px-4 py-8" style={{ background: '#F8F9FA' }} dir="rtl">
          <div className="w-full max-w-sm space-y-5">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3 mb-2">
              <img src="/q-logo-navy.png" alt="AMWALI" className="w-20 h-20 object-contain" />
              <h2 className="text-2xl font-bold" style={{ color: '#1B3A5C', fontFamily: 'Tajawal' }}>
                {mode === "login" ? "مرحباً بك" : mode === "signup" ? "أنشئ حسابك مجاناً" : "استعادة كلمة المرور"}
              </h2>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                {mode === "login" ? "سجل دخولك للمتابعة" : mode === "signup" ? "تحتاج أقل من دقيقتين • لا تحتاج لبطاقة ائتمان" : "أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة"}
              </p>
            </div>

            {/* Biometric */}
            {mode === "login" && supportsPasskeys && savedEmail && (
              <button
                onClick={handleBiometricSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-12 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1.5px solid #E5E7EB', background: '#FFFFFF', color: '#1B3A5C' }}
              >
                <ScanFace className="h-5 w-5" style={{ color: '#4A90D9' }} />
                تسجيل الدخول بـ Face ID
              </button>
            )}

            {/* Google */}
            {mode !== "forgot" && (
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-12 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1.5px solid #E5E7EB', background: '#FFFFFF', color: '#1B3A5C', fontFamily: 'Tajawal' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B3A5C'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                متابعة مع Google
              </button>
            )}

            {/* Divider */}
            {mode !== "forgot" && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
                <span className="text-xs" style={{ color: '#6B7280' }}>
                  {mode === "signup" ? "أو أنشئ حساب بالبريد الإلكتروني" : "أو استخدم بريدك الإلكتروني"}
                </span>
                <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: '#1B3A5C' }}>البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#6B7280' }} />
                  <input
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full h-11 rounded-xl px-4 pr-10 text-sm outline-none transition-all"
                    style={inputStyle}
                    dir="ltr"
                    {...inputFocusHandlers}
                  />
                </div>
              </div>

              {/* Password */}
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium" style={{ color: '#1B3A5C' }}>كلمة المرور</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs transition-colors"
                        style={{ color: '#4A90D9' }}
                      >
                        نسيت كلمة المرور؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#6B7280' }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "signup" ? "6 أحرف على الأقل" : "••••••••"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={mode === "signup" ? 6 : 1}
                      className="w-full h-11 rounded-xl px-4 pr-10 pl-10 text-sm outline-none transition-all"
                      style={inputStyle}
                      dir="ltr"
                      {...inputFocusHandlers}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#6B7280' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm password */}
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#1B3A5C' }}>تأكيد كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#6B7280' }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="تأكيد كلمة المرور"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full h-11 rounded-xl px-4 pr-10 pl-10 text-sm outline-none transition-all"
                      style={inputStyle}
                      dir="ltr"
                      {...inputFocusHandlers}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#6B7280' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Terms */}
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: '#6B7280' }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: '#1B3A5C' }}
                  />
                  <span>
                    أوافق على{" "}
                    <Link to="/terms" style={{ color: '#4A90D9' }} className="hover:underline">الشروط</Link>
                    {" "}و{" "}
                    <Link to="/privacy" style={{ color: '#4A90D9' }} className="hover:underline">سياسة الخصوصية</Link>
                  </span>
                </label>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || (mode === "signup" && !agreedToTerms)}
                className="w-full h-12 rounded-xl text-base font-bold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #1B3A5C 0%, #2A6396 100%)',
                  boxShadow: '0 4px 14px rgba(27,58,92,0.25)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #1E4976 0%, #4A90D9 100%)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #1B3A5C 0%, #2A6396 100%)';
                }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء حساب مجاني" : "إرسال رابط الاستعادة"}
              </button>
            </form>

            {/* Links */}
            <div className="text-center space-y-3">
              {mode === "login" && (
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: '#EEF4FB' }}
                >
                  <div className="text-right">
                    <p className="text-xs font-semibold" style={{ color: '#1B3A5C' }}>تجربة مجانية 14 يوم</p>
                    <p className="text-[11px]" style={{ color: '#6B7280' }}>لم تسجل بعد؟ جرب AMWALI مجاناً</p>
                  </div>
                  <button
                    onClick={() => setMode("signup")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                    style={{ background: '#1B3A5C' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2A6396'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#1B3A5C'; }}
                  >
                    ابدأ تجربتك ←
                  </button>
                </div>
              )}
              {mode === "signup" && (
                <p className="text-sm" style={{ color: '#6B7280' }}>
                  لديك حساب؟{" "}
                  <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: '#4A90D9' }}>تسجيل الدخول</button>
                </p>
              )}
              {mode === "forgot" && (
                <p className="text-sm" style={{ color: '#6B7280' }}>
                  <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: '#4A90D9' }}>العودة لتسجيل الدخول</button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
