/**
 * Resolves the public base URL used in QR codes / device links for KDS.
 * Priority:
 *   1. company_settings.kds_public_base_url (explicit production URL)
 *   2. import.meta.env.VITE_PUBLIC_APP_URL
 *   3. window.location.origin — only if it is NOT a Lovable preview / localhost
 */
const PREVIEW_HOSTS = ["lovableproject.com", "localhost", "127.0.0.1", "preview"];

export function isPreviewOrigin(origin: string = window.location.origin): boolean {
  return PREVIEW_HOSTS.some(h => origin.includes(h));
}

export function getKdsPublicBaseUrl(configured?: string | null): string {
  const cfg = (configured || "").trim().replace(/\/+$/, "");
  if (cfg) return cfg;

  const envUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/+$/, "");
  if (envUrl) return envUrl;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin && !isPreviewOrigin(origin)) return origin;

  // Last resort — return origin even if preview, but caller should warn the user.
  return origin;
}