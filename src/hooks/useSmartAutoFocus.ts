/**
 * useSmartAutoFocus — focuses the first valid field inside a ref'd container
 * on mount, after a small delay. Falls back to next valid input if the first
 * is hidden/disabled. RTL & a11y safe.
 */
import { useEffect, RefObject } from "react";

const SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]):not([data-smart-skip])',
  'textarea:not([disabled]):not([readonly]):not([data-smart-skip])',
  'select:not([disabled]):not([data-smart-skip])',
  '[role="combobox"]:not([disabled]):not([data-smart-skip])',
].join(",");

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const s = window.getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
}

export interface SmartAutoFocusOptions {
  /** Skip if this is true. */
  disabled?: boolean;
  /** Delay before focusing (defaults 120ms). */
  delay?: number;
  /** Optional selector to prefer for the first field. */
  selector?: string;
}

export function useSmartAutoFocus<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  deps: any[] = [],
  options: SmartAutoFocusOptions = {}
) {
  const { disabled = false, delay = 120, selector } = options;

  useEffect(() => {
    if (disabled) return;
    const root = ref.current;
    if (!root) return;

    const t = setTimeout(() => {
      if (root.contains(document.activeElement) && document.activeElement !== document.body) return;
      let target: HTMLElement | null = null;
      if (selector) target = root.querySelector<HTMLElement>(selector);
      if (!target) {
        const list = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(isVisible);
        target = list[0] || null;
      }
      if (target) {
        target.focus();
        try { target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* noop */ }
      }
    }, delay);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, delay, selector, ...deps]);
}

export default useSmartAutoFocus;