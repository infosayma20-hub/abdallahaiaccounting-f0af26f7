import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, X, Loader2, ScanFace, CheckCircle2 } from "lucide-react";
import * as faceapi from "face-api.js";

interface Props {
  open: boolean;
  onCancel: () => void;
  onCapture: (base64Jpeg: string) => void;
  title?: string;
}

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
let modelLoadPromise: Promise<void> | null = null;
const loadModels = () => {
  if (faceapi.nets.tinyFaceDetector.params) return Promise.resolve();
  if (!modelLoadPromise) {
    modelLoadPromise = faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch((e) => {
      modelLoadPromise = null;
      throw e;
    });
  }
  return modelLoadPromise;
};

/**
 * Face Recognition capture for attendance verification.
 * - Front camera only (facingMode: user)
 * - Uses face-api.js (tinyFaceDetector) to require a real face inside the frame before capture
 * - No preview after capture — immediate submit
 * - Compresses to ~720px JPEG @ 0.7 quality
 */
export default function SelfieCapture({ open, onCancel, onCapture, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noFaceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveDetectionsRef = useRef(0);
  const capturedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [usingFallbackCamera, setUsingFallbackCamera] = useState(false);

  const clearTimers = () => {
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null; }
    if (noFaceTimeoutRef.current) { clearTimeout(noFaceTimeoutRef.current); noFaceTimeoutRef.current = null; }
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startDetectionLoop = () => {
    clearTimers();
    consecutiveDetectionsRef.current = 0;
    setFaceDetected(false);
    capturedRef.current = false;

    detectIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || capturedRef.current) return;
      try {
        const result = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );
        if (result && result.score > 0.5) {
          consecutiveDetectionsRef.current += 1;
          setFaceDetected(true);
          if (consecutiveDetectionsRef.current >= 3) {
            capturedRef.current = true;
            capture();
          }
        } else {
          consecutiveDetectionsRef.current = 0;
          setFaceDetected(false);
        }
      } catch {
        // ignore transient errors
      }
    }, 300);

    // 10s timeout — لو ما اكتشف وجه، عرض رسالة وإعادة محاولة
    noFaceTimeoutRef.current = setTimeout(() => {
      if (!capturedRef.current) {
        clearTimers();
        stopStream();
        setError("لم يتم اكتشاف وجه. تأكد من الإضاءة وثبّت وجهك داخل الإطار، ثم أعد المحاولة.");
      }
    }, 10000);
  };

  const startCamera = async () => {
    setStarting(true);
    setError(null);
    setUsingFallbackCamera(false);
    setFaceDetected(false);

    // Load face detection model (best-effort)
    let modelReady = false;
    setModelsLoading(true);
    try {
      await loadModels();
      modelReady = true;
    } catch (e) {
      console.warn("[SelfieCapture] face-api model load failed; capture will fall back to timer", e);
    } finally {
      setModelsLoading(false);
    }

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
        const name = primaryErr?.name || "";
        if (name === "OverconstrainedError" || name === "NotFoundError" || name === "ConstraintNotSatisfiedError") {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          usedFallback = true;
        } else {
          throw primaryErr;
        }
      }
      if (!stream) throw new Error("لم يتم الحصول على بث الكاميرا");
      try {
        const track = stream.getVideoTracks()[0];
        const settings: any = track?.getSettings?.() || {};
        if (settings.facingMode && settings.facingMode !== "user") usedFallback = true;
      } catch {}
      setUsingFallbackCamera(usedFallback);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          setError("اضغط إعادة المحاولة لفتح الكاميرا.");
          stopStream();
          setStarting(false);
          return;
        }
      }

      if (modelReady) {
        startDetectionLoop();
      } else {
        // fallback: لو الموديل ما اتحمل، التقاط بعد ثانيتين
        capturedRef.current = false;
        fallbackTimerRef.current = setTimeout(() => {
          if (!capturedRef.current) {
            capturedRef.current = true;
            capture();
          }
        }, 2000);
      }
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
    if (open && !error) {
      startCamera();
    }
    return () => {
      clearTimers();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = () => {
    clearTimers();
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setTimeout(capture, 300);
      return;
    }
    const w = 720;
    const ratio = video.videoHeight / video.videoWidth || 1;
    const h = Math.round(w * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stopStream();
    onCapture(dataUrl);
  };

  const cancel = () => {
    clearTimers();
    stopStream();
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
            <Button onClick={startCamera} className="rounded-xl gap-2">
              <RotateCcw className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </div>
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`w-2/3 aspect-[3/4] border-4 rounded-[40%] transition-colors duration-200 ${
                    faceDetected ? "border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)]" : "border-white/70"
                  }`}
                />
              </div>
              {(starting || modelsLoading) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground font-medium">
              {faceDetected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>تم اكتشاف الوجه…</span>
                </>
              ) : (
                <>
                  <ScanFace className="h-4 w-4 text-primary animate-pulse" />
                  <span>{modelsLoading ? "جارٍ تجهيز المتحقق…" : "ثبّت وجهك داخل الإطار"}</span>
                </>
              )}
            </div>
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