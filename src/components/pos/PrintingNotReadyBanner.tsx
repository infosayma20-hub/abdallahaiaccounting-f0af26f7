import { Printer, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isPrintingReady, onDeviceConfigChange } from "@/lib/device-config";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";

const DISMISS_KEY = "pos-printing-banner-dismissed-session";

/**
 * Soft, non-blocking banner shown at the top of POS when the Print Bridge
 * URL is not configured. Selling continues to work — only direct printing
 * is unavailable. The cashier can dismiss the banner for the current
 * browser session; admins get a quick link to device setup.
 */
export default function PrintingNotReadyBanner() {
  const { isDeviceAdmin } = useIsDeviceAdmin();
  const [printReady, setPrintReady] = useState(() => isPrintingReady());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    return onDeviceConfigChange(() => setPrintReady(isPrintingReady()));
  }, []);

  if (printReady || dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 px-3 py-1.5 text-[12px] border-b"
      style={{
        background: "#fef3c7",
        borderColor: "#fde68a",
        color: "#78350f",
      }}
    >
      <Printer className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 leading-tight">
        الطابعة غير مهيأة — يمكنك البيع وحفظ الفواتير بشكل طبيعي، لكن الطباعة المباشرة غير متاحة.
      </span>
      {isDeviceAdmin ? (
        <button
          type="button"
          onClick={() => window.location.assign("/device-setup")}
          className="inline-flex items-center gap-1 rounded-md bg-amber-900 text-white px-2 py-1 text-[11px] font-medium hover:bg-amber-800"
        >
          <Settings className="h-3 w-3" /> إعداد الطابعة
        </button>
      ) : (
        <span className="text-[11px] opacity-80">راجع المدير</span>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-amber-900/10"
        title="تجاهل الآن"
        aria-label="تجاهل الآن"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}