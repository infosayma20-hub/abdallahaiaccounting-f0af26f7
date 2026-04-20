/**
 * GlobalFormFocusProvider — Cross-system Smart Focus UX layer (Amwali ERP)
 * ────────────────────────────────────────────────────────────────────────
 * Mounts ONCE at the app root and silently powers all forms across the system:
 *
 *  ✦ Auto-focus first logical field on every navigation.
 *      Priority: [data-primary-field] > [data-autofocus] > first visible enabled input/select/combobox
 *      Skips: pages with [data-no-autofocus], inputs with [data-smart-skip], the global search,
 *             AI chatbot inputs, and login/auth pages.
 *  ✦ Enter → moves to next field (instead of submitting unexpectedly).
 *      Skips: textareas, buttons, opt-out fields ([data-no-enter-nav]),
 *             open dropdowns / comboboxes / Radix popovers / cmdk lists.
 *  ✦ Smooth scroll-into-view for focused field on mobile.
 *  ✦ Fully RTL-aware. Zero per-page wiring required.
 *
 * To opt out for a specific page:   add `data-no-autofocus` to its root container.
 * To opt out for a specific field:  add `data-smart-skip` (skips chain) or `data-no-enter-nav`.
 * To override priority field:       add `data-primary-field` or `data-autofocus="true"`.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([disabled]):not([readonly]):not([data-smart-skip])',
  'textarea:not([disabled]):not([readonly]):not([data-smart-skip])',
  'select:not([disabled]):not([data-smart-skip])',
  '[role="combobox"]:not([disabled]):not([data-smart-skip])',
  'button[data-smart-focusable]:not([disabled])',
].join(",");

const ROUTES_WITHOUT_AUTOFOCUS = [
  "/auth", "/reset-password", "/pricing", "/terms", "/privacy",
  "/super-admin", "/share", "/branch-display", "/receipt", "/survey",
  "/employee", "/portal", "/apps", "/menu", "/home",
];

function isVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  if (el.hasAttribute("data-smart-skip")) return false;
  if (el.closest("[data-no-autofocus]")) return false;
  // Skip global search and chatbots
  if (el.closest("[data-global-search]")) return false;
  if (el.closest("[data-ai-chatbot]")) return false;
  if (el.closest("[role='dialog'][data-state='closed']")) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  // Check ancestors for hidden state
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    const ps = window.getComputedStyle(parent);
    if (ps.display === "none" || ps.visibility === "hidden") return false;
    parent = parent.parentElement;
  }
  return true;
}

function findPrimaryField(): HTMLElement | null {
  // 1) Explicit primary
  const primary = document.querySelector<HTMLElement>("[data-primary-field]");
  if (primary && isVisible(primary)) return primary;
  // 2) data-autofocus opt-in
  const explicit = document.querySelector<HTMLElement>('[data-autofocus="true"], [data-smart-first="true"]');
  if (explicit && isVisible(explicit)) return explicit;
  // 3) First visible focusable inside main content
  const main = document.querySelector<HTMLElement>("main, [role='main'], #app-content") || document.body;
  const list = Array.from(main.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return list.find(isVisible) || null;
}

function getFocusableSiblings(target: HTMLElement): HTMLElement[] {
  // Look within the closest form / dialog / page container so we don't jump out
  const root = target.closest("form, [role='dialog'], main, body") as HTMLElement | null;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

const GlobalFormFocusProvider = () => {
  const location = useLocation();
  const lastPathRef = useRef<string>("");

  // Auto-focus on route change
  useEffect(() => {
    const path = location.pathname;
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    // Skip routes that should not auto-focus
    if (ROUTES_WITHOUT_AUTOFOCUS.some(p => path === p || path.startsWith(p + "/"))) return;

    // Wait briefly for lazy-loaded pages + data to mount
    const t = setTimeout(() => {
      // Don't steal focus from user
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae !== document.body && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.getAttribute("role") === "combobox")) return;
      // Don't auto-focus if a modal/dialog is open (it manages its own focus)
      if (document.querySelector("[role='dialog'][data-state='open']")) return;

      const target = findPrimaryField();
      if (target) {
        try {
          target.focus({ preventScroll: false });
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* noop */ }
      }
    }, 250);

    return () => clearTimeout(t);
  }, [location.pathname]);

  // Global Enter → next field
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();

      // Always allow Enter on textarea, submit
      if (tag === "textarea") return;
      if (tag === "a") return;
      if (target.getAttribute("type") === "submit") return;
      if (target.hasAttribute("data-no-enter-nav")) return;
      if (target.closest("[data-no-enter-nav]")) return;

      // Allow Enter inside OPEN dropdowns / comboboxes (let them select an option)
      if (target.getAttribute("role") === "combobox" && target.getAttribute("aria-expanded") === "true") return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (target.closest("[role='listbox']")) return;
      if (target.closest("[cmdk-root]")) return;
      // Don't interfere with global search
      if (target.closest("[data-global-search]")) return;
      // Don't interfere with chatbot inputs
      if (target.closest("[data-ai-chatbot]")) return;

      // Act on inputs, contenteditables, AND closed Select/Combobox triggers
      const role = target.getAttribute("role");
      const isClosedTrigger =
        (role === "combobox" && target.getAttribute("aria-expanded") !== "true") ||
        (tag === "button" && target.hasAttribute("aria-haspopup"));

      if (tag !== "input" && target.getAttribute("contenteditable") !== "true" && !isClosedTrigger) return;

      if (tag === "input") {
        const inputType = (target.getAttribute("type") || "text").toLowerCase();
        if (["checkbox", "radio", "file", "color", "range", "submit", "button", "reset"].includes(inputType)) return;
      }

      const focusables = getFocusableSiblings(target);
      const idx = focusables.indexOf(target);
      if (idx === -1) return;

      const next = focusables[idx + 1];
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        try {
          next.focus();
          next.scrollIntoView({ block: "center", behavior: "smooth" });
          // If the next element is a Select/Combobox trigger, do NOT auto-open it.
          // Swallow the synthetic Enter that some Radix triggers interpret as "open".
          const nextRole = next.getAttribute("role");
          const isTrigger =
            nextRole === "combobox" ||
            next.tagName.toLowerCase() === "button" ||
            next.hasAttribute("aria-haspopup");
          if (isTrigger) {
            const swallow = (ev: KeyboardEvent) => {
              // Only swallow Enter — Space should still be allowed to open the dropdown
              if (ev.key === "Enter") {
                ev.preventDefault();
                ev.stopPropagation();
              }
              next.removeEventListener("keydown", swallow, true);
              next.removeEventListener("keyup", swallow, true);
            };
            next.addEventListener("keydown", swallow, true);
            next.addEventListener("keyup", swallow, true);
            // Cleanup if no follow-up key fires
            setTimeout(() => {
              next.removeEventListener("keydown", swallow, true);
              next.removeEventListener("keyup", swallow, true);
            }, 200);
          }
        } catch { /* noop */ }
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  // Global "select-all on focus" for numeric / pre-filled inputs.
  // Behavior:
  //   • When focus moves to an <input type="number"> or [data-numeric] or [data-auto-select],
  //     OR a text input that already contains a value AND was reached via keyboard (Tab/Enter)
  //     or programmatic focus (not a manual mouse click positioning the caret),
  //   • Auto-select the entire value so typing replaces it instantly.
  //
  // Constraints:
  //   • Skip readonly / disabled
  //   • Skip if value is empty
  //   • Skip if the user explicitly placed the caret with a mouse click (mousedown→focus chain)
  //   • Opt-out: [data-no-auto-select]
  useEffect(() => {
    let lastPointerDownTarget: EventTarget | null = null;
    let lastPointerDownAt = 0;

    const onPointerDown = (e: Event) => {
      lastPointerDownTarget = e.target;
      lastPointerDownAt = Date.now();
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.tagName.toLowerCase() !== "input") return;
      const input = el as HTMLInputElement;
      if (input.disabled || input.readOnly) return;
      if (input.hasAttribute("data-no-auto-select")) return;
      if (input.closest("[data-no-auto-select]")) return;

      const type = (input.getAttribute("type") || "text").toLowerCase();
      const isNumeric =
        type === "number" ||
        input.hasAttribute("data-numeric") ||
        input.hasAttribute("data-auto-select") ||
        input.inputMode === "numeric" ||
        input.inputMode === "decimal";

      // Only operate on numeric, or text inputs that opted in via data-auto-select
      if (!isNumeric && !input.hasAttribute("data-auto-select")) return;

      // Must have a non-empty value to be worth selecting
      const val = input.value;
      if (val === undefined || val === null || String(val).length === 0) return;
      if (String(val).trim() === "") return;

      // If the focus was triggered by a real mouse click on this same input,
      // respect the user's caret placement (do NOT select-all).
      const cameFromMouse =
        lastPointerDownTarget === input && Date.now() - lastPointerDownAt < 400;
      if (cameFromMouse) return;

      // Defer to next tick so the browser's default focus handling doesn't
      // overwrite our selection (e.g. number inputs in some browsers).
      requestAnimationFrame(() => {
        try {
          if (document.activeElement !== input) return;
          input.select();
        } catch { /* noop */ }
      });
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);

  return null;
};

export default GlobalFormFocusProvider;
