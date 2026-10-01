import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera, Keyboard, Loader2, Flashlight, FlashlightOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeBarcode } from "@/lib/barcode";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code"];
// صيغ عرضة للقراءة الخاطئة الجزئية — نطلب قراءتين متطابقتين قبل القبول
const CONFIRM_FORMATS = new Set(["code_39", "itf", "codabar", "code_93"]);

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string; format: string }>> };

let ponyfillPromise: Promise<Detector> | null = null;

/** محرك الفك: قارئ الجهاز الأصلي إن وجد، وإلا ZXing-C++ (WASM محلي) — أسرع وأدق من محركات JS */
async function createDetector(): Promise<Detector> {
  const Native = (window as any).BarcodeDetector;
  if (Native?.getSupportedFormats) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      if (supported.includes("ean_13") && supported.includes("code_128")) {
        return new Native({ formats: FORMATS.filter(f => supported.includes(f)) });
      }
    } catch { /* fall back */ }
  }
  if (!ponyfillPromise) {
    ponyfillPromise = (async () => {
      const mod = await import("barcode-detector/ponyfill");
      mod.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path),
      });
      return new mod.BarcodeDetector({ formats: FORMATS as any }) as unknown as Detector;
    })().catch(e => { ponyfillPromise = null; throw e; });
  }
  return ponyfillPromise;
}

/**
 * ماسح الكاميرا المشترك (POS + الاستلام).
 * يفك الصورة كاملة إطارًا بإطار دون انتظار، مع تركيز تلقائي مستمر وفلاش اختياري.
 */
export default function POSBarcodeScanner({ open, onClose, onScan }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const stop = useCallback(() => {
    runRef.current++;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    const run = runRef.current;
    doneRef.current = false;
    setError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera-api");
      const [detector, stream] = await Promise.all([
        createDetector(),
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
      ]);
      if (run !== runRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps: any = (track as any).getCapabilities?.() || {};
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
      }
      setTorchAvailable(!!caps.torch);

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStarting(false);

      let last = "";
      let lastAt = 0;
      const loop = async () => {
        if (run !== runRef.current || doneRef.current) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const found = await detector.detect(video);
            if (run !== runRef.current || doneRef.current) return;
            const hit = found.find(b => normalizeBarcode(b.rawValue));
            if (hit) {
              const code = normalizeBarcode(hit.rawValue);
              const now = performance.now();
              const ok = !CONFIRM_FORMATS.has(hit.format) || (code === last && now - lastAt < 1500);
              last = code; lastAt = now;
              if (ok) {
                doneRef.current = true;
                try { navigator.vibrate?.(60); } catch { /* ignore */ }
                onScanRef.current(code);
                stop();
                onCloseRef.current();
                return;
              }
            }
          }
        } catch { /* إطار غير صالح — نكمل */ }
        const v: any = video;
        if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(() => loop());
        else requestAnimationFrame(() => loop());
      };
      loop();
    } catch (e: any) {
      console.error("Scanner start error:", e);
      if (run !== runRef.current) return;
      setStarting(false);
      setError(e?.name === "NotAllowedError"
        ? "صلاحية الكاميرا مرفوضة — فعّلها من إعدادات المتصفح أو استخدم الإدخال اليدوي."
        : "لا يمكن تشغيل الكاميرا. تحقق من الصلاحيات أو استخدم الإدخال اليدوي.");
      setMode("manual");
    }
  }, [stop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(t => !t);
    } catch { setTorchAvailable(false); }
  };

  useEffect(() => {
    if (open && mode === "camera") {
      start();
      return () => stop();
    }
    stop();
  }, [open, mode, start, stop]);

  useEffect(() => {
    if (!open) setMode("camera");
  }, [open]);

  if (!open) return null;

  const submitManual = () => {
    const v = normalizeBarcode(manualInput);
    if (!v) return;
    onScan(v);
    setManualInput("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-foreground/80 p-4" dir="rtl">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Camera className="h-4 w-4 text-primary" />
            مسح باركود
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary transition hover:bg-secondary/80" aria-label="إغلاق">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border p-3">
          <Button size="sm" variant={mode === "camera" ? "default" : "outline"} className="flex-1 gap-2 rounded-lg" onClick={() => setMode("camera")}>
            <Camera className="h-4 w-4" /> كاميرا
          </Button>
          <Button size="sm" variant={mode === "manual" ? "default" : "outline"} className="flex-1 gap-2 rounded-lg" onClick={() => setMode("manual")}>
            <Keyboard className="h-4 w-4" /> يدوي
          </Button>
        </div>

        <div className="p-4">
          {mode === "camera" && (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-foreground">
                <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
                {/* دليل التصويب */}
                <div className="pointer-events-none absolute inset-x-[6%] top-1/2 h-[42%] -translate-y-1/2 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_hsl(var(--foreground)/0.35)]">
                  <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-destructive/80" />
                </div>
                {torchAvailable && (
                  <button type="button" onClick={toggleTorch} aria-label="الفلاش"
                    className="absolute bottom-2 left-2 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground">
                    {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
                  </button>
                )}
                {starting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/50">
                    <Loader2 className="h-8 w-8 animate-spin text-background" />
                  </div>
                )}
              </div>
              {error && <p className="text-center text-xs text-destructive">{error}</p>}
              <p className="text-center text-[11px] text-muted-foreground">
                قرّب الباركود لحد ما يعبّي المربع ويكون واضح — بينقرأ لحاله
              </p>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-3">
              {error && <p className="text-center text-xs text-destructive">{error}</p>}
              <Input autoFocus placeholder="أدخل الباركود..." value={manualInput} onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitManual(); }}
                dir="ltr" className="h-12 rounded-lg text-center font-mono text-base" />
              <Button className="h-11 w-full rounded-lg" disabled={!manualInput.trim()} onClick={submitManual}>تأكيد</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
