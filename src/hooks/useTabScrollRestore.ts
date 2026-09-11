import { useEffect, useRef } from "react";
import { useNavigationType } from "react-router-dom";
import { useAppTabs } from "@/contexts/TabsContext";

const STORAGE_PREFIX = "tabscroll:";

const keyFor = (tabId: string) => `${STORAGE_PREFIX}${tabId}`;

/**
 * Keeps the scroll position of every open tab (route) so switching between
 * tabs — or leaving a page and coming back — restores the exact place the
 * user was at, instead of jumping back to the top.
 *
 * Purely presentational: no data fetching or routing logic is touched.
 */
export function useTabScrollRestore(
  containerRef: React.RefObject<HTMLElement>,
) {
  const { activeTabId } = useAppTabs();
  const navigationType = useNavigationType();
  const currentKey = keyFor(activeTabId || "untabbed");
  const keyRef = useRef(currentKey);

  // Persist scroll position of the tab we are leaving, then restore the new one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    keyRef.current = currentKey;

    // A brand-new navigation (PUSH) to a page never visited starts at the top.
    let saved: number | null = null;
    try {
      const raw = sessionStorage.getItem(currentKey);
      if (raw !== null) saved = Number(raw);
    } catch {
      saved = null;
    }

    const target = saved && Number.isFinite(saved) ? saved : 0;

    // Content loads lazily (suspense / async data), so re-apply the offset for
    // a short window until the page is tall enough to honour it.
    let frame = 0;
    const start = performance.now();
    const apply = () => {
      const node = containerRef.current;
      if (!node) return;
      if (node.scrollTop !== target) node.scrollTop = target;
      if (target > 0 && performance.now() - start < 1200) {
        frame = requestAnimationFrame(apply);
      }
    };
    frame = requestAnimationFrame(apply);

    return () => {
      cancelAnimationFrame(frame);
      const node = containerRef.current;
      if (!node) return;
      try {
        sessionStorage.setItem(currentKey, String(node.scrollTop));
      } catch {
        /* storage full or blocked — ignore */
      }
    };
    // navigationType is included so a fresh push re-evaluates the stored value
  }, [containerRef, currentKey, navigationType]);

  // Continuously record the position so a hard reload / tab switch is covered.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(keyRef.current, String(el.scrollTop));
        } catch {
          /* ignore */
        }
      }, 150);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [containerRef]);
}

/** Clears the stored position for a tab that was closed. */
export function clearTabScroll(tabId: string) {
  try {
    sessionStorage.removeItem(keyFor(tabId));
  } catch {
    /* ignore */
  }
}
