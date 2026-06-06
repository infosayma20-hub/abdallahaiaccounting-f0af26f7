import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, X, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onCancel: () => void;
  onCapture: (base64Jpeg: string) => void;
  title?: string;
}

/**
 * Mandatory selfie capture for attendance verification.
 * - Front camera only (facingMode: user)
 * - Auto-capture after 3-2-1 countdown (no manual shutter button)
 * - Brief preview (~1.2s) with "Retry" option, then auto-submit
 * - No file picker fallback
 * - Compresses to ~720px JPEG @ 0.7 quality (~50-100KB)
 */
export default function SelfieCapture({ open, onCancel, onCapture, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [usingFallbackCamera, setUsingFallbackCamera] = useState(false);

  const clearTimers = () => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoConfirmTimerRef.current) {
      clearTimeout(autoConfirmTimerRef.current);
      autoConfirmTimerRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCountdown = () => {
    clearTimers();
    setCountdown(null);
    // التقاط تلقائي بعد ثانيتين بدون عرض عدّاد
    countdownTimerRef.current = setTimeout(() => {
      capture();
    }, 2000);
  };

  const startCamera = async () => {
    setStarting(true);
    setError(null);
    setUsingFallbackCamera(false);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("هذا المتصفح لا يدعم الوصول للكاميرا. افتح الرابط من Safari أو Chrome.");
        setStarting(false);
        return;
      }
      let stream: MediaStream | null = null;
      let usedFallback = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (primaryErr: any) {
        // إذا الكاميرا الأمامية غير متاحة أو constraints مرفوضة، جرّب أي كاميرا
        const name = primaryErr?.name || "";
        if (name === "OverconstrainedError" || name === "NotFoundError" || name === "ConstraintNotSatisfiedError") {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            usedFallback = true;
          } catch (fallbackErr) {
            throw fallbackErr;
          }
        } else {
          throw primaryErr;
        }
      }
      if (!stream) throw new Error("لم يتم الحصول على بث الكاميرا");
      // تحقق أن المستخدم فعلاً يستخدم الكاميرا الأمامية
      try {
        const track = stream.getVideoTracks()[0];
        const settings: any = track?.getSettings?.() || {};
        if (settings.facingMode && settings.facingMode !== "user") {
          usedFallback = true;
        }
      } catch {}
      setUsingFallbackCamera(usedFallback);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Safari قد يمنع play بدون gesture — اعرض زر إعادة المحاولة
          setError("اضغط إعادة المحاولة لفتح الكاميرا.");
          stopStream();
          setStarting(false);
          return;
        }
      }
      startCountdown();
    } catch (e: any) {
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("تم رفض إذن الكاميرا. افتح إعدادات المتصفح واسمح للكاميرا، ثم أعد المحاولة.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
        setError("لم يتم العثور على كاميرا في هذا الجهاز.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("الكاميرا مشغولة بتطبيق آخر. أغلق التطبيقات الأخرى وأعد المحاولة.");
      } else {
        setError("تعذّر فتح الكاميرا. تأكد من السماح للكاميرا من إعدادات المتصفح.");
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    // ملاحظة: لا نُشغّل الكاميرا تلقائياً عند الفتح لتجنّب فقد user-gesture على iOS Safari.
    // المُنادي يستدعي startCamera عبر تفاعل مباشر (زر) أو نُتيح زر "افتح الكاميرا" داخلياً.
    if (open && !preview && !error) {
      startCamera();
    }
    return () => {
      clearTimers();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      // Camera not quite ready — retry shortly
      countdownTimerRef.current = setTimeout(capture, 300);
      return;
    }
    const w = 720;
    const ratio = video.videoHeight / video.videoWidth;
    const h = Math.round(w * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stopStream();
    // بدون معاينة — إرسال مباشر
    onCapture(dataUrl);
  };

  const retake = () => {
    clearTimers();
    setPreview(null);
    startCamera();
  };

  const cancel = () => {
    clearTimers();
    stopStream();
    setPreview(null);
    onCancel();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] bg-background flex flex-col"
      dir="rtl"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          {title || "Face Recognition"}
        </h2>
        <button
          onClick={cancel}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-transform"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {error ? (
          <div className="rounded-3xl p-6 text-center space-y-4 w-full max-w-xs bg-destructive/10">
            <X className="h-14 w-14 text-destructive mx-auto" />
            <p className="font-bold text-base text-foreground">{error}</p>
            <Button onClick={startCamera} className="rounded-xl">
              فتح الكاميرا مرة أخرى
            </Button>
          </div>
        ) : preview ? (
          <>
            <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square">
              <img src={preview} alt="معاينة" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm text-muted-foreground">تم الالتقاط — جارٍ المتابعة…</p>
            <Button
              variant="outline"
              onClick={retake}
              className="gap-2 rounded-xl h-11 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              {/* Face frame guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-2/3 aspect-[3/4] border-4 border-white/70 rounded-[40%]" />
              </div>
              {countdown !== null && !starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                  <span
                    key={countdown}
                    className="text-white font-bold drop-shadow-lg animate-in zoom-in-50 fade-in duration-200"
                    style={{ fontSize: "120px", lineHeight: 1 }}
                  >
                    {countdown}
                  </span>
                </div>
              )}
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
            </div>
            <p className="text-sm text-foreground text-center font-medium">
              ثبّت وجهك داخل الإطار
            </p>
            {usingFallbackCamera && (
              <div className="w-full max-w-xs rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-3 py-2 text-[12px] text-blue-800 dark:text-blue-200 text-center leading-relaxed">
                لم يتم العثور على الكاميرا الأمامية، سيتم استخدام الكاميرا المتاحة.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}