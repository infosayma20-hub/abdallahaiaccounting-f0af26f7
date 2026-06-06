import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onCancel: () => void;
  onCapture: (base64Jpeg: string) => void;
  title?: string;
}

/**
 * Mandatory selfie capture for attendance verification.
 * - Front camera only (facingMode: user)
 * - No file picker fallback
 * - Compresses to ~720px JPEG @ 0.7 quality (~50-100KB)
 */
export default function SelfieCapture({ open, onCancel, onCapture, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setError("لم يتم السماح بالوصول للكاميرا. الكاميرا مطلوبة لتسجيل البصمة في هذا الفرع.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (open && !preview) {
      startCamera();
    }
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
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
    setPreview(dataUrl);
    stopStream();
  };

  const retake = () => {
    setPreview(null);
    startCamera();
  };

  const confirm = () => {
    if (!preview) return;
    onCapture(preview);
  };

  const cancel = () => {
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
          {title || "صورة سيلفي للتحقق"}
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
              المحاولة مرة أخرى
            </Button>
          </div>
        ) : preview ? (
          <>
            <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square">
              <img src={preview} alt="معاينة" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm text-muted-foreground">هل الصورة واضحة؟</p>
            <div className="flex gap-2 w-full max-w-xs">
              <Button
                variant="outline"
                onClick={retake}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95"
              >
                <RotateCcw className="h-4 w-4" /> إعادة الالتقاط
              </Button>
              <Button
                onClick={confirm}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95"
              >
                <Check className="h-4 w-4" /> استخدام الصورة
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square relative">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              {/* Face frame guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-2/3 aspect-[3/4] border-4 border-white/70 rounded-[40%]" />
              </div>
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              ضع وجهك داخل الإطار ثم اضغط الزر
            </p>
            <Button
              size="lg"
              onClick={capture}
              disabled={starting}
              className="rounded-full h-16 w-16 p-0 active:scale-95"
            >
              <Camera className="h-7 w-7" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}