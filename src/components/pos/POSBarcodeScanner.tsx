import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera, Keyboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

/**
 * POS Camera Barcode Scanner
 * يستخدم html5-qrcode لدعم كل المتصفحات (بما فيها Safari/iOS).
 * يدعم: EAN-13/8, Code 128/39, UPC-A/E, QR.
 */
export default function POSBarcodeScanner({ open, onClose, onScan }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = "pos-barcode-reader";

  const stop = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
  };

  const start = async () => {
    await stop();
    setError(null);
    setStarting(true);
    try {
      const reader = new Html5Qrcode(divId, { verbose: false } as any);
      scannerRef.current = reader;
      await reader.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.6,
        },
        (decoded) => {
          // وصلنا لباركود — أرسله وأغلق
          onScan(decoded);
          stop().finally(() => onClose());
        },
        () => { /* per-frame errors ignored */ }
      );
    } catch (e: any) {
      console.error("Scanner start error:", e);
      setError("لا يمكن الوصول للكاميرا. تحقق من الصلاحيات أو استخدم الإدخال اليدوي.");
      setMode("manual");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (open && mode === "camera") {
      const t = setTimeout(start, 200);
      return () => { clearTimeout(t); stop(); };
    }
    if (!open) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            مسح باركود
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center transition"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-3 border-b border-border">
          <Button
            size="sm"
            variant={mode === "camera" ? "default" : "outline"}
            className="flex-1 gap-2 rounded-lg"
            onClick={() => setMode("camera")}
          >
            <Camera className="h-4 w-4" /> كاميرا
          </Button>
          <Button
            size="sm"
            variant={mode === "manual" ? "default" : "outline"}
            className="flex-1 gap-2 rounded-lg"
            onClick={() => setMode("manual")}
          >
            <Keyboard className="h-4 w-4" /> يدوي
          </Button>
        </div>

        {/* Body */}
        <div className="p-4">
          {mode === "camera" && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[16/10]">
                <div id={divId} className="w-full h-full" />
                {starting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}
              <p className="text-[11px] text-muted-foreground text-center">
                وجّه الكاميرا نحو الباركود — سيُمسح تلقائياً
              </p>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="أدخل الباركود..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualInput.trim()) {
                    onScan(manualInput.trim());
                    setManualInput("");
                    onClose();
                  }
                }}
                dir="ltr"
                className="text-center font-mono rounded-lg h-12 text-base"
              />
              <Button
                className="w-full h-11 rounded-lg"
                disabled={!manualInput.trim()}
                onClick={() => {
                  onScan(manualInput.trim());
                  setManualInput("");
                  onClose();
                }}
              >
                تأكيد
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
