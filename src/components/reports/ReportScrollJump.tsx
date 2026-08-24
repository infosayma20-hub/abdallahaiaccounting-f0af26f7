import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUp, ChevronsDown } from "lucide-react";

/**
 * ReportScrollJump — compact floating jump-to-top / jump-to-bottom pill
 * for long report pages (mounted by WebLayout on report routes only).
 *
 * Design intent: deliberately smaller and subtler than the account-statement
 * arrows — a slim translucent pill pinned to the LEFT edge of the screen so
 * it never covers the totals footer or the numeric columns on the right.
 */

const findScrollTarget = (): HTMLElement | null => {
  // The app shell scrolls inside WebLayout's <main class="overflow-y-auto">.
  const mains = document.querySelectorAll("main");
  for (const m of Array.from(mains)) {
    const el = m as HTMLElement;
    const style = window.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4) {
      return el;
    }
  }
  const doc = (document.scrollingElement as HTMLElement | null) || document.documentElement;
  return doc.scrollHeight > doc.clientHeight + 4 ? doc : null;
};

const ReportScrollJump = () => {
  const [scrollable, setScrollable] = useState(false);

  const scrollToTop = useCallback(() => {
    findScrollTarget()?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = findScrollTarget();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "smooth" });
  }, []);

  // Track whether the page actually overflows — re-checked as report rows
  // stream in (rAF-throttled MutationObserver on the scroll container).
  useEffect(() => {
    let raf = 0;
    const check = () => setScrollable(!!findScrollTarget());
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };
    check();
    const t1 = window.setTimeout(check, 500);
    const t2 = window.setTimeout(check, 2000);
    window.addEventListener("resize", schedule);
    const target = document.querySelector("main");
    const mo = new MutationObserver(schedule);
    if (target) mo.observe(target, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
    };
  }, []);

  // Same keyboard contract as the account statement: Home/End (plain, or any
  // modifier combo even while typing inside a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t as any)?.isContentEditable;
      const withModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (withModifier && (e.key === "End" || e.key === "PageDown")) {
        e.preventDefault();
        scrollToBottom();
        return;
      }
      if (withModifier && (e.key === "Home" || e.key === "PageUp")) {
        e.preventDefault();
        scrollToTop();
        return;
      }
      if (editable) return;
      if (e.key === "End") {
        e.preventDefault();
        scrollToBottom();
      } else if (e.key === "Home") {
        e.preventDefault();
        scrollToTop();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [scrollToBottom, scrollToTop]);

  if (!scrollable) return null;

  return createPortal(
    <div
      dir="ltr"
      className="print:hidden"
      // Left edge, lifted above the Noor support bubble (bottom-6 left-4, 56px tall)
      style={{ position: "fixed", left: 30, bottom: 96, zIndex: 40 }}
    >
      <div className="flex flex-col items-center overflow-hidden rounded-full border border-border/60 bg-background/70 shadow-md backdrop-blur-md">
        <button
          type="button"
          onClick={scrollToTop}
          title="الصعود لأعلى التقرير (Ctrl+Home)"
          aria-label="الصعود لأعلى التقرير"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <ChevronsUp className="h-3.5 w-3.5" />
        </button>
        <div className="h-px w-4 bg-border/60" />
        <button
          type="button"
          onClick={scrollToBottom}
          title="النزول لآخر التقرير (Ctrl+End)"
          aria-label="النزول لآخر التقرير"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <ChevronsDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default ReportScrollJump;
