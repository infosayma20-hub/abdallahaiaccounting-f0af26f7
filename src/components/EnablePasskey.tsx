import { useState } from "react";
import { ScanFace, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

const EnablePasskey = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);

  if (!browserSupportsWebAuthn()) return null;

  const handleEnable = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get registration options
      const { data: options, error: optErr } = await supabase.functions.invoke("webauthn", {
        body: { action: "register-options" },
      });
      if (optErr || options?.error) throw new Error(options?.error || optErr?.message);

      // Trigger biometric registration (Face ID / fingerprint)
      const credential = await startRegistration({ optionsJSON: {
        ...options,
        challenge: options.challenge,
        rp: options.rp,
        user: {
          ...options.user,
          id: options.user.id,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: options.excludeCredentials,
        timeout: options.timeout,
      }});

      // Save credential
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

      // Save email for quick biometric login
      localStorage.setItem("passkey_email", user.email || "");
      setEnabled(true);
      toast({ title: "تم تفعيل Face ID بنجاح ✅", description: "يمكنك الآن تسجيل الدخول باستخدام Face ID" });
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        toast({ title: "تم الإلغاء", description: "لم يتم تفعيل Face ID", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (enabled) {
    return (
      <Card className="border-0 shadow-sm border-primary/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Face ID مفعّل</p>
            <p className="text-[10px] text-muted-foreground">يمكنك تسجيل الدخول بسرعة</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={handleEnable}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ScanFace className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">تفعيل Face ID</p>
            <p className="text-[10px] text-muted-foreground">تسجيل دخول سريع وآمن</p>
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Button size="sm" variant="outline" className="text-xs">تفعيل</Button>
        )}
      </CardContent>
    </Card>
  );
};

export default EnablePasskey;
