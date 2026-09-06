import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import SamiChatbot from "@/components/SamiChatbot";
import unifyMarkWhite from "@/assets/unify-mark-white.png.asset.json";
import unifyLogoVertical from "@/assets/unify-logo-vertical-white-opt.webp";
import authHeroBg from "@/assets/auth-hero-bg-opt.webp";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { normalizeAuthSessionExpiry, normalizeStoredAuthSession } from "@/lib/auth-cross-tab";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";
import { Loader2, ScanFace, Mail, Lock, Eye, EyeOff, Check } from "lucide-react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

const FinancialCanvas = lazy(() => import("@/components/auth/FinancialCanvas"));

type Mode = "login" | "signup" | "forgot";

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const pageDir = i18n.dir() === "ltr" ? "ltr" : "rtl";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  // Trial-signup lead fields (mandatory when creating a new account)
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [countryCode, setCountryCode] = useState("+970");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [employeesCount, setEmployeesCount] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    setSupportsPasskeys(browserSupportsWebAuthn());
    const stored = localStorage.getItem("passkey_email");
    if (stored) setSavedEmail(stored);
  }, []);

  // Prefill email from ?email= (used by holding workspace selector to open a subsidiary login)
  useEffect(() => {
    const prefill = (searchParams.get("email") || "").trim();
    if (prefill) setEmail(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // التقاط الروابط القديمة (one-time link منتهي/مستهلك) وتحويلها لمسار الكود.
  useEffect(() => {
    const err = searchParams.get("error_code") || searchParams.get("error");
    const type = searchParams.get("type");
    const hash = window.location.hash || "";
    const isExpired = err && /otp_expired|access_denied|invalid|expired/i.test(err);
    const isLegacyVerify = hash.includes("type=signup") || hash.includes("type=recovery") || type === "signup" || type === "recovery";
    if (isExpired || isLegacyVerify) {
      const t = (type === "recovery" || hash.includes("type=recovery")) ? "recovery" : "signup";
      toast({
        title: "الرابط لم يعد صالحاً",
        description: "استخدم رمز التحقق المُرسل إلى بريدك أو اطلب رمزاً جديداً.",
      });
      const e = (searchParams.get("email") || "").trim().toLowerCase();
      navigate(`/auth/verify?type=${t}${e ? `&email=${encodeURIComponent(e)}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (roles.includes("store_tracker") && !roles.includes("admin")) return "/apps";
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
      title: "تم إرسال الرمز ✅",
      description: "أدخل رمز التحقق الذي وصلك على بريدك الإلكتروني.",
    });
    navigate(`/auth/verify?type=recovery&email=${encodeURIComponent(cleanEmail)}`);
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

  const getArabicAuthError = (message: string): string => {
    const lower = (message || "").toLowerCase();
    if (lower.includes("invalid login credentials")) return "الإيميل أو كلمة المرور خاطئة";
    if (lower.includes("email not confirmed") || /not confirmed|email.*confirm/i.test(message)) return "لم يتم تأكيد البريد الإلكتروني بعد";
    if (lower.includes("invalid email")) return "صيغة البريد الإلكتروني غير صحيحة";
    if (lower.includes("user not found")) return "لا يوجد حساب مرتبط بهذا البريد";
    return message;
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
        // Validate lead fields
        const cleanedPhone = (phoneLocal || "").replace(/\D/g, "").replace(/^0+/, "");
        if (!fullName.trim()) {
          toast({ title: "الاسم الكامل مطلوب", variant: "destructive" });
          setLoading(false); return;
        }
        if (!businessName.trim()) {
          toast({ title: "اسم المنشأة مطلوب", variant: "destructive" });
          setLoading(false); return;
        }
        if (cleanedPhone.length < 7 || cleanedPhone.length > 12) {
          toast({ title: "رقم الجوال غير صحيح", description: "أدخل رقماً صحيحاً بدون مقدمة الدولة", variant: "destructive" });
          setLoading(false); return;
        }
        const phoneE164 = `${countryCode}${cleanedPhone}`;

        // Save lead BEFORE creating auth user so marketing sees it even if email confirmation is delayed
        try {
          await supabase.from("trial_signups").insert({
            full_name: fullName.trim(),
            business_name: businessName.trim(),
            email: email.trim().toLowerCase(),
            country_code: countryCode,
            phone_local: cleanedPhone,
            phone_e164: phoneE164,
            business_type: businessType.trim() || null,
            employees_count: employeesCount || null,
            address: address.trim() || null,
            source: "signup_form",
            user_agent: navigator.userAgent,
          });
        } catch { /* non-blocking */ }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              signup_method: "email",
              locale: "ar",
              currency: "ILS",
              full_name: fullName.trim(),
              business_name: businessName.trim(),
              phone: phoneE164,
              business_type: businessType.trim() || undefined,
              employees_count: employeesCount || undefined,
              address: address.trim() || undefined,
            },
          },
        });
        if (error) throw error;
        toast({ title: "تم إنشاء الحساب ✅", description: "أرسلنا رمز تحقق إلى بريدك" });
        navigate(`/auth/verify?type=signup&email=${encodeURIComponent(email.trim().toLowerCase())}`);
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // إذا الإيميل غير مؤكد، اعرض مسار حل واضح بدل رسالة جافة.
          if (/not confirmed|email.*confirm/i.test(error.message)) {
            setUnconfirmedEmail(email.trim().toLowerCase());
          }
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
      toast({ title: "خطأ", description: getArabicAuthError(err.message), variant: "destructive" });
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
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#FFFFFF',
    fontWeight: 300 as const,
  };

  const inputFocusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#4DA3FF';
      e.target.style.background = 'rgba(255,255,255,0.10)';
      e.target.style.boxShadow = '0 0 0 3px rgba(77,163,255,0.18)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = 'rgba(255,255,255,0.18)';
      e.target.style.background = 'rgba(255,255,255,0.07)';
      e.target.style.boxShadow = 'none';
    },
  };

  const features = [t("common:auth.feature1"), t("common:auth.feature2"), t("common:auth.feature3"), t("common:auth.feature4")];

  return (
    <>
    <div className="h-screen flex flex-col relative overflow-hidden" dir="ltr">
      {/* Full-screen luxury background — 8K night skyline */}
      <img
        src={authHeroBg}
        alt=""
        width={1600}
        height={1067}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
        draggable={false}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(5,14,28,0.62) 0%, rgba(5,14,28,0.35) 40%, rgba(5,14,28,0.78) 100%)' }}
      />

      {/* Top Nav — transparent over the skyline; pushed below the iPhone notch/status bar */}
      <nav
        className="relative z-50 w-full flex items-center justify-between px-4 sm:px-12 shrink-0" dir={pageDir}
        style={{ background: 'linear-gradient(180deg, rgba(5,14,28,0.55) 0%, rgba(5,14,28,0) 100%)', borderBottom: 'none', minHeight: 'calc(56px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <img src={unifyMarkWhite.url} alt="Unify يونيفاي" className="h-9 w-auto object-contain" />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button
            className="px-6 py-2 rounded-lg text-sm transition-all"
            style={{ background: 'transparent', color: '#FFFFFF', fontWeight: 400, letterSpacing: '0.01em', border: '1.5px solid rgba(255,255,255,0.5)' }}
            onClick={() => setMode("signup")}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {t("common:auth.startFree")}
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-row relative z-10">
        {/* LEFT — Brand panel over the skyline */}
        <div
          className="hidden lg:flex lg:w-[45%] flex-col justify-between relative overflow-hidden px-14 py-16"
          dir={pageDir}
        >
          {/* Giant transparent logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.07 }}>
            <img src={unifyMarkWhite.url} alt="" className="h-[70%] w-auto object-contain" />
          </div>

          {/* Content — vertically centered to align with right panel heading */}
          <div className="relative z-10 flex-1 flex flex-col justify-center">
            <h1 style={{ color: '#FFFFFF', fontSize: 42, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 16, fontFamily: 'Tajawal', textShadow: '0 2px 16px rgba(2,8,20,0.35)' }}>
              {t("common:auth.heroLine1")}
              <br />
              <span style={{ fontWeight: 500 }}>{t("common:auth.heroLine2")}</span>
            </h1>

            <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 300, marginBottom: 48, fontFamily: 'Tajawal', textShadow: '0 1px 10px rgba(2,8,20,0.35)' }}>
              {t("common:auth.heroSubtitle")}
            </p>

            <div className="space-y-3.5">
              {features.map(feat => (
                <div key={feat} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#FFFFFF' }} />
                  <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 300, fontFamily: 'Tajawal', textShadow: '0 1px 8px rgba(2,8,20,0.35)' }}>
                    {feat}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10">
            <p style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 300, letterSpacing: '0.15em', textTransform: 'uppercase' as const, textShadow: '0 1px 8px rgba(2,8,20,0.35)' }}>
              UNIFY ERP · CONNECT <span style={{ color: '#4DA3FF', fontWeight: 600 }}>WITHOUT</span> <span style={{ color: '#4DA3FF', fontWeight: 600 }}>BOUNDARIES</span>
            </p>
          </div>
        </div>

        {/* RIGHT — Floating glass login card over the skyline */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-6 overflow-y-auto" dir={pageDir}>
          <div
            className="w-full max-w-[400px] my-auto rounded-3xl px-6 sm:px-8 py-5 max-h-[calc(100vh-96px)] overflow-y-auto"
            style={{
              background: 'rgba(7,17,36,0.55)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: '0 30px 90px rgba(2,8,20,0.55), 0 6px 20px rgba(2,8,20,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >

            {/* Logo — vertical stacked mark on the card */}
            <div className="w-full flex items-center justify-center pt-1 pb-0 -mb-1">
              <img src={unifyLogoVertical} alt="Unify يونيفاي — Connect Without Boundaries" className="h-28 md:h-32 w-auto mx-auto block object-contain select-none" draggable={false} />
            </div>

            {/* Header — thin Tajawal, generous tracking */}
            <div className="text-center mt-0 mb-6">
              <h2 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 6, fontFamily: 'Tajawal', lineHeight: 1.15 }}>
                {mode === "login" ? t("common:auth.welcome") : mode === "signup" ? t("common:auth.createAccount") : t("common:auth.resetPassword")}
              </h2>
              <p style={{ color: 'rgba(226,234,243,0.65)', fontSize: 14, fontWeight: 300, fontFamily: 'Tajawal' }}>
                {mode === "login" ? t("common:auth.loginSubtitle") : mode === "signup" ? t("common:auth.signupSubtitle") : t("common:auth.forgotSubtitle")}
              </p>
            </div>

            {/* Session ended banners. Two distinct reasons, two distinct
                colours, so the user knows whether the system kicked them
                for inactivity (blue, expected) or whether their refresh
                token died from being away too long (amber, transient). */}
            {mode === "login" && searchParams.get("reason") === "session_expired" && (
              <div
                role="alert"
                className="mb-5 rounded-xl p-3 text-xs text-right"
                style={{
                  background: '#FFF7E6',
                  border: '1px solid #F5D38A',
                  color: '#7A4A00',
                  fontFamily: 'Tajawal',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{t("common:auth.sessionExpiredTitle")}</div>
                <div>{t("common:auth.sessionExpiredBody")}</div>
              </div>
            )}
            {mode === "login" && searchParams.get("reason") === "session_timeout" && (
              <div
                role="alert"
                className="mb-5 rounded-xl p-3 text-xs text-right"
                style={{
                  background: '#EAF2FB',
                  border: '1px solid #B7D2EE',
                  color: '#1B3E6F',
                  fontFamily: 'Tajawal',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{t("common:auth.sessionTimeoutTitle")}</div>
                <div>{t("common:auth.sessionTimeoutBody")}</div>
              </div>
            )}

            {/* Biometric */}
            {mode === "login" && supportsPasskeys && savedEmail && (
              <button
                onClick={handleBiometricSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-11 rounded-xl text-sm transition-all mb-3"
                style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.07)', color: '#FFFFFF', fontWeight: 400 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
              >
                <ScanFace className="h-5 w-5" style={{ color: '#FFFFFF' }} />
                {t("common:auth.faceId")}
              </button>
            )}

            {/* Google */}
            {mode !== "forgot" && (
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 h-11 rounded-xl text-sm transition-all mb-5"
                style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.07)', color: '#FFFFFF', fontWeight: 400, fontFamily: 'Tajawal' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t("common:auth.google")}
              </button>
            )}

            {/* Divider */}
            {mode !== "forgot" && (
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
                <span style={{ color: 'rgba(226,234,243,0.45)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.or")}</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
              </div>
            )}

            {/* Offline notice — sign-in always needs a live connection */}
            {isOffline && (
              <div dir="rtl" className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                لا يوجد اتصال بالإنترنت — تسجيل الدخول يحتاج اتصالاً. إذا سبق أن سجّلت الدخول على هذا الجهاز، أغلق هذه الصفحة وافتح البرنامج مباشرة وسيعمل بلا إنترنت.
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">

              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.fullName")}</label>
                      <input
                        type="text"
                        placeholder={t("common:auth.fullNamePlaceholder")}
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        required
                        className="w-full h-11 rounded-xl px-4 text-sm outline-none transition-all"
                        style={inputStyle}
                        {...inputFocusHandlers}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.businessName")}</label>
                      <input
                        type="text"
                        placeholder={t("common:auth.businessNamePlaceholder")}
                        value={businessName}
                        onChange={e => setBusinessName(e.target.value)}
                        required
                        className="w-full h-11 rounded-xl px-4 text-sm outline-none transition-all"
                        style={inputStyle}
                        {...inputFocusHandlers}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.phone")}</label>
                    <div className="flex gap-2" dir="ltr">
                      <select
                        value={countryCode}
                        onChange={e => setCountryCode(e.target.value)}
                        className="h-11 rounded-xl px-2 text-sm outline-none transition-all shrink-0"
                        style={{ ...inputStyle, minWidth: 110, appearance: 'auto' }}
                        aria-label={t("common:auth.countryCode")}
                      >
                        <option value="+970">🇵🇸 +970</option>
                        <option value="+972">🇮🇱 +972</option>
                        <option value="+962">🇯🇴 +962</option>
                        <option value="+966">🇸🇦 +966</option>
                        <option value="+971">🇦🇪 +971</option>
                        <option value="+974">🇶🇦 +974</option>
                        <option value="+965">🇰🇼 +965</option>
                        <option value="+973">🇧🇭 +973</option>
                        <option value="+968">🇴🇲 +968</option>
                        <option value="+961">🇱🇧 +961</option>
                        <option value="+20">🇪🇬 +20</option>
                        <option value="+964">🇮🇶 +964</option>
                        <option value="+90">🇹🇷 +90</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                      </select>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="59XXXXXXX"
                        value={phoneLocal}
                        onChange={e => setPhoneLocal(e.target.value.replace(/[^\d]/g, ""))}
                        required
                        maxLength={12}
                        className="flex-1 h-11 rounded-xl px-4 text-sm outline-none transition-all"
                        style={inputStyle}
                        {...inputFocusHandlers}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.businessType")}</label>
                      <select
                        value={businessType}
                        onChange={e => setBusinessType(e.target.value)}
                        className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-all"
                        style={{ ...inputStyle, appearance: 'auto' }}
                      >
                        <option value="">{t("common:auth.choose")}</option>
                        <option value="retail">{t("common:auth.typeRetail")}</option>
                        <option value="wholesale">{t("common:auth.typeWholesale")}</option>
                        <option value="restaurant">{t("common:auth.typeRestaurant")}</option>
                        <option value="services">{t("common:auth.typeServices")}</option>
                        <option value="manufacturing">{t("common:auth.typeManufacturing")}</option>
                        <option value="contracting">{t("common:auth.typeContracting")}</option>
                        <option value="accounting_office">{t("common:auth.typeAccountingOffice")}</option>
                        <option value="other">{t("common:auth.typeOther")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.companySize")}</label>
                      <select
                        value={employeesCount}
                        onChange={e => setEmployeesCount(e.target.value)}
                        className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-all"
                        style={{ ...inputStyle, appearance: 'auto' }}
                      >
                        <option value="">{t("common:auth.choose")}</option>
                        <option value="1">{t("common:auth.size1")}</option>
                        <option value="2-5">{t("common:auth.size2")}</option>
                        <option value="6-20">{t("common:auth.size3")}</option>
                        <option value="21-50">{t("common:auth.size4")}</option>
                        <option value="51-200">{t("common:auth.size5")}</option>
                        <option value="200+">{t("common:auth.size6")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.address")}</label>
                    <input
                      type="text"
                      placeholder={t("common:auth.addressPlaceholder")}
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-all"
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
              {/* Email */}
              <div className="space-y-1.5">
                <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.email")}</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'rgba(226,234,243,0.45)' }} />
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
                    <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.password")}</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="transition-colors"
                        style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#4DA3FF'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(226,234,243,0.65)'; }}
                      >
                        {t("common:auth.forgotPassword")}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'rgba(226,234,243,0.45)' }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "signup" ? t("common:auth.passwordHint") : "••••••••"}
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
                      style={{ color: 'rgba(226,234,243,0.45)' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm password */}
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label style={{ color: 'rgba(226,234,243,0.65)', fontSize: 12, fontWeight: 300 }}>{t("common:auth.confirmPassword")}</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'rgba(226,234,243,0.45)' }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={t("common:auth.confirmPassword")}
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
                      style={{ color: 'rgba(226,234,243,0.45)' }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Terms */}
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'rgba(226,234,243,0.65)', fontWeight: 300 }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: '#2F7CF6' }}
                  />
                  <span>
                    {t("common:auth.agreeTo")}{" "}
                    <Link to="/terms" style={{ color: '#4DA3FF' }} className="hover:underline">{t("common:auth.terms")}</Link>
                    {" "}{t("common:auth.and")}{" "}
                    <Link to="/privacy" style={{ color: '#4DA3FF' }} className="hover:underline">{t("common:auth.privacy")}</Link>
                  </span>
                </label>
              )}

              {/* Submit — solid navy, no gradient */}
              <button
                type="submit"
                disabled={loading || (mode === "signup" && !agreedToTerms)}
                className="w-full h-11 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-1"
                style={{
                  background: '#2F7CF6',
                  color: '#FFFFFF',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  boxShadow: '0 8px 24px rgba(47,124,246,0.35)',
                  fontFamily: 'Tajawal',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#4DA3FF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2F7CF6'; }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? t("common:auth.submitLogin") : mode === "signup" ? t("common:auth.submitSignup") : t("common:auth.submitForgot")}
              </button>

              {mode === "login" && unconfirmedEmail && (
                <div className="rounded-xl p-3 text-xs space-y-2" style={{ background: '#FFF7E6', border: '1px solid #F5D38A', color: '#7A4A00', fontFamily: 'Tajawal' }}>
                  <p>{t("common:auth.unconfirmedNote")}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/auth/verify?type=signup&email=${encodeURIComponent(unconfirmedEmail)}`)}
                      className="px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: '#2F7CF6', color: '#FFFFFF', fontWeight: 400 }}
                    >
                      {t("common:auth.enterCode")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmedEmail });
                          if (error) throw error;
                          toast({ title: "تم إرسال رمز جديد ✅", description: `تحقق من بريد ${unconfirmedEmail}` });
                          navigate(`/auth/verify?type=signup&email=${encodeURIComponent(unconfirmedEmail)}`);
                        } catch (err: any) {
                          toast({ title: "تعذّر الإرسال", description: err.message, variant: "destructive" });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'rgba(255,255,255,0.07)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.25)', fontWeight: 400 }}
                    >
                      {t("common:auth.resendCode")}
                    </button>
                  </div>
                </div>
              )}

              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={sendHrResetRequest}
                  disabled={loading}
                  className="w-full h-11 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.25)',
                    fontWeight: 400,
                    letterSpacing: '0.02em',
                    fontFamily: 'Tajawal',
                  }}
                >
                  {t("common:auth.hrRequest")}
                </button>
              )}
            </form>

            {/* Links */}
            <div className="text-center space-y-3 mt-5">
              {mode === "login" && (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <div className="text-start flex-1 min-w-0">
                    <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 400 }}>{t("common:auth.trialTitle")}</p>
                    <p className="leading-snug" style={{ color: 'rgba(226,234,243,0.65)', fontSize: 11, fontWeight: 300 }}>{t("common:auth.trialSubtitle")}</p>
                  </div>
                  <button
                    onClick={() => setMode("signup")}
                    className="px-4 py-2 rounded-lg text-xs transition-all whitespace-nowrap shrink-0"
                    style={{ background: '#2F7CF6', color: '#FFFFFF', fontWeight: 400 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#4DA3FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#2F7CF6'; }}
                  >
                    {t("common:auth.startTrial")}
                  </button>
                </div>
              )}
              {mode === "signup" && (
                <p style={{ color: 'rgba(226,234,243,0.65)', fontSize: 14, fontWeight: 300 }}>
                  {t("common:auth.haveAccount")}{" "}
                  <button onClick={() => setMode("login")} className="hover:underline" style={{ color: '#4DA3FF', fontWeight: 400 }}>{t("common:auth.submitLogin")}</button>
                </p>
              )}
              {mode === "forgot" && (
                <p style={{ color: 'rgba(226,234,243,0.65)', fontSize: 14, fontWeight: 300 }}>
                  <button onClick={() => setMode("login")} className="hover:underline" style={{ color: '#4DA3FF', fontWeight: 400 }}>{t("common:auth.backToLogin")}</button>
                </p>
              )}
              {mode === "forgot" && (
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(226,234,243,0.65)', fontWeight: 300 }}>
                  {t("common:auth.forgotHint")}
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
