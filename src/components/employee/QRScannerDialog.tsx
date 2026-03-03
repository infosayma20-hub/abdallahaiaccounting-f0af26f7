import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, Loader2, MapPin, CheckCircle2, XCircle } from "lucide-react";
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
        if (state === 2) { // SCANNING
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
      // Parse: BRANCH_ID:TOKEN
      const colonIdx = qrPayload.indexOf(":");
      if (colonIdx === -1) {
        setResult({ success: false, message: "صيغة QR غير صحيحة" });
        setProcessing(false);
        return;
      }
      const branchId = qrPayload.substring(0, colonIdx);
      const token = qrPayload.substring(colonIdx + 1);

      // Get location
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
        // Continue without location - server will decide if location is required
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto p-0 overflow-hidden bg-card border-border" dir="rtl">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base font-semibold">
            {action === "checkin" ? "تسجيل دخول" : "تسجيل خروج"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-4">
          {/* Result overlay */}
          {result && (
            <div className={`rounded-2xl p-6 text-center space-y-3 ${
              result.success ? "bg-primary/10" : "bg-destructive/10"
            }`}>
              {result.success ? (
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              ) : (
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
              )}
              <p className="font-semibold text-sm">{result.message}</p>
              {!result.success && (
                <Button size="sm" variant="outline" onClick={() => { setResult(null); if (mode === "camera") startScanner(); }}>
                  إعادة المحاولة
                </Button>
              )}
            </div>
          )}

          {/* Camera/Manual toggle */}
          {!result && !processing && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={mode === "camera" ? "default" : "outline"}
                  className="flex-1 gap-1.5 rounded-xl"
                  onClick={() => setMode("camera")}
                >
                  <Camera className="h-4 w-4" /> كاميرا
                </Button>
                <Button
                  size="sm"
                  variant={mode === "manual" ? "default" : "outline"}
                  className="flex-1 gap-1.5 rounded-xl"
                  onClick={() => setMode("manual")}
                >
                  <Keyboard className="h-4 w-4" /> يدوي
                </Button>
              </div>

              {mode === "camera" && (
                <div className="rounded-2xl overflow-hidden bg-black aspect-square">
                  <div id={scannerDivId} className="w-full h-full" />
                </div>
              )}

              {mode === "manual" && (
                <div className="space-y-3">
                  <Input
                    placeholder="أدخل رمز QR..."
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    dir="ltr"
                    className="text-center font-mono rounded-xl h-12"
                  />
                  <Button
                    className="w-full h-12 rounded-xl"
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
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">جاري التحقق...</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>سيتم التحقق من موقعك الجغرافي تلقائياً</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
