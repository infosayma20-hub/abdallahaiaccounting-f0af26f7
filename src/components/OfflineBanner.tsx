import { CloudOff, Loader2 } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Slim global strip shown when the connection is confirmed down (or being
 * verified). Reassures the operator that typed data is kept locally.
 */
export function OfflineBanner() {
  const { quality } = useNetworkStatus();

  if (quality === "stable") return null;

  const verifying = quality === "verifying";

  return (
    <div
      dir="rtl"
      role="status"
      className={`fixed bottom-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-3 py-1.5 text-[13px] font-medium shadow-lg ${
        verifying
          ? "bg-muted text-muted-foreground"
          : "bg-destructive text-destructive-foreground"
      }`}
    >
      {verifying ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>جارٍ التحقق من الاتصال…</span>
        </>
      ) : (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>لا يوجد اتصال بالإنترنت — البرنامج يعمل محلياً وبياناتك المُدخلة محفوظة</span>
        </>
      )}
    </div>
  );
}

export default OfflineBanner;
