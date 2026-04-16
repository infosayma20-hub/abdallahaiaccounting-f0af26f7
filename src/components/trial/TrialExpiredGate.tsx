import { useLocation } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useReadOnly } from "@/contexts/ReadOnlyContext";
import TrialExpiredOverlay from "./TrialExpiredOverlay";
import TrialLastDayModal from "./TrialLastDayModal";
import TrialWelcomeModal from "./TrialWelcomeModal";
import ReadOnlyBanner from "./ReadOnlyBanner";
import FloatingSubscribeButton from "./FloatingSubscribeButton";

const FREE_ROUTES = ["/pricing", "/billing", "/subscription", "/auth", "/settings", "/profile", "/terms", "/privacy"];

const TrialExpiredGate = ({ children }: { children: React.ReactNode }) => {
  const { isTrialExpired, isPaidActive, loading } = useSubscriptionGuard();
  const { isReadOnly } = useReadOnly();
  const location = useLocation();

  const isFreePage = FREE_ROUTES.some((r) => location.pathname.startsWith(r));

  if (loading) return <>{children}</>;

  // Paid users pass through
  if (isPaidActive || isFreePage) {
    return (
      <>
        <TrialLastDayModal />
        {children}
      </>
    );
  }

  // Trial expired and NOT in read-only mode → show overlay
  if (isTrialExpired && !isReadOnly) {
    return (
      <>
        {children}
        <TrialExpiredOverlay />
      </>
    );
  }

  // Trial expired and in read-only mode → show banner + disabled UI
  if (isTrialExpired && isReadOnly) {
    return (
      <>
        <ReadOnlyBanner />
        <div className="trial-readonly-mode">
          {children}
        </div>
        <FloatingSubscribeButton />
      </>
    );
  }

  // Active trial → show last day modal if applicable
  return (
    <>
      <TrialLastDayModal />
      {children}
    </>
  );
};

export default TrialExpiredGate;
