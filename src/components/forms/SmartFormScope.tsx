/**
 * SmartFormScope — Global Form Focus UX System (Amwali ERP)
 * ────────────────────────────────────────────────────────────
 * Drop this around any form (or even an entire page) to instantly get:
 *   • Auto-focus the first logical input on mount.
 *   • Enter → moves to next input (does NOT submit) — accountant-style data entry.
 *   • Active section glow (via .smart-form-section).
 *   • Smooth scroll-into-view for the focused field on mobile.
 *   • Fully RTL-aware. Skips disabled / hidden / data-no-autofocus fields.
 *
 * Usage:
 *   <SmartFormScope>
 *     <YourFormHere />
 *   </SmartFormScope>
 *
 * Opt-out:
 *   • Add `data-no-autofocus` to the wrapper to disable auto-focus.
 *   • Add `data-no-enter-nav` to a specific input to allow Enter to submit there.
 *   • Add `data-smart-skip` to skip a field in the tab/Enter chain.
 */
import { useEffect, useRef, useCallback } from "react";

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]):not([data-smart-skip])',
  'textarea:not([disabled]):not([readonly]):not([data-smart-skip])',
  'select:not([disabled]):not([data-smart-skip])',
  '[role="combobox"]:not([disabled]):not([data-smart-skip])',
  'button[data-smart-focusable]:not([disabled])',
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("data-smart-skip")) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return true;
}

function getFocusables(root: HTMLElement): HTMLElement[] {
  const list = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return list.filter(isVisible);
}

export interface SmartFormScopeProps {
  children: React.ReactNode;
  /** Disable auto-focusing the first field on mount. */
  disableAutoFocus?: boolean;
  /** Disable Enter→next-field navigation. */
  disableEnterNav?: boolean;
  /** Optional CSS selector for the field to focus first (overrides default). */
  firstFieldSelector?: string;
  /** Delay (ms) before auto-focus runs — useful if data needs to load. */
  autoFocusDelay?: number;
  className?: string;
  /** Optional text direction (e.g. "rtl"). Forwarded to the wrapper div. */
  dir?: "rtl" | "ltr" | "auto";
}

const SmartFormScope = ({
  children,
  disableAutoFocus = false,
  disableEnterNav = false,
  firstFieldSelector,
  autoFocusDelay = 120,
  className,
  dir,
}: SmartFormScopeProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-focus first valid field on mount
  useEffect(() => {
    if (disableAutoFocus) return;
    const root = rootRef.current;
    if (!root) return;
    if (root.dataset.noAutofocus !== undefined) return;

    const t = setTimeout(() => {
      // If anything inside is already focused, leave it.
      if (root.contains(document.activeElement) && document.activeElement !== document.body) return;

      let target: HTMLElement | null = null;
      if (firstFieldSelector) {
        target = root.querySelector<HTMLElement>(firstFieldSelector);
      }
      if (!target) {
        const focusables = getFocusables(root);
        target = focusables[0] || null;
      }
      if (target) {
        target.focus({ preventScroll: false });
        try {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* noop */ }
      }
    }, autoFocusDelay);

    return () => clearTimeout(t);
  }, [disableAutoFocus, firstFieldSelector, autoFocusDelay]);

  // Enter → next field
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disableEnterNav) return;
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement;
      if (!target) return;

      // Skip when user holds shift / meta — those are intentional.
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

      // Allow Enter on textarea (newline), buttons (click), and opt-out fields.
      const tag = target.tagName.toLowerCase();
      if (tag === "textarea") return;
      if (tag === "button") return;
      if (target.hasAttribute("data-no-enter-nav")) return;
      if (target.getAttribute("type") === "submit") return;

      // Allow Enter inside open dropdowns / comboboxes (let them select)
      if (target.getAttribute("role") === "combobox" && target.getAttribute("aria-expanded") === "true") return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (target.closest("[role='listbox']")) return;

      const root = rootRef.current;
      if (!root) return;
      const focusables = getFocusables(root);
      const idx = focusables.indexOf(target);
      if (idx === -1) return;

      const next = focusables[idx + 1];
      if (next) {
        e.preventDefault();
        next.focus();
        try {
          next.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* noop */ }
      }
    },
    [disableEnterNav]
  );

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className={className} dir={dir}>
      {children}
    </div>
  );
};

export default SmartFormScope;

/* Re-export hook form for advanced custom usage */
export { getFocusables };