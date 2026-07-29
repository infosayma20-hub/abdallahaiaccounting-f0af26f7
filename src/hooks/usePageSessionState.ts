import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Page-scoped session state helpers — opt-in per page.
 *
 *  usePageSessionState(key, initial)
 *    Persists a small piece of state in sessionStorage keyed by the
 *    current pathname + a page-provided sub-key (e.g. "filters").
 *    Restores it synchronously on mount, so returning to the page
 *    shows the same filters/tab without a flash of empty state.
 *
 *  usePageScrollRestoration(key?)
 *    Saves window scrollY on unmount and restores it on mount, keyed
 *    by pathname (+ optional sub-key). Safe no-op on SSR.
 *
 * Both hooks are additive — they touch nothing outside sessionStorage
 * and can be adopted page-by-page without risking existing behaviour.
 */

function pageKey(pathname: string, sub: string) {
  return `amwali:page:${pathname}::${sub}`;
}

export function usePageSessionState<T>(sub: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const { pathname } = useLocation();
  const storageKey = pageKey(pathname, sub);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch { return initial; }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* quota / private mode — ignore */ }
  }, [storageKey, value]);

  const set = useCallback((v: T | ((prev: T) => T)) => setValue(v), []);
  return [value, set];
}

/**
 * The app shell (WebLayout) scrolls inside <main class="overflow-y-auto">,
 * not the window — so window.scrollY is always 0. Resolve the real scroll
 * container, falling back to the window when the page is standalone.
 */
function getScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const main = document.querySelector("main");
  if (main && main.scrollHeight > main.clientHeight + 4) return main as HTMLElement;
  return (main as HTMLElement) || null;
}

export function usePageScrollRestoration(sub = "scroll") {
  const { pathname } = useLocation();
  const storageKey = pageKey(pathname, sub);
  const restoredRef = useRef(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const el = getScroller();

    // --- restore (retry a few frames while data streams in) ---
    if (!restoredRef.current) {
      restoredRef.current = true;
      try {
        const y = Number(sessionStorage.getItem(storageKey));
        if (Number.isFinite(y) && y > 0) {
          let tries = 0;
          const tick = () => {
            if (cancelled) return;
            const target = getScroller();
            if (target) {
              const max = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.min(y, Math.max(max, 0));
              if (max >= y - 2 || tries > 12) return; // content tall enough → done
            }
            tries += 1;
            if (tries <= 12) setTimeout(tick, 120);
          };
          requestAnimationFrame(tick);
        }
      } catch { /* ignore */ }
    }

    // --- track scroll position (cheap, passive) ---
    const onScroll = () => {
      const target = getScroller();
      lastYRef.current = target ? target.scrollTop : (window.scrollY || 0);
    };
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelled = true;
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      try { sessionStorage.setItem(storageKey, String(lastYRef.current || 0)); }
      catch { /* ignore */ }
    };
  }, [storageKey]);
}

export default usePageSessionState;