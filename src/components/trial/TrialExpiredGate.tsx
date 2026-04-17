import { useLocation } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useReadOnly } from "@/contexts/ReadOnlyContext";
import TrialExpiredOverlay from "./TrialExpiredOverlay";
import TrialLastDayModal from "./TrialLastDayModal";
import TrialWelcomeModal from "./TrialWelcomeModal";
import FloatingSubscribeButton from "./FloatingSubscribeButton";

const FREE_ROUTES = ["/pricing", "/billing", "/subscription", "/auth", "/settings", "/profile", "/terms", "/privacy"];

const TrialExpiredGate = ({ children }: { children: React.ReactNode }) => {
  const { isTrialExpired, isPaidActive, isTrial, isSuperAdmin, loading, subscription } = useSubscriptionGuard();
  const { isReadOnly } = useReadOnly();
  const location = useLocation();

  const isFreePage = FREE_ROUTES.some((r) => location.pathname.startsWith(r));

  // ⛔ STRICT: Loading or super admin or active trial → no overlay, no flicker, ever.
  if (loading || isSuperAdmin || isTrial) {
    return (
      <>
        <TrialWelcomeModal />
        <TrialLastDayModal />
        {children}
      </>
    );
  }

  // Paid / free routes / no subscription → pass through
  if (isPaidActive || isFreePage || !subscription) {
    return <>{children}</>;
  }

  // Trial expired and NOT in read-only → show overlay
  if (isTrialExpired && !isReadOnly) {
    return (
      <>
        {children}
        <TrialExpiredOverlay />
      </>
    );
  }

  // Trial expired in read-only mode
  if (isTrialExpired && isReadOnly) {
    return (
      <>
        <div className="trial-readonly-mode">{children}</div>
        <FloatingSubscribeButton />
      </>
    );
  }

  return <>{children}</>;
};

export default TrialExpiredGate;
