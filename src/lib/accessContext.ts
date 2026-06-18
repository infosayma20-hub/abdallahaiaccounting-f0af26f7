import { supabase } from "@/integrations/supabase/client";
import { isAuthSessionExpiredError, redirectToSessionExpired } from "@/lib/sessionExpired";

export type AccountType =
  | "super_admin"
  | "company_owner"
  | "company_admin"
  | "employee"
  | "sales_rep"
  | "cashier"
  | "call_center"
  | "portal_user"
  | "unlinked";

export type BlockingReason =
  | "company_setup_incomplete"
  | "unlinked_account"
  | "not_allowed_setup"
  | "unknown_state";

export interface AccessContext {
  userId: string;
  accountType: AccountType;
  roles: string[];
  isCompanyOwner: boolean;
  canAccessSetup: boolean;
  companySetupComplete: boolean;
  defaultRoute: string;
  blockingReason?: BlockingReason;
}

type RoleRow = { role: string | null };

const cache = new Map<string, { ctx: AccessContext; ts: number }>();
const TTL = 30_000;

const unwrap = <T,>(result: { data: T; error: unknown }): T => {
  if (result.error) {
    if (isAuthSessionExpiredError(result.error)) redirectToSessionExpired();
    throw result.error;
  }
  return result.data;
};

export function clearAccessContextCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export function defaultRouteFor(
  type: AccountType,
  roles: string[],
  companySetupComplete: boolean,
  canSetup: boolean,
): { route: string; blockingReason?: BlockingReason } {
  switch (type) {
    case "super_admin":
      return { route: "/super-admin/dashboard" };
    case "portal_user":
      return { route: "/portal/dashboard" };
    case "sales_rep":
      return { route: "/rep/home" };
    case "cashier":
      return { route: "/choose-workspace" };
    case "call_center":
      return { route: "/pos" };
    case "employee":
      return companySetupComplete
        ? { route: "/employee" }
        : { route: "/blocked/company-not-ready", blockingReason: "company_setup_incomplete" };
    case "company_admin":
      return companySetupComplete
        ? { route: "/apps" }
        : { route: "/blocked/company-not-ready", blockingReason: "company_setup_incomplete" };
    case "company_owner":
      // Only a real company_owner with explicit DB permission may reach /setup.
      if (companySetupComplete) return { route: "/apps" };
      if (canSetup) return { route: "/setup" };
      return { route: "/blocked/no-setup-permission", blockingReason: "not_allowed_setup" };
    case "unlinked":
      // Unlinked users must NOT silently slide into Setup. Setup is only
      // permitted when the DB explicitly authorised this user (canSetup=true)
      // AND they own no company yet — which is exactly the bootstrap case.
      if (canSetup) return { route: "/setup" };
      return { route: "/blocked/unlinked", blockingReason: "unlinked_account" };
  }
  // Any unknown/garbage account type — NEVER fall through to /setup.
  // eslint-disable-next-line no-console
  console.error("[access] unknown accountType, blocking", { type, roles });
  return { route: "/blocked/unlinked", blockingReason: "unknown_state" };
}

export async function resolveUserAccessContext(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<AccessContext> {
  if (!opts.force) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.ts < TTL) return hit.ctx;
  }

  const [
    accountTypeResult,
    canSetupResult,
    rolesResult,
    accountsResult,
  ] = await Promise.all([
    supabase.rpc("resolve_account_type", { _uid: userId }),
    supabase.rpc("user_can_access_setup", { _uid: userId }),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const accountType = unwrap(accountTypeResult);
  const canSetup = unwrap(canSetupResult);
  const rolesRows = unwrap(rolesResult);
  if (accountsResult.error) {
    if (isAuthSessionExpiredError(accountsResult.error)) redirectToSessionExpired();
    throw accountsResult.error;
  }
  const accountsCount = accountsResult.count;

  // Re-probe by running a single lightweight call to confirm the session is alive only
  // when accountType came back null AND rolesRows is empty AND there's no
  // accounts row — that's exactly the shape that historically routed users
  // to /blocked/unlinked after a token expiry.
  const looksUnlinked =
    !accountType && (!rolesRows || rolesRows.length === 0) && (accountsCount || 0) === 0;
  if (looksUnlinked) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        redirectToSessionExpired();
        // Throw to abort downstream work. The redirect is async page
        // navigation, so by the time React renders the next frame the
        // location has already changed.
        throw new Error("session_expired");
      }
    } catch (e) {
      if (isAuthSessionExpiredError(e)) {
        redirectToSessionExpired();
        throw e;
      }
      // Re-throw the "session_expired" sentinel; swallow other errors.
      if ((e as Error)?.message === "session_expired") throw e;
    }
  }
  const type = (accountType as AccountType) || "unlinked";
  const roles = ((rolesRows || []) as RoleRow[]).map((r) => String(r.role));
  const companySetupComplete = (accountsCount || 0) > 0 || type !== "company_owner";
  const canAccessSetup = canSetup === true;

  const { route, blockingReason } = defaultRouteFor(
    type,
    roles,
    companySetupComplete,
    canAccessSetup,
  );

  const ctx: AccessContext = {
    userId,
    accountType: type,
    roles,
    isCompanyOwner: type === "company_owner",
    canAccessSetup,
    companySetupComplete,
    defaultRoute: route,
    blockingReason,
  };

  // Structured single-line log for every decision.
  // eslint-disable-next-line no-console
  console.info("[access] resolve", {
    uid: userId,
    type,
    canSetup: canAccessSetup,
    defaultRoute: route,
    reason: blockingReason,
  });

  cache.set(userId, { ctx, ts: Date.now() });
  return ctx;
}