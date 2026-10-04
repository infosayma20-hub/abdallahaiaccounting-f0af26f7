import { isPosV2User, posV2OptOut } from "@/lib/posV2Access";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import { useBridgeAuthorized } from "@/hooks/useBridgeAuthorized";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { setCanSell } from "@/lib/pos-device-auth";
import { usePosMode } from "@/hooks/usePosMode";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { setPosGuardResolving, usePosPageLoading } from "@/lib/pos/posBootLoading";
import POSBootOverlay from "./POSBootOverlay";

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
  const location = useLocation();
  // ⚡ Start downloading the (large) POS bundle immediately, in parallel with
  // the bridge probe / permission checks below. Previously the chunk only
  // began downloading AFTER the guard resolved, so a slow probe and the
  // download were serialized — several seconds of blank spinner.
  useEffect(() => {
    void import("@/pages/POSPage").catch(() => { /* ignore */ });
  }, []);
  const { checking, authorized, bridgeUrl, recheck } = useBridgeAuthorized();
  const { isDeviceAdmin, checking: checkingAdmin } = useIsDeviceAdmin();
  // Call-center users sell over the phone and do not need a Print Bridge
  // or any local printers — only a branch + POS terminal. Treat them as
  // fully authorized regardless of bridge state so they can open POS,
  // open a shift, and sell without any local hardware.
  const { callCenterEnabled, loading: posModeLoading } = usePosMode();
  // Per-user call-center flag (pos_users.is_call_center). When the logged-in
  // POS user is flagged as call center, they don't print locally — they
  // forward orders to cashier terminals — so the Print Bridge is irrelevant
  // for THIS user on THIS device only.
  const { user } = useAuth();
  const [userIsCallCenter, setUserIsCallCenter] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setUserIsCallCenter(false); return; }
    (async () => {
      const { data } = await supabase
        .from("pos_users")
        .select("is_call_center")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!cancelled) setUserIsCallCenter(!!(data as any)?.is_call_center);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  // Demo tenants (companies.is_demo, set by super_admin only) are used to
  // present POS to prospects on machines without a Print Bridge.
  const [isDemoTenant, setIsDemoTenant] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setIsDemoTenant(false); return; }
    (async () => {
      const { data } = await supabase.rpc("is_current_tenant_demo");
      if (!cancelled) setIsDemoTenant(!!data);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const bypassBridge = callCenterEnabled || !!userIsCallCenter || !!isDemoTenant;
  const pageLoading = usePosPageLoading();
  const effectiveAuthorized = authorized || bypassBridge;

  // Track whether this tab has EVER seen a working Bridge.
  // Once true, we never show the full-screen lock again — only the banner —
  // so a mid-invoice Bridge drop doesn't kick the cashier out.
  const wasAuthorizedRef = useRef(false);
  const [wasAuthorized, setWasAuthorized] = useState(false);
  useEffect(() => {
    if (effectiveAuthorized && !wasAuthorizedRef.current) {
      wasAuthorizedRef.current = true;
      setWasAuthorized(true);
    }
  }, [effectiveAuthorized]);

  // ── Heartbeat DISABLED ──────────────────────────────────────────
  // Background heartbeat was kicking cashiers out of POS in production.
  // We rely on the mount-time check only; the cashier can manually click
  // "إعادة الفحص" from the Bridge status popover if needed. Any sensitive
  // action (sell/print/drawer) still calls `enforceDeviceGuard()` which
  // re-reads canSell — so a dead bridge will be caught at action time,
  // not via a periodic poll that might also race with auth refresh.

  // Keep the canSell store in sync with the current authorization state.
  // This is the SINGLE source of truth consumed by POSPage.enforceDeviceGuard.
  useEffect(() => {
    setCanSell(!!effectiveAuthorized);
    // Helper flag for CSS/banner styling — never the source of truth.
    try {
      if (effectiveAuthorized) document.body.removeAttribute("data-pos-view-only");
      else document.body.setAttribute("data-pos-view-only", "true");
    } catch { /* ignore */ }
    return () => {
      // On unmount (leaving /pos), clear the flag so other pages aren't affected.
      setCanSell(false);
      try { document.body.removeAttribute("data-pos-view-only"); } catch { /* ignore */ }
    };
  }, [effectiveAuthorized]);

  // 1) Still resolving. POS mounts UNDERNEATH the boot popup at the same time
  //    so its data loads in parallel with the device checks (they used to be
  //    serialized). canSell stays false until authorization is confirmed, so
  //    nothing can be sold/printed while checks run.
  const stillResolvingBase = checkingAdmin || posModeLoading || userIsCallCenter === null || isDemoTenant === null;
  const resolving = stillResolvingBase || (!bypassBridge && checking);
  useEffect(() => {
    setPosGuardResolving(resolving);
  }, [resolving]);
  useEffect(() => () => setPosGuardResolving(true), []);

  // The redesigned POS is a demo-only experiment. A direct URL must never
  // expose it to a production tenant before the design is approved.
  const v2Allowed = !!isDemoTenant || isPosV2User(user?.email);
  useEffect(() => {
    if (resolving) return;
    if (location.pathname === "/pos-v2" && !v2Allowed) {
      navigate("/pos", { replace: true });
    } else if (location.pathname === "/pos" && isPosV2User(user?.email) && !posV2OptOut.get()) {
      // Allow-listed users land on the new design; "العودة للواجهة الحالية" opts out for this session.
      navigate(`/pos-v2${location.search}`, { replace: true });
    }
  }, [v2Allowed, user?.email, location.pathname, location.search, navigate, resolving]);

  // 2) Authorized OR (admin OR previously-authorized cashier) → render POS.
  //    In the non-authorized branches we render with canSell=false (view-only).
  const showAsViewOnly = !resolving && !effectiveAuthorized && (isDeviceAdmin || wasAuthorized);
  // 3) Unauthorized cashier on a device that never had a Bridge → back to
  //    /choose-workspace where the POS card explains why it is disabled.
  const mustRedirect = !resolving && !effectiveAuthorized && !showAsViewOnly;

  // The tree shape stays identical across states so POS is never remounted.
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {showAsViewOnly && (
        <ViewOnlyBanner onRecheck={recheck} bridgeUrl={bridgeUrl} />
      )}
      {isDemoTenant && !resolving && (
        <div dir="rtl" className="px-3 py-1.5 text-[12px] font-semibold text-center border-b shrink-0 bg-primary text-primary-foreground">
          وضع العرض التجريبي — حساب تجريبي، البيع يعمل بدون برنامج الطباعة
        </div>
      )}
      {mustRedirect ? (
        <RedirectToChooseWorkspace />
      ) : (
        <div className="flex-1 min-h-0" aria-hidden={resolving || undefined}>{children}</div>
      )}
      <POSBootOverlay active={resolving || pageLoading} />
    </div>
  );
}

function RedirectToChooseWorkspace() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/choose-workspace", { replace: true });
  }, [navigate]);
  return (
    <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
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


