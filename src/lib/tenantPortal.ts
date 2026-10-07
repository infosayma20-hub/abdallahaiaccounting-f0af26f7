// Detects a tenant's private login portal from the hostname, e.g. leen.unifyerp.app.
// For preview/testing, `?portal=slug` is remembered for the browser session.
const RESERVED = new Set(["www", "menu", "app", "api", "admin", "mail"]);
const ROOT_DOMAINS = ["unifyerp.app"];
const SS_KEY = "unify_portal_slug_override";

export function getPortalSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("portal");
    if (q !== null) {
      const v = q.trim().toLowerCase();
      if (v) sessionStorage.setItem(SS_KEY, v);
      else sessionStorage.removeItem(SS_KEY);
    }
    const o = sessionStorage.getItem(SS_KEY);
    if (o) return o;
  } catch { /* ignore */ }
  const host = window.location.hostname.toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (host.endsWith("." + root)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && !sub.includes(".") && !RESERVED.has(sub)) return sub;
    }
  }
  return null;
}
