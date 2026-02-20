import { useState, useEffect } from "react";
import { Loader2, Fingerprint, ScanFace, Lock, Key, Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

interface PasskeyOnboardingProps {
  onComplete: () => void;
}

const PasskeyOnboarding = ({ onComplete }: PasskeyOnboardingProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: options, error: optErr } = await supabase.functions.invoke("webauthn", {
        body: { action: "register-options" },
      });
      if (optErr || options?.error) throw new Error(options?.error || optErr?.message);

      const credential = await startRegistration({ optionsJSON: {
        ...options,
        challenge: options.challenge,
        rp: options.rp,
        user: { ...options.user, id: options.user.id },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: options.excludeCredentials,
        timeout: options.timeout,
      }});

      const { data: result, error: verErr } = await supabase.functions.invoke("webauthn", {
        body: {
          action: "register-verify",
          credential: {
            id: credential.id,
            publicKey: credential.response.publicKey || btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject as unknown as ArrayBuffer))),
          },
          deviceName: "جهازي",
        },
      });
      if (verErr || result?.error) throw new Error(result?.error || verErr?.message);

      localStorage.setItem("passkey_email", user.email || "");
      localStorage.setItem("passkey_onboarding_done", "true");
      toast({ title: "تم تفعيل تسجيل الدخول البيومتري ✅", description: "يمكنك الآن الدخول بالبصمة أو Face ID" });
      onComplete();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        toast({ title: "تم الإلغاء", description: "يمكنك التفعيل لاحقاً من الإعدادات", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("passkey_onboarding_done", "true");
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-between px-6 py-12" dir="rtl">
      {/* Top Content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-foreground leading-tight mb-4">
          سجّل دخولك بأمان
          <br />
          عبر أجهزتك المختلفة
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-10">
          مفاتيح المرور تُحفظ في مدير كلمات المرور الخاص بك،
          <br />
          فتستطيع تسجيل الدخول بالبصمة أو Face ID
          <br />
          من أي جهاز تستخدمه.
        </p>

        {/* Illustration */}
        <div className="relative w-64 h-48 mb-8">
          {/* Central Key */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg shadow-primary/10 animate-pulse">
            <Key className="h-8 w-8 text-primary" />
          </div>
          
          {/* Face ID - top left */}
          <div className="absolute top-2 left-4 w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ScanFace className="h-6 w-6 text-blue-500" />
          </div>

          {/* Lock - top right */}
          <div className="absolute top-0 right-8 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          
          {/* Fingerprint - bottom right */}
          <div className="absolute bottom-4 right-4 w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Fingerprint className="h-6 w-6 text-emerald-500" />
          </div>

          {/* Phone - bottom left */}
          <div className="absolute bottom-2 left-8 w-11 h-11 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-orange-500" />
          </div>

          {/* Shield - top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-violet-500" />
          </div>

          {/* Connecting dots */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 192">
            <circle cx="128" cy="96" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3" />
            <circle cx="128" cy="96" r="72" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.15" />
          </svg>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="w-full max-w-sm space-y-3">
        <Button
          onClick={handleEnable}
          disabled={loading}
          className="w-full h-14 rounded-2xl text-base font-semibold gap-2 shadow-lg shadow-primary/20"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Fingerprint className="h-5 w-5" />
          )}
          إضافة مفتاح مرور
        </Button>
        <button
          onClick={handleSkip}
          className="w-full py-3 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          تخطي
        </button>
      </div>
    </div>
  );
};

export default PasskeyOnboarding;
