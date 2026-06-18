/**
 * Centralized session-expired handling.
 *
 * The goal: when a user comes back to the app after their refresh_token
 * already expired (or any RPC/REST call returns a JWT-expired error), we
 * must NOT show the red "حسابك غير مرتبط بشركة" screen. That screen is for
 * users whose account truly has no company link. An expired session must
 * cleanly sign the user out and redirect them to /auth with a friendly
 * "your session expired" banner so they can sign in again.
 *
 * This module is intentionally tiny and side-effect-only on call. It is
 * SAFE to call multiple times — a single-fire guard prevents duplicate
 * sign-out / navigation work in the same tab.
 */
import { supabase } from "@/integrations/supabase/client";

let firing = false;

/**
 * Detect Supabase / PostgREST auth errors that signal an invalid or expired
 * session. We are intentionally narrow here: only well-known JWT/401 shapes
 * are treated as session-expired so we never log a user out for a generic
 * network error or a legitimate RLS denial against a valid session.
 */
export function isAuthSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  if (e.status === 401) return true;
  const code = (e.code || "").toString();
  const msg = (e.message || "").toString().toLowerCase();
  if (e.status === 403 && (code === "bad_jwt" || msg.includes("jwt") || msg.includes("token"))) return true;
  if (code === "PGRST301" || code === "PGRST302") return true;
  if (code === "bad_jwt") return true;
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used") return true;
  if (msg.includes("jwt expired")) return true;
  if (msg.includes("invalid jwt")) return true;
  if (msg.includes("token is expired")) return true;
  if (msg.includes("token has invalid claims")) return true;
  if (msg.includes("unable to parse or verify signature")) return true;
  if (msg.includes("invalid refresh token")) return true;
  if (msg.includes("refresh token not found")) return true;
  if (msg.includes("auth session missing")) return true;
  return false;
}

/**
 * Fire-and-forget: sign the local session out and hard-navigate to /auth
 * with a reason flag. Uses `window.location.replace` (not React Router)
 * because we want every cached React state to be torn down — otherwise a
 * stale `user` object could re-trigger protected-route logic during the
 * SPA navigation.
 */
export function redirectToSessionExpired(): void {
  if (firing) return;
  firing = true;

  // Don't redirect if we're already on the auth page (avoid loops).
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path === "/auth" || path.startsWith("/auth/")) {
    firing = false;
    return;
  }

  // Best-effort cleanup. We do NOT await — UX must not stall on a slow
  // network. supabase.auth.signOut() also clears localStorage tokens.
  try {
    void supabase.auth.signOut();
  } catch {
    // ignore — we'll wipe storage manually below
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("sb-") || k.startsWith("supabase.")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage errors (private mode, etc.)
  }

  if (typeof window !== "undefined") {
    window.location.replace("/auth?reason=session_expired");
  }
}