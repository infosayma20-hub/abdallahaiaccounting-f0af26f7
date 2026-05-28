import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import SamiChatbot from "@/components/SamiChatbot";
import amwaliLogoFull from "@/assets/amwali-logo-full.png";
import amwaliMarkWhiteNavy from "@/assets/amwali-mark-white-navy.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { normalizeAuthSessionExpiry, normalizeStoredAuthSession } from "@/lib/auth-cross-tab";
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
    const [{ data }, { data: employee }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId),
      supabase
        .from("employees")
        .select("id, auth_user_id, user_id, is_active, is_terminated, is_manager, is_hr_manager, can_view_team, can_manage_schedule, can_manage_attendance")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);
    const roles: string[] = (data || []).map((r) => r.role as string);
    const hasEmployeeRecord = !!employee && employee.is_active && !employee.is_terminated;
    const hasAdminAccess = roles.some((role) => role === "admin" || role === "super_admin" || role === "hr_manager" || role.startsWith("accountant"));
    // sales_rep أولوية أعلى من سجل الموظف: المستخدم اللي عنده دور مندوب
    // مبيعات يروح مباشرة لشاشة المندوب حتى لو كان مرتبط بسجل employees.
    if (roles.includes("sales_rep") && !hasAdminAccess) {
      try {
        sessionStorage.removeItem(`workspace-choice:${userId}`);
      } catch {}
      return "/rep";
    }
    const hasPureSystemRole =
      roles.includes("super_admin") ||
      roles.includes("portal") ||
      roles.includes("store_tracker") ||
      roles.includes("worker") ||
      roles.includes("cashier");
    if (hasEmployeeRecord && !hasAdminAccess && !hasPureSystemRole) {
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("amwali-open-tabs") || key.includes("lastVisitedRoute")) localStorage.removeItem(key);
        });
        Object.keys(sessionStorage).forEach((key) => {
          if (key.includes("lastVisitedRoute")) sessionStorage.removeItem(key);
        });
      } catch {}
      console.info("[post-login-redirect] finalRedirect = /employee", {
        authUid: userId,
        employeeId: employee.id,
        employeeAuthUserId: employee.auth_user_id,
        employeeOwnerUserId: employee.user_id,
        userRoles: roles,
        isManager: employee.is_manager,
        isHrManager: employee.is_hr_manager,
        canViewTeam: employee.can_view_team,
        canManageSchedule: employee.can_manage_schedule,
        canManageAttendance: employee.can_manage_attendance,
        finalRedirect: "/employee",
      });
      return "/employee";
    }
    if (roles.includes("super_admin")) return "/super-admin/dashboard";
    if (roles.includes("portal") && !roles.includes("admin")) return "/portal/dashboard";
    if (roles.includes("store_tracker") && !roles.includes("admin")) return "/store-tracker";
    if (roles.includes("worker") && roles.length === 1) return "/worker/procurement";
    if (roles.includes("employee") && roles.length === 1) return "/employee";
    if (roles.includes("cashier") && !roles.includes("admin")) return "/pos";
    return "/apps";
  }, []);

  const sendEmailResetLink = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast({ title: "أدخل بريدك الإلكتروني", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    toast({
      title: "تم إرسال الرابط ✅",
      description: "تحقق من بريدك الإلكتروني لإعادة تعيين كلمة المرور.",
    });
    setMode("login");
  };

  const sendHrResetRequest = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast({ title: "أدخل بريدك الإلكتروني", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("password_reset_requests").insert({
        email: cleanEmail,
        reason: "طلب نسيت كلمة المرور من صفحة تسجيل الدخول",
      });
      if (error) throw error;
      toast({
        title: "تم إرسال طلبك ✅",
        description: "تم إرسال طلبك إلى الموارد البشرية / إدارة شركتك.",
      });
      setMode("login");
    } catch (err: any) {
      toast({ title: "تعذر إرسال الطلب", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        // الزر الافتراضي للنموذج = إرسال رابط الاستعادة على البريد الإلكتروني.
        await sendEmailResetLink();
        return;
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
        if (error) {
          // سجّل محاولة الدخول الفاشلة
          try {
            await supabase.functions.invoke("log-security-event", {
              body: {
                user_id: "00000000-0000-0000-0000-000000000000",
                user_email: email,
                event_type: "login_failed",
                auth_method: "password",
                metadata: { reason: error.message },
              },
            });
          } catch {}
          throw error;
        }
        normalizeAuthSessionExpiry(data.session);
        normalizeStoredAuthSession();
        localStorage.removeItem("trial_banner_dismissed");
        if (data.user) {
          // إجبار الموظف على تغيير كلمة المرور إذا كانت مؤقتة من الأدمن
          if ((data.user.user_metadata as any)?.must_change_password) {
            toast({
              title: "مطلوب تغيير كلمة المرور",
              description: "تم تعيين كلمة مرور مؤقتة لك من قِبل الإدارة. الرجاء تغييرها الآن.",
            });
            navigate("/reset-password?force=1");
            return;
          }
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
      try {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith("workspace-choice:")) sessionStorage.removeItem(key);
        });
      } catch {}
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
        body: {
          action: "auth-verify",
          credentialId: credential.id,
          email: biometricEmail,
          assertion: {
            clientDataJSON: credential.response.clientDataJSON,
            authenticatorData: credential.response.authenticatorData,
            signature: credential.response.signature,
            userHandle: credential.response.userHandle,
          },
        },
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
    background: '#F7F8FA',
    border: '1px solid #E8EDF2',
    color: '#0D1B2E',
    fontWeight: 300 as const,
  };

  const inputFocusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#0D1B2E';
      e.target.style.background = '#FFFFFF';
      e.target.style.boxShadow = '0 0 0 3px rgba(13,27,46,0.06)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#E8EDF2';
      e.target.style.background = '#F7F8FA';
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
    <>
    <div className="h-screen flex flex-col" dir="ltr">
      {/* Top Nav — white like Qoyod */}
      <nav
        className="w-full flex items-center justify-between px-12 shrink-0" dir="rtl"
        style={{ background: '#0D1B2E', borderBottom: 'none', height: 56 }}
      >
        <img src={amwaliMarkWhiteNavy} alt="AMWALI" className="h-10 w-auto object-contain" />
        <div className="flex items-center gap-3">
          <button
            className="px-6 py-2 rounded-lg text-sm transition-all"
            style={{ background: 'transparent', color: '#FFFFFF', fontWeight: 400, letterSpacing: '0.01em', border: '1.5px solid rgba(255,255,255,0.5)' }}
            onClick={() => setMode("signup")}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            ابدأ مجاناً الآن
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-row">
        {/* LEFT — Navy brand panel */}
        <div
          className="hidden lg:flex lg:w-[45%] flex-col justify-between relative overflow-hidden px-14 py-16"
          style={{ background: '#0D1B2E' }}
          dir="rtl"
        >
          {/* Giant transparent logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.06 }}>
            <img src={amwaliMarkWhiteNavy} alt="" className="w-[85%] h-auto object-contain" />
          </div>

          {/* Content — vertically centered to align with right panel heading */}
          <div className="relative z-10 flex-1 flex flex-col justify-center">
            <h1 style={{ color: '#FFFFFF', fontSize: 42, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 16, fontFamily: 'Tajawal' }}>
              أعمالك في
              <br />
              <span style={{ fontWeight: 500 }}>أبهى صورها</span>
            </h1>

            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: 300, marginBottom: 48, fontFamily: 'Tajawal' }}>
              نظام إدارة أعمال متكامل للشركات العربية
            </p>

            <div className="space-y-3.5">
              {features.map(feat => (
                <div key={feat} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.4)' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 300, fontFamily: 'Tajawal' }}>
                    {feat}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10">
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 300, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>
              AMWALI ERP SOFTWARE
            </p>
          </div>
        </div>

        {/* RIGHT — White form panel */}
        <div className="flex-1 flex flex-col items-center justify-start px-8 py-4 overflow-y-auto" style={{ background: '#FFFFFF' }} dir="rtl">
          <div className="w-full max-w-[380px]">

            {/* Logo — full AMWALI logo */}
            <div className="text-center mb-3">
              <img src={amwaliLogoFull} alt="AMWALI" className="h-28 mx-auto object-contain" />
            </div>

            {/* Header — thin font */}
            <div className="text-center mb-8">
              <h2 style={{ color: '#0D1B2E', fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 6, fontFamily: 'Tajawal' }}>
                {mode === "login" ? "مرحباً بك" : mode === "signup" ? "أنشئ حسابك مجاناً" : "استعادة كلمة المرور"}
              </h2>
              <p style={{ color: '#8896A4', fontSize: 14, fontWeight: 300, fontFamily: 'Tajawal' }}>
                {mode === "login" ? "سجل دخولك للمتابعة" : mode === "signup" ? "تحتاج أقل من دقيقتين • لا تحتاج لبطاقة ائتمان" : "أدخل بريدك الإلكتروني وسيتم إرسال طلبك لإدارة شركتك / الموارد البشرية لإعادة تعيين كلمة المرور"}
              </p>
            </div>

            {/* Biometric */}
            {mode === "login" && supportsPasskeys && savedEmail && (
              <button
                onClick={handleBiometricSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-11 rounded-xl text-sm transition-all mb-3"
                style={{ border: '1px solid #E8EDF2', background: '#FFFFFF', color: '#0D1B2E', fontWeight: 400 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0D1B2E'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EDF2'; }}
              >
                <ScanFace className="h-5 w-5" style={{ color: '#0D1B2E' }} />
                تسجيل الدخول بـ Face ID
              </button>
            )}

            {/* Google */}
            {mode !== "forgot" && (
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-11 rounded-xl text-sm transition-all mb-5"
                style={{ border: '1px solid #E8EDF2', background: '#FFFFFF', color: '#0D1B2E', fontWeight: 400, fontFamily: 'Tajawal' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0D1B2E'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EDF2'; }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
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
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: '#E8EDF2' }} />
                <span style={{ color: '#B0BAC4', fontSize: 12, fontWeight: 300 }}>أو</span>
                <div className="flex-1 h-px" style={{ background: '#E8EDF2' }} />
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {/* Email */}
              <div className="space-y-1.5">
                <label style={{ color: '#8896A4', fontSize: 12, fontWeight: 300 }}>البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#B0BAC4' }} />
                  <input
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    onInvalid={e => (e.target as HTMLInputElement).setCustomValidity(' ')}
                    onInput={e => (e.target as HTMLInputElement).setCustomValidity('')}
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
                    <label style={{ color: '#8896A4', fontSize: 12, fontWeight: 300 }}>كلمة المرور</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="transition-colors"
                        style={{ color: '#8896A4', fontSize: 12, fontWeight: 300 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#0D1B2E'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#8896A4'; }}
                      >
                        نسيت كلمة المرور؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#B0BAC4' }} />
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
                      style={{ color: '#B0BAC4' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm password */}
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label style={{ color: '#8896A4', fontSize: 12, fontWeight: 300 }}>تأكيد كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#B0BAC4' }} />
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
                      style={{ color: '#B0BAC4' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Terms */}
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: '#8896A4', fontWeight: 300 }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: '#0D1B2E' }}
                  />
                  <span>
                    أوافق على{" "}
                    <Link to="/terms" style={{ color: '#0D1B2E' }} className="hover:underline">الشروط</Link>
                    {" "}و{" "}
                    <Link to="/privacy" style={{ color: '#0D1B2E' }} className="hover:underline">سياسة الخصوصية</Link>
                  </span>
                </label>
              )}

              {/* Submit — solid navy, no gradient */}
              <button
                type="submit"
                disabled={loading || (mode === "signup" && !agreedToTerms)}
                className="w-full h-11 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-1"
                style={{
                  background: '#0D1B2E',
                  color: '#FFFFFF',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  boxShadow: '0 2px 12px rgba(13,27,46,0.20)',
                  fontFamily: 'Tajawal',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1B3A5C'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0D1B2E'; }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء حساب مجاني" : "إرسال رابط الاستعادة على البريد"}
              </button>

              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={sendHrResetRequest}
                  disabled={loading}
                  className="w-full h-11 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  style={{
                    background: '#FFFFFF',
                    color: '#0D1B2E',
                    border: '1px solid #0D1B2E',
                    fontWeight: 400,
                    letterSpacing: '0.02em',
                    fontFamily: 'Tajawal',
                  }}
                >
                  إرسال طلب للإدارة (للموظفين)
                </button>
              )}
            </form>

            {/* Links */}
            <div className="text-center space-y-3 mt-5">
              {mode === "login" && (
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: '#F7F8FA', border: '1px solid #E8EDF2' }}
                >
                  <div className="text-right">
                    <p style={{ color: '#0D1B2E', fontSize: 13, fontWeight: 400 }}>تجربة مجانية 14 يوم</p>
                    <p style={{ color: '#8896A4', fontSize: 11, fontWeight: 300 }}>لم تسجل بعد؟ جرب أموالي مجاناً</p>
                  </div>
                  <button
                    onClick={() => setMode("signup")}
                    className="px-4 py-2 rounded-lg text-xs transition-all whitespace-nowrap"
                    style={{ background: '#0D1B2E', color: '#FFFFFF', fontWeight: 400 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1B3A5C'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#0D1B2E'; }}
                  >
                    ابدأ تجربتك ←
                  </button>
                </div>
              )}
              {mode === "signup" && (
                <p style={{ color: '#8896A4', fontSize: 14, fontWeight: 300 }}>
                  لديك حساب؟{" "}
                  <button onClick={() => setMode("login")} className="hover:underline" style={{ color: '#0D1B2E', fontWeight: 400 }}>تسجيل الدخول</button>
                </p>
              )}
              {mode === "forgot" && (
                <p style={{ color: '#8896A4', fontSize: 14, fontWeight: 300 }}>
                  <button onClick={() => setMode("login")} className="hover:underline" style={{ color: '#0D1B2E', fontWeight: 400 }}>العودة لتسجيل الدخول</button>
                </p>
              )}
              {mode === "forgot" && (
                <p className="mt-3 text-xs leading-relaxed" style={{ color: '#8896A4', fontWeight: 300 }}>
                  ملاحظة: إذا كنت موظفاً، سيتم إرسال طلبك مباشرةً إلى الموارد البشرية / إدارة شركتك فقط، ولن يصل لأي شركة أخرى.
                </p>
              )}
              <SamiChatbot inline />
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default AuthPage;
