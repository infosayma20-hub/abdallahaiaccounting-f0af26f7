import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, Loader2, Lock, RefreshCw, LogOut, ArrowRight } from "lucide-react";
import { useBridgeAuthorized } from "@/hooks/useBridgeAuthorized";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { setCanSell } from "@/lib/pos-device-auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate around /pos that enforces:
 *   • Cashiers can only open POS on devices with Print Bridge installed.
 *   • Admins/super_admins can open POS anywhere but enter VIEW-ONLY mode
 *     when Bridge is unreachable (selling, printing, drawer disabled).
 *
 * If the cashier had a reachable Bridge earlier in the session and it
 * later drops, we DO NOT eject them (might be mid-invoice). Instead we
 * switch into the same view-only mode with a sticky banner and a manual
 * "Recheck" button — same UX as the admin downgrade.
 */
export default function POSDeviceAuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { checking, authorized, bridgeUrl, version, recheck } = useBridgeAuthorized();
  const { isDeviceAdmin, checking: checkingAdmin } = useIsDeviceAdmin();

  // Track whether this tab has EVER seen a working Bridge.
  // Once true, we never show the full-screen lock again — only the banner —
  // so a mid-invoice Bridge drop doesn't kick the cashier out.
  const wasAuthorizedRef = useRef(false);
  const [wasAuthorized, setWasAuthorized] = useState(false);
  useEffect(() => {
    if (authorized && !wasAuthorizedRef.current) {
      wasAuthorizedRef.current = true;
      setWasAuthorized(true);
    }
  }, [authorized]);

  // Keep the canSell store in sync with the current authorization state.
  // This is the SINGLE source of truth consumed by POSPage.enforceDeviceGuard.
  useEffect(() => {
    setCanSell(!!authorized);
    // Helper flag for CSS/banner styling — never the source of truth.
    try {
      if (authorized) document.body.removeAttribute("data-pos-view-only");
      else document.body.setAttribute("data-pos-view-only", "true");
    } catch { /* ignore */ }
    return () => {
      // On unmount (leaving /pos), clear the flag so other pages aren't affected.
      setCanSell(false);
      try { document.body.removeAttribute("data-pos-view-only"); } catch { /* ignore */ }
    };
  }, [authorized]);

  // 1) Still resolving — minimal spinner.
  if (checking || checkingAdmin) {
    return (
      <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">جارٍ التحقق من برنامج الطباعة على هذا الجهاز…</span>
        </div>
      </div>
    );
  }

  // 2) Authorized OR (admin OR previously-authorized cashier) → render POS.
  //    In the non-authorized branches we render with canSell=false (view-only).
  const showAsViewOnly = !authorized && (isDeviceAdmin || wasAuthorized);
  if (authorized || showAsViewOnly) {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        {showAsViewOnly && (
          <ViewOnlyBanner onRecheck={recheck} bridgeUrl={bridgeUrl} />
        )}
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    );
  }

  // 3) Unauthorized cashier on a device that never had a Bridge → full-screen lock.
  return <UnauthorizedDeviceScreen onRecheck={recheck} navigate={navigate} bridgeUrl={bridgeUrl} version={version} />;
}

function ViewOnlyBanner({ onRecheck, bridgeUrl }: { onRecheck: () => void; bridgeUrl: string | null }) {
  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 px-3 py-2 text-[12px] border-b shrink-0"
      style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#78350f" }}
    >
      <Eye className="h-4 w-4 shrink-0" />
      <div className="flex-1 leading-tight min-w-0">
        <div className="font-semibold truncate">وضع عرض فقط — برنامج الطباعة غير متصل على هذا الجهاز</div>
        <div className="opacity-80 truncate">
          البيع والطباعة وفتح الدرج موقوفة حتى يعود الاتصال. {bridgeUrl ? `(${bridgeUrl})` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onRecheck}
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white shrink-0"
        style={{ background: "#78350f" }}
      >
        <RefreshCw className="h-3.5 w-3.5" /> إعادة الفحص
      </button>
    </div>
  );
}

function UnauthorizedDeviceScreen({
  onRecheck,
  navigate,
  bridgeUrl,
  version,
}: {
  onRecheck: () => void;
  navigate: ReturnType<typeof useNavigate>;
  bridgeUrl: string | null;
  version: string | null;
}) {
  const [busy, setBusy] = useState(false);

  const handleRecheck = async () => {
    if (busy) return;
    setBusy(true);
    try { await onRecheck(); } finally { setBusy(false); }
  };

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    navigate("/auth", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <Lock className="h-9 w-9 text-red-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">هذا الجهاز غير مصرح لاستخدام نقطة البيع</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            نقطة البيع تعمل فقط على أجهزة الفرع المثبت عليها برنامج الطباعة (Print Bridge).
            تأكد أن البرنامج شغّال على نفس الجهاز، أو استخدم جهاز الفرع.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-[12px] text-muted-foreground space-y-1">
          <div className="flex items-center justify-between">
            <span>حالة برنامج الطباعة</span>
            <span className="inline-flex items-center gap-1 text-red-600 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> غير متصل
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>عنوان الفحص</span>
            <span className="font-mono">127.0.0.1:3001</span>
          </div>
          {bridgeUrl && (
            <div className="flex items-center justify-between">
              <span>آخر عنوان معروف</span>
              <span className="font-mono">{bridgeUrl}</span>
            </div>
          )}
          {version && (
            <div className="flex items-center justify-between">
              <span>الإصدار</span>
              <span className="font-mono">v{version}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRecheck}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            إعادة الفحص
          </button>
          <button
            type="button"
            onClick={() => navigate("/employee", { replace: true })}
            className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-medium"
          >
            <ArrowRight className="h-4 w-4" />
            العودة لشاشة الموظف
          </button>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center justify-center gap-2 text-xs text-muted-foreground py-2"
          >
            <LogOut className="h-3.5 w-3.5" />
            تسجيل خروج
          </button>
        </div>
      </div>
    </div>
  );
}
