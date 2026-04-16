import { useEffect, useRef } from "react";
import { toast } from "sonner";

declare const __APP_BUILD_TIME__: string;

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const CURRENT_BUILD = __APP_BUILD_TIME__;

export function useVersionCheck() {
  const hasShown = useRef(false);

  useEffect(() => {
    // Skip in development
    if (import.meta.env.DEV) return;

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
          hasShown.current = true;
          toast("🔄 تحديث جديد متوفر!", {
            description: "اضغط هنا لتحديث البرنامج",
            duration: Infinity,
            action: {
              label: "تحديث الآن",
              onClick: () => {
                window.location.reload();
              },
            },
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
  }, []);
}
