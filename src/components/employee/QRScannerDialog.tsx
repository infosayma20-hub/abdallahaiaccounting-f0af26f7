import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, Loader2, MapPin, CheckCircle2, XCircle, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "checkin" | "checkout";
  onSuccess: () => void;
}

export default function QRScannerDialog({ open, onOpenChange, action, onSuccess }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = "qr-reader-employee";

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      setResult(null);
      setManualInput("");
      setMode("camera");
    }
  }, [open, stopScanner]);

  useEffect(() => {
    if (open && mode === "camera" && !processing && !result) {
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else if (mode === "manual") {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, processing, result]);

  const startScanner = async () => {
    await stopScanner();
    try {
      const html5QrCode = new Html5Qrcode(scannerDivId);
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          processQR(decodedText);
          stopScanner();
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera error:", err);
      setMode("manual");
      toast({ title: "خطأ", description: "لا يمكن الوصول للكاميرا. استخدم الإدخال اليدوي.", variant: "destructive" });
    }
  };

  const processQR = async (qrPayload: string) => {
    if (processing) return;
    setProcessing(true);
    setResult(null);

    try {
      const colonIdx = qrPayload.indexOf(":");
      if (colonIdx === -1) {
        setResult({ success: false, message: "صيغة QR غير صحيحة" });
        setProcessing(false);
        return;
      }
      const branchId = qrPayload.substring(0, colonIdx);
      const token = qrPayload.substring(colonIdx + 1);

      let lat = 0, lng = 0;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 15000,
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (geoErr) {
        console.warn("Geolocation failed, proceeding without location:", geoErr);
        const code = (geoErr as GeolocationPositionError)?.code;
        let msg = "تعذّر الوصول لخدمات الموقع (GPS).";
        if (code === 1) msg = "صلاحية الموقع مرفوضة. فعّل GPS واسمح للمتصفح بالوصول للموقع، ثم أعد المحاولة.";
        else if (code === 2) msg = "إشارة GPS غير متوفرة. تأكد من تفعيل خدمات الموقع وحاول في مكان مفتوح.";
        else if (code === 3) msg = "انتهت مهلة تحديد الموقع. تأكد من تفعيل GPS وأعد المحاولة.";
        setResult({ success: false, message: msg });
        setProcessing(false);
        return;
      }

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/attendance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action,
            branch_id: branchId,
            qr_token: token,
            latitude: lat,
            longitude: lng,
            device_info: navigator.userAgent.substring(0, 100),
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        setResult({ success: false, message: data.error || "حدث خطأ" });
      } else {
        setResult({ success: true, message: data.message });
        setTimeout(() => {
          onSuccess();
          onOpenChange(false);
        }, 1500);
      }
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    }
    setProcessing(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" dir="rtl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-bold text-foreground">
          {action === "checkin" ? "📥 تسجيل دخول" : "📤 تسجيل خروج"}
        </h2>
        <button
          onClick={() => onOpenChange(false)}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-transform"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {/* Result */}
        {result && (
          <div className={`rounded-3xl p-8 text-center space-y-4 w-full max-w-xs ${
            result.success ? "bg-emerald-500/10" : "bg-destructive/10"
          }`}>
            {result.success ? (
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
            ) : (
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
            )}
            <p className="font-bold text-lg text-foreground">{result.message}</p>
            {!result.success && (
              <Button
                variant="outline"
                className="rounded-xl active:scale-95 transition-transform"
                onClick={() => { setResult(null); if (mode === "camera") startScanner(); }}
              >
                إعادة المحاولة
              </Button>
            )}
          </div>
        )}

        {/* Camera/Manual toggle */}
        {!result && !processing && (
          <>
            <div className="flex gap-2 w-full max-w-xs">
              <Button
                size="lg"
                variant={mode === "camera" ? "default" : "outline"}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95 transition-transform"
                onClick={() => setMode("camera")}
              >
                <Camera className="h-4 w-4" /> كاميرا
              </Button>
              <Button
                size="lg"
                variant={mode === "manual" ? "default" : "outline"}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95 transition-transform"
                onClick={() => setMode("manual")}
              >
                <Keyboard className="h-4 w-4" /> يدوي
              </Button>
            </div>

            {mode === "camera" && (
              <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square">
                <div id={scannerDivId} className="w-full h-full" />
              </div>
            )}

            {mode === "manual" && (
              <div className="space-y-3 w-full max-w-xs">
                <Input
                  placeholder="أدخل رمز QR..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  dir="ltr"
                  className="text-center font-mono rounded-xl h-14 text-lg"
                />
                <Button
                  className="w-full h-14 rounded-xl text-base active:scale-[0.97] transition-transform"
                  disabled={!manualInput.trim()}
                  onClick={() => processQR(manualInput.trim())}
                >
                  تأكيد
                </Button>
              </div>
            )}
          </>
        )}

        {processing && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري التحقق من البصمة...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground px-4 py-3">
        <MapPin className="h-3 w-3 shrink-0" />
        <span>سيتم التحقق من موقعك الجغرافي تلقائياً</span>
      </div>
    </div>
  );
}
