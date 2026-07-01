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

export function usePageScrollRestoration(sub = "scroll") {
  const { pathname } = useLocation();
  const storageKey = pageKey(pathname, sub);
  const restoredRef = useRef(false);

  // Restore once on mount.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const y = Number(raw);
      if (Number.isFinite(y) && y > 0) {
        // rAF so the DOM has painted at least once before we jump.
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Persist scroll on unmount (route change).
  useEffect(() => {
    return () => {
      try { sessionStorage.setItem(storageKey, String(window.scrollY || 0)); }
      catch { /* ignore */ }
    };
  }, [storageKey]);
}

export default usePageSessionState;