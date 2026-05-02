import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";

declare const __APP_BUILD_TIME__: string;

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const CURRENT_BUILD = __APP_BUILD_TIME__;
const DISMISSED_KEY = "amwali_update_dismissed_build";

const AUTH_ROUTE_PREFIXES = [
  "/auth",
  "/login",
  "/register",
  "/signup",
  "/reset-password",
  "/forgot-password",
];

export function useVersionCheck() {
  const hasShown = useRef(false);
  const { user } = useAuth();
  const location = useLocation();
  const isAuthRoute = AUTH_ROUTE_PREFIXES.some((p) =>
    location.pathname.toLowerCase().startsWith(p)
  );

  useEffect(() => {
    // Skip in development
    if (import.meta.env.DEV) return;
    // Only show inside the authenticated app — never on auth/login/register/reset pages
    if (!user) return;
    if (isAuthRoute) return;

    const checkForUpdate = async () => {
      try {
        // Fetch the index page with cache-busting to get the latest version
        const res = await fetch(`/?_v=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "text/html" },
        });
        const html = await res.text();

        // Look for a different build time in the newly fetched HTML
        // The JS bundles will have different hashes if the build changed
        // We check if any of our current JS files are missing from the new HTML
        const currentScripts = Array.from(document.querySelectorAll('script[src]'))
          .map(s => s.getAttribute('src'))
          .filter(Boolean);

        const hasChanged = currentScripts.some(src => src && !html.includes(src));

        if (hasChanged && !hasShown.current) {
          // Build a stable signature for this "new version" so we don't nag again
          const signature = currentScripts.filter(Boolean).sort().join("|") || CURRENT_BUILD;
          try {
            const dismissed = localStorage.getItem(DISMISSED_KEY);
            if (dismissed === signature) return;
          } catch {}

          hasShown.current = true;
          const markDismissed = () => {
            try { localStorage.setItem(DISMISSED_KEY, signature); } catch {}
          };
          toast("🔥 نزل تحديث جديد على النظام", {
            description:
              "إذا ما ظهرت معك التعديلات، اعمل Ctrl + Shift + R عشان يتحدث عندك مباشرة.",
            duration: Infinity,
            action: {
              label: "تحديث الآن",
              onClick: () => {
                markDismissed();
                window.location.reload();
              },
            },
            cancel: {
              label: "فهمت",
              onClick: markDismissed,
            },
            onDismiss: markDismissed,
            closeButton: true,
          });
        }
      } catch {
        // Silently fail - network issues shouldn't bother users
      }
    };

    // First check after 1 minute
    const initialTimeout = setTimeout(checkForUpdate, 60 * 1000);
    // Then check periodically
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [user, isAuthRoute]);
}
