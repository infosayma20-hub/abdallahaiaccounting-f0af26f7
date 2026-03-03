import { useState, useEffect } from "react";
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
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
      // Always sign out first to clear any cached session
      await supabase.auth.signOut();
      
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          prompt: "select_account",
        },
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
      navigate("/");
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

  // Dynamic titles per mode
  const titles: Record<Mode, { heading: string; sub: string }> = {
    login: { heading: "عبدالله AI للمحاسبة", sub: "حوّل كلامك إلى قيود محاسبية فوراً" },
    signup: { heading: "أنشئ حسابك خلال 10 ثواني", sub: "ابدأ باستخدام المحاسبة الذكية فوراً" },
    forgot: { heading: "استعادة كلمة المرور", sub: "أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo & Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3" style={{ width: 72, height: 72 }}>
            <span className="text-3xl font-bold text-primary">ع</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{titles[mode].heading}</h1>
          <p className="text-sm text-muted-foreground">{titles[mode].sub}</p>
        </div>

        {/* Biometric (returning users only) */}
        {mode === "login" && supportsPasskeys && savedEmail && (
          <Button variant="outline" className="w-full gap-3 h-14 text-base border-primary/20 hover:bg-primary/5" onClick={handleBiometricSignIn} disabled={loading}>
            <ScanFace className="h-6 w-6 text-primary" />
            <span className="text-foreground font-semibold">تسجيل الدخول بـ Face ID</span>
          </Button>
        )}

        {/* Google CTA */}
        {mode !== "forgot" && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full gap-3 h-14 text-base border-border hover:bg-muted/50 shadow-sm" onClick={handleGoogleSignIn} disabled={loading}>
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="font-semibold">{mode === "signup" ? "🚀 دخول سريع باستخدام Google" : "ابدأ الآن باستخدام Google"}</span>
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              {mode === "signup" ? "لن نطلب بطاقة ائتمان" : "الدخول السريع الموصى به"}
            </p>
          </div>
        )}

        {/* Divider */}
        {mode !== "forgot" && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {mode === "signup" ? "أو أنشئ حساب بالبريد الإلكتروني" : "أو استخدم بريدك الإلكتروني"}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Email Form */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input type="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pr-10" dir="ltr" style={{ textAlign: "left" }} />
              </div>
              {mode !== "forgot" && (
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pr-10" dir="ltr" style={{ textAlign: "left" }} />
                </div>
              )}
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer" dir="rtl">
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
                  <span>
                    أوافق على{" "}
                    <Link to="/terms" className="text-primary hover:underline">الشروط</Link>
                    {" "}و{" "}
                    <Link to="/privacy" className="text-primary hover:underline">سياسة الخصوصية</Link>
                  </span>
                </label>
              )}
              <Button type="submit" className="w-full h-12 gap-2 text-base font-semibold rounded-xl shadow-md shadow-primary/20" disabled={loading || (mode === "signup" && !agreedToTerms)}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "دخول" : mode === "signup" ? "إنشاء حساب مجاني" : "إرسال رابط الاستعادة"}
              </Button>
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
                <button onClick={() => setMode("signup")} className="text-primary font-semibold hover:underline">أنشئ حساب مجاناً</button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p className="text-sm text-muted-foreground">
              لديك حساب؟{" "}
              <button onClick={() => setMode("login")} className="text-primary font-semibold hover:underline">تسجيل الدخول</button>
            </p>
          )}
          {mode === "forgot" && (
            <p className="text-sm text-muted-foreground">
              <button onClick={() => setMode("login")} className="text-primary font-semibold hover:underline">العودة لتسجيل الدخول</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
