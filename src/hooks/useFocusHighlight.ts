/**
 * useFocusHighlight — Phase 5J.1 Focus System
 * ────────────────────────────────────────────
 * Reads `?focus=<id>` from the URL, scrolls the matching row into view,
 * and applies a temporary "ring" highlight that fades after ~2.5s.
 *
 * Usage in a list page:
 *   const focusId = useFocusHighlight();
 *   <tr data-focus-id={row.id} className={focusId === row.id ? "ring-2 ring-primary/60 bg-primary/5 transition-all" : ""}>
 *
 * The hook returns the focus id only while the highlight is active; after
 * the timeout expires it returns null so the row returns to its normal style.
 *
 * Safe: read-only, no state mutations elsewhere, no business logic.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export function useFocusHighlight(durationMs = 2500): string | null {
  const [params] = useSearchParams();
  const focusId = params.get("focus");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) {
      setActive(null);
      return;
    }
    setActive(focusId);

    // Wait one paint so the target element is mounted, then scroll.
    const scrollRaf = requestAnimationFrame(() => {
      // Try a few times because lists may render asynchronously.
      let tries = 0;
      const tryScroll = () => {
        const el = document.querySelector(`[data-focus-id="${CSS.escape(focusId)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        if (tries++ < 10) setTimeout(tryScroll, 200);
      };
      tryScroll();
    });

    const fade = setTimeout(() => setActive(null), durationMs);
    return () => {
      cancelAnimationFrame(scrollRaf);
      clearTimeout(fade);
    };
  }, [focusId, durationMs]);

  return active;
}

export default useFocusHighlight;