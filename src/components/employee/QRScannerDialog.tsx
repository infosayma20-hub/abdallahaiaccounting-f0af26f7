import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, Loader2, MapPin, CheckCircle2, XCircle, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SelfieCapture from "./SelfieCapture";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "checkin" | "checkout";
  onSuccess: () => void;
  /**
   * Employee's assigned branch id. When provided and the branch requires a
   * selfie, we prompt for the selfie BEFORE opening the QR scanner so the
   * camera permission is requested from a clean user gesture (iOS Safari).
   */
  employeeBranchId?: string | null;
}

export default function QRScannerDialog({ open, onOpenChange, action, onSuccess, employeeBranchId }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState<{ branchId: string; token: string; lat: number; lng: number } | null>(null);
  const [awaitingSelfieGesture, setAwaitingSelfieGesture] = useState(false);
  /** Selfie captured BEFORE QR scan (when employee's branch requires it). */
  const [prefetchedSelfie, setPrefetchedSelfie] = useState<{ branchId: string; base64: string } | null>(null);
  /** Did employee's branch require an up-front selfie? null = not yet checked. */
  const [upfrontSelfieRequired, setUpfrontSelfieRequired] = useState<boolean | null>(null);
  const [checkingBranch, setCheckingBranch] = useState(false);
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
      setAwaitingSelfieGesture(false);
      setPendingScan(null);
      setPrefetchedSelfie(null);
      setUpfrontSelfieRequired(null);
      setCheckingBranch(false);
    }
  }, [open, stopScanner]);

  // On open: check if employee's branch requires a selfie. If yes, defer the
  // QR scanner and show the "open front camera" gesture card first.
  useEffect(() => {
    if (!open) return;
    if (upfrontSelfieRequired !== null) return;
    let cancelled = false;
    (async () => {
      if (!employeeBranchId) {
        if (!cancelled) setUpfrontSelfieRequired(false);
        return;
      }
      setCheckingBranch(true);
      try {
        const { data } = await supabase
          .from("branches")
          .select("require_attendance_selfie")
          .eq("id", employeeBranchId)
          .maybeSingle();
        if (cancelled) return;
        const req = !!data?.require_attendance_selfie;
        setUpfrontSelfieRequired(req);
        if (req) setAwaitingSelfieGesture(true);
      } catch {
        if (!cancelled) setUpfrontSelfieRequired(false);
      } finally {
        if (!cancelled) setCheckingBranch(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, employeeBranchId, upfrontSelfieRequired]);

  useEffect(() => {
    // Don't start QR scanner until: branch check done AND (no upfront selfie required OR selfie already captured).
    const selfieGate = upfrontSelfieRequired === false || !!prefetchedSelfie;
    if (open && mode === "camera" && !processing && !result && !awaitingSelfieGesture && !selfieOpen && !checkingBranch && selfieGate) {
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else if (mode === "manual") {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, processing, result, awaitingSelfieGesture, selfieOpen, checkingBranch, upfrontSelfieRequired, prefetchedSelfie]);

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

      // إذا التقطنا السلفي مسبقاً لنفس الفرع، استخدمها مباشرة.
      if (prefetchedSelfie && prefetchedSelfie.branchId === branchId) {
        await stopScanner();
        let lat = 0, lng = 0;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true, timeout: 15000,
            })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {}
        await submitAttendance(branchId, token, lat, lng, prefetchedSelfie.base64);
        return;
      }

      // افحص اشتراط السيلفي أولاً قبل أي عمليات طويلة (GPS) كي لا نكسر user-gesture على iOS.
      const { data: branchRow } = await supabase
        .from("branches")
        .select("require_attendance_selfie")
        .eq("id", branchId)
        .maybeSingle();

      if (branchRow?.require_attendance_selfie && (action === "checkin" || action === "checkout")) {
        // أوقف ماسح QR تماماً قبل أي محاولة لفتح الكاميرا الأمامية (iOS لا يسمح بـ stream مزدوج).
        await stopScanner();
        setPendingScan({ branchId, token, lat: 0, lng: 0 });
        setProcessing(false);
        // اعرض شاشة وسيطة تتطلب نقرة مستخدم لفتح الكاميرا (gesture جديد لـ Safari).
        setAwaitingSelfieGesture(true);
        return;
      }

      // الفرع لا يتطلب سيلفي — كمل بـ GPS ثم attendance كالمعتاد.
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
        lat = 0;
        lng = 0;
      }

      await submitAttendance(branchId, token, lat, lng, null);
    } catch (e: any) {
      setResult({ success: false, message: e.message });
      setProcessing(false);
    }
  };

  const submitAttendance = async (
    branchId: string,
    token: string,
    lat: number,
    lng: number,
    selfieBase64: string | null,
  ) => {
    setProcessing(true);
    try {
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
            selfie_base64: selfieBase64,
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

  const handleSelfieCapture = async (base64: string) => {
    setSelfieOpen(false);
    setAwaitingSelfieGesture(false);
    // الحالة الجديدة: التُقطت السلفي قبل QR — خزّنها وافتح ماسح QR الآن.
    if (!pendingScan && upfrontSelfieRequired && employeeBranchId) {
      setPrefetchedSelfie({ branchId: employeeBranchId, base64 });
      return;
    }
    if (!pendingScan) return;
    const scan = pendingScan;
    setPendingScan(null);
    // الآن نأخذ GPS بعد التقاط السيلفي بنجاح (إذا لم يكن متوفراً).
    let lat = scan.lat;
    let lng = scan.lng;
    if (!lat && !lng) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 15000,
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // السيرفر يقرر حسب require_gps
      }
    }
    await submitAttendance(scan.branchId, scan.token, lat, lng, base64);
  };

  const handleSelfieCancel = () => {
    setSelfieOpen(false);
    setAwaitingSelfieGesture(false);
    setPendingScan(null);
    if (upfrontSelfieRequired && !prefetchedSelfie) {
      // المستخدم ألغى السلفي قبل QR — أغلق النافذة كلياً.
      onOpenChange(false);
      return;
    }
    setResult({ success: false, message: "الكاميرا مطلوبة لتسجيل البصمة في هذا الفرع." });
  };

  const openSelfieFromGesture = () => {
    // يجب أن تُستدعى من onClick مباشرة — لا awaits قبلها — لتأمين user-gesture على iOS.
    setAwaitingSelfieGesture(false);
    setSelfieOpen(true);
  };

  if (!open) return null;

  return (
    <>
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
        {/* Awaiting user gesture to open front camera (iOS Safari requirement) */}
        {awaitingSelfieGesture && !result && !processing && (
          <div className="rounded-3xl p-6 text-center space-y-5 w-full max-w-xs bg-primary/5 border border-primary/20">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="font-bold text-base text-foreground">تم التعرف على الفرع</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                هذا الفرع يتطلب صورة سيلفي. اضغط الزر لفتح الكاميرا الأمامية.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full h-14 rounded-xl text-base font-bold active:scale-[0.97] transition-transform"
              onClick={openSelfieFromGesture}
            >
              <Camera className="h-5 w-5 ml-2" />
              افتح الكاميرا الأمامية
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
          </div>
        )}

        {/* Result */}
        {result && !awaitingSelfieGesture && (
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
        {!result && !processing && !awaitingSelfieGesture && (
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
    <SelfieCapture
      open={selfieOpen}
      onCancel={handleSelfieCancel}
      onCapture={handleSelfieCapture}
      title={action === "checkin" ? "سيلفي تسجيل الدخول" : "سيلفي تسجيل الخروج"}
    />
    </>
  );
}
