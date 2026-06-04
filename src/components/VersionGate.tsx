import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { hardRefreshToLatest } from "@/utils/versionUtils";
import { APP_VERSION_LABEL } from "@/config/appVersion";

/**
 * VersionGate
 * ------------
 * Wraps the entire app. Behavior:
 *   • forceUpdate=false OR build is current → renders children normally.
 *   • Soft outdated (latestBuild > APP_BUILD, no force) → quiet bottom banner.
 *   • Hard block (forceUpdate=true OR APP_BUILD < minSupportedBuild)
 *     → full-screen blocking screen with single "تحديث الآن" button.
 *
 * Initial paint is NEVER blocked: the first check is delayed and the
 * blocking screen appears only after a confirmed bad manifest.
 */
export default function VersionGate({ children }: { children: React.ReactNode }) {
  const { manifest, isOutdated, isHardBlocked } = useVersionCheck();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // Auto-refresh once when hard block is detected — but only if the user
  // hasn't been here before (debounce guard inside hardRefreshToLatest).
  useEffect(() => {
    if (isHardBlocked && !refreshing && manifest) {
      // Show the screen briefly first, then auto-trigger refresh.
      const t = setTimeout(async () => {
        setRefreshing(true);
        await hardRefreshToLatest(manifest.latestBuild);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isHardBlocked, manifest, refreshing]);

  if (isHardBlocked && manifest) {
    return (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-6"
        style={{ backgroundColor: "#0D1B2E", fontFamily: "Cairo, system-ui, sans-serif" }}
        dir="rtl"
      >
        <div className="max-w-md w-full text-center space-y-6 text-white">
          <div className="mx-auto w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            {refreshing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <ShieldAlert className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-2xl font-bold">جاري تحديث النظام</h1>
          <p className="text-white/80 leading-relaxed text-base">
            {manifest.message ||
              "تم إصدار نسخة جديدة من أموالي. يرجى الانتظار حتى يتم التحديث تلقائياً."}
          </p>
          <div className="text-xs text-white/50 font-mono">
            current: build #{useVersionCheckSafe()} → latest: build #{manifest.latestBuild}
            {manifest.minSupportedBuild > 1 ? ` (min: #${manifest.minSupportedBuild})` : ""}
          </div>
          <Button
            variant="secondary"
            className="w-full"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await hardRefreshToLatest(manifest.latestBuild);
            }}
          >
            <RefreshCw className={`w-4 h-4 ml-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "جاري التحديث..." : "تحديث الآن"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {isOutdated && !dismissedBanner && manifest && (
        <div
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[9999] rounded-xl border bg-card text-card-foreground shadow-lg p-4 flex items-start gap-3"
          dir="rtl"
        >
          <RefreshCw className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-semibold">تحديث جديد متاح</div>
            <div className="text-xs text-muted-foreground">
              build #{manifest.latestBuild} — {APP_VERSION_LABEL}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => hardRefreshToLatest(manifest.latestBuild)}
              >
                تحديث
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissedBanner(true)}>
                لاحقاً
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Re-export APP_BUILD as a function so the JSX above can reference it
// without an extra import line (keeps the component file self-contained).
import { APP_BUILD } from "@/config/appVersion";
function useVersionCheckSafe(): number {
  return APP_BUILD;
}