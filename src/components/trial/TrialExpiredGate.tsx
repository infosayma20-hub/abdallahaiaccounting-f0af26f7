import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useReadOnly } from "@/contexts/ReadOnlyContext";
import TrialLastDayModal from "./TrialLastDayModal";
import TrialWelcomeModal from "./TrialWelcomeModal";
import ReadOnlyBanner from "./ReadOnlyBanner";

const FREE_ROUTES = ["/pricing", "/billing", "/subscription", "/auth", "/settings", "/profile", "/terms", "/privacy"];

const TrialExpiredGate = ({ children }: { children: React.ReactNode }) => {
  const { isTrialExpired, isPaidActive, loading } = useSubscriptionGuard();
  const { isReadOnly, setReadOnly } = useReadOnly();
  const location = useLocation();

  const isFreePage = FREE_ROUTES.some((r) => location.pathname.startsWith(r));

  // Auto-enable read-only mode for expired trials (no overlay/modal — just banner + locked UI)
  useEffect(() => {
    if (isTrialExpired && !isReadOnly) {
      setReadOnly(true);
    }
  }, [isTrialExpired, isReadOnly, setReadOnly]);

  if (loading) return <>{children}</>;

  // Paid users / free pages — pass through with welcome/last-day modals
  if (isPaidActive || isFreePage) {
    return (
      <>
        <TrialWelcomeModal />
        <TrialLastDayModal />
        {children}
      </>
    );
  }

  // Trial expired → SINGLE banner + read-only UI (no overlay, no floating button)
  if (isTrialExpired) {
    return (
      <>
        <ReadOnlyBanner />
        <div className="trial-readonly-mode">
          {children}
        </div>
      </>
    );
  }

  // Active trial → show welcome (day 1) and last-day (day 1 left) modals
  return (
    <>
      <TrialWelcomeModal />
      <TrialLastDayModal />
      {children}
    </>
  );
};

export default TrialExpiredGate;
