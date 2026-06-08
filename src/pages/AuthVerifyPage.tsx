import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import amwaliLogoFull from "@/assets/amwali-logo-tall.png";

type VerifyType = "signup" | "recovery";

const AuthVerifyPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const email = (params.get("email") || "").trim().toLowerCase();
  const type = (params.get("type") as VerifyType) || "signup";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!email) navigate("/auth", { replace: true });
    inputRef.current?.focus();
  }, [email, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6 || token.length > 8) {
      toast({ title: "رمز غير صالح", description: "الرجاء إدخال الرمز كاملاً (6 إلى 8 أرقام)", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: type === "recovery" ? "recovery" : "signup",
      });
      if (error) throw error;
      if (type === "recovery") {
        toast({ title: "تم التحقق ✅", description: "الرجاء تعيين كلمة المرور الجديدة" });
        navigate("/reset-password?force=1", { replace: true });
      } else {
        toast({ title: "تم تأكيد حسابك ✅", description: "أهلاً بك في أموالي" });
        navigate("/onboarding", { replace: true });
      }
    } catch (err: any) {
      toast({
        title: "فشل التحقق",
        description: err?.message?.includes("expired")
          ? "الرمز منتهي الصلاحية، اطلب رمزاً جديداً"
          : err?.message?.includes("invalid")
          ? "الرمز غير صحيح، تأكد منه أو اطلب رمزاً جديداً"
          : err?.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      if (type === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resend({ type: "signup", email });
        if (error) throw error;
      }
      toast({ title: "تم إرسال رمز جديد ✅", description: `تحقق من بريد ${email}` });
      setResendCooldown(60);
    } catch (err: any) {
      toast({ title: "تعذّر إعادة الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#FFFFFF" }} dir="rtl">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-6">
          <img src={amwaliLogoFull} alt="amwali" className="h-32 w-auto" draggable={false} />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: "#F7F8FA" }}>
            <Mail size={26} style={{ color: "#0D1B2E" }} />
          </div>
          <h1 style={{ color: "#071D49", fontSize: 26, fontWeight: 300, fontFamily: "Tajawal", marginBottom: 8 }}>
            {type === "recovery" ? "تأكيد إعادة تعيين كلمة المرور" : "تأكيد بريدك الإلكتروني"}
          </h1>
          <p style={{ color: "#8896A4", fontSize: 14, fontWeight: 300, fontFamily: "Tajawal", lineHeight: 1.7 }}>
            أرسلنا رمز التحقق إلى<br />
            <strong style={{ color: "#0D1B2E", direction: "ltr", display: "inline-block" }}>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="00000000"
            className="w-full h-16 rounded-xl text-center"
            style={{
              background: "#F7F8FA",
              border: "1px solid #E8EDF2",
              color: "#0D1B2E",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "10px",
              fontFamily: "Consolas, Menlo, monospace",
              direction: "ltr",
            }}
          />

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full h-12 rounded-xl text-white text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: "#0D1B2E", fontWeight: 500, fontFamily: "Tajawal" }}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <>تأكيد <ArrowRight size={16} /></>}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
            className="text-sm transition-opacity disabled:opacity-50"
            style={{ color: "#0D1B2E", fontFamily: "Tajawal", fontWeight: 400 }}
          >
            {resendCooldown > 0 ? `إعادة الإرسال خلال ${resendCooldown}s` : "لم يصلك الرمز؟ أعد الإرسال"}
          </button>
          <div>
            <Link to="/auth" className="text-xs" style={{ color: "#8896A4", fontFamily: "Tajawal" }}>
              ← العودة لتسجيل الدخول
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed" style={{ color: "#8896A4", fontFamily: "Tajawal" }}>
          تحقق من مجلد <strong>Spam / غير المرغوب فيها</strong> إذا لم يصلك الرمز خلال دقيقة.
        </p>
      </div>
    </div>
  );
};

export default AuthVerifyPage;