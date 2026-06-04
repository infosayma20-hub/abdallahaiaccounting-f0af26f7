import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertOctagon, RefreshCw } from "lucide-react";
import {
  fetchLatestVersion,
  isHardBlocked,
  clearAppCachesAndReload,
  getBuildVersion,
  getLatestManifest,
} from "@/lib/versionGate";

/**
 * Hard version gate: when the manifest says forceUpdate=true or the build
 * is below minSupportedBuild, we render a full-screen block BEFORE auth,
 * routes, or any business UI. The user cannot bypass it.
 */
export default function VersionHardGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const m = await fetchLatestVersion();
      if (cancelled) return;
      setBlocked(isHardBlocked(m));
      setChecked(true);
    };
    run();
    const id = setInterval(run, 60_000); // re-check every minute
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Don't block first paint while we fetch — soft fail-open. The check is
  // cheap and fires immediately; if it later flips to blocked we show the
  // full-screen lock.
  if (checked && blocked) {
    const m = getLatestManifest();
    return (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-background p-6"
        dir="rtl"
      >
        <div className="max-w-md w-full rounded-xl border bg-card p-8 text-center space-y-4 shadow-lg">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertOctagon className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">يلزم تحديث النظام</h1>
          <p className="text-muted-foreground leading-relaxed">
            {m?.message ||
              "هذا الإصدار من التطبيق لم يعد مدعوماً. يرجى تحديث الصفحة لتحميل آخر إصدار قبل المتابعة."}
          </p>
          <div className="text-xs text-muted-foreground/70 font-mono">
            current: {getBuildVersion()}
            {m?.version ? ` → latest: ${m.version}` : ""}
            {m?.minSupportedBuild ? ` (min: ${m.minSupportedBuild})` : ""}
          </div>
          <Button onClick={clearAppCachesAndReload} className="w-full">
            <RefreshCw className="w-4 h-4 ml-2" /> تحديث الآن
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}