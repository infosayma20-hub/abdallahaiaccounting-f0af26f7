import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  fetchLatestVersion,
  isStale,
  isHardBlocked,
  clearAppCachesAndReload,
} from "@/lib/versionGate";

export default function VersionGateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const m = await fetchLatestVersion();
      if (cancelled) return;
      // Hard block is handled upstream by <VersionHardGate>; banner is for soft staleness only.
      setStale(isStale(m) && !isHardBlocked(m));
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000); // every 5 minutes
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between gap-3 shadow-lg" dir="rtl">
      <span className="text-sm font-medium">يوجد تحديث جديد للنظام — يرجى إعادة التحميل</span>
      <Button size="sm" variant="secondary" onClick={clearAppCachesAndReload}>
        <RefreshCw className="w-4 h-4 ml-1" /> تحديث الآن
      </Button>
    </div>
  );
}