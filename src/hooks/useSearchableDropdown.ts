/**
 * useSearchableDropdown — Generic keyboard navigation for custom search dropdowns.
 * ─────────────────────────────────────────────────────────────────────────────────
 * Provides a unified arrow-key / Enter / Escape data-entry experience for ANY
 * searchable dropdown across the system (invoices, vouchers, customers, products,
 * accounts, journal entries, HR, modals, inline tables, etc).
 *
 * Behavior:
 *   • ArrowDown / ArrowUp → move highlight between options (with scroll-into-view).
 *   • Enter   → selects the highlighted option AND advances focus to the next field.
 *   • Escape  → closes the dropdown.
 *   • Typing  → only updates the search term; never selects.
 *   • If dropdown is closed and user presses ↓ → opens it.
 *
 * Usage:
 *   const dd = useSearchableDropdown({
 *     items: filteredContacts,
 *     onSelect: (item, inputEl) => selectContact(item),
 *     isOpen: showContactDropdown,
 *     setOpen: setShowContactDropdown,
 *   });
 *
 *   <Input
 *     ref={dd.inputRef}
 *     onKeyDown={dd.onKeyDown}
 *     onFocus={() => dd.open()}
 *     onBlur={() => dd.closeDelayed()}
 *     value={search}
 *     onChange={e => { setSearch(e.target.value); dd.open(); dd.reset(); }}
 *     data-no-enter-nav="true"
 *   />
 *   {dd.isOpen && (
 *     <div>
 *       {items.map((it, idx) => (
 *         <button
 *           key={it.id}
 *           ref={el => dd.registerOption(idx, el)}
 *           onMouseEnter={() => dd.setActive(idx)}
 *           onClick={() => dd.selectAt(idx)}
 *           className={dd.activeIndex === idx ? "bg-muted" : ""}
 *         >...</button>
 *       ))}
 *     </div>
 *   )}
 */
import { useCallback, useEffect, useRef, useState, KeyboardEvent as ReactKeyboardEvent } from "react";

export interface UseSearchableDropdownOptions<T> {
  /** Filtered items currently shown in the dropdown. */
  items: T[];
  /** Called when an option is confirmed (Enter or click). */
  onSelect: (item: T, inputEl: HTMLInputElement | null) => void;
  /** Controlled open state (parent owns `showDropdown`). */
  isOpen: boolean;
  /** Setter for the open state. */
  setOpen: (open: boolean) => void;
  /** Number of "extra" non-item rows that appear BEFORE items in the list (e.g. an "Add new" row). When set, ArrowDown can also land on those rows; default 0 — only items navigable. */
  headerOptionCount?: number;
  /** Called when ArrowDown lands on a header option (idx is negative: -1 = first header, -2 = second, etc). Optional. */
  onHeaderSelect?: (headerIdx: number, inputEl: HTMLInputElement | null) => void;
  /** Whether to advance focus to next field after selection. Default true. */
  advanceFocus?: boolean;
  /** Delay (ms) before closing on blur to allow click events to register. Default 200. */
  blurCloseDelay?: number;
  /**
   * If true and items.length > 0, automatically highlight the first item (index 0)
   * so that Enter selects an existing item instead of falling through to a header
   * option (e.g. "Add new"). Header options remain reachable only via explicit
   * ArrowUp navigation past index 0 or by mouse/click. Default false (back-compat).
   */
  autoHighlightFirstItem?: boolean;
}

export interface UseSearchableDropdownReturn {
  inputRef: React.RefObject<HTMLInputElement>;
  activeIndex: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  closeDelayed: () => void;
  reset: () => void;
  setActive: (idx: number) => void;
  selectAt: (idx: number) => void;
  registerOption: (idx: number, el: HTMLElement | null) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}

const FOCUSABLE_NEXT = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]):not([data-smart-skip])',
  'textarea:not([disabled]):not([readonly]):not([data-smart-skip])',
  'select:not([disabled]):not([data-smart-skip])',
  '[role="combobox"]:not([disabled]):not([data-smart-skip])',
  'button[data-smart-focusable]:not([disabled])',
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const s = window.getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
}

function focusNextField(currentInput: HTMLInputElement | null) {
  if (!currentInput) return;
  // Prefer same form / dialog scope so we don't jump out
  const root = currentInput.closest("form, [role='dialog'], main, body") as HTMLElement | null;
  if (!root) return;
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_NEXT)).filter(isVisible);
  const idx = focusables.indexOf(currentInput);
  if (idx === -1) return;
  const next = focusables[idx + 1];
  if (next) {
    try {
      next.focus();
      next.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch { /* noop */ }
  }
}

export function useSearchableDropdown<T>(
  options: UseSearchableDropdownOptions<T>
): UseSearchableDropdownReturn {
  const {
    items,
    onSelect,
    isOpen,
    setOpen,
    headerOptionCount = 0,
    onHeaderSelect,
    advanceFocus = true,
    blurCloseDelay = 200,
    autoHighlightFirstItem = false,
  } = options;

  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const itemsRef = useRef<T[]>(items);
  const optionRefs = useRef<Map<number, HTMLElement>>(new Map());
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Reset index when items list changes (search changes).
  // If auto-highlight is on and items exist, snap to first item so Enter selects it.
  useEffect(() => {
    setActiveIndex(autoHighlightFirstItem && items.length > 0 ? 0 : -1);
  }, [items.length, autoHighlightFirstItem]);

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = optionRefs.current.get(activeIndex);
    if (el) {
      try { el.scrollIntoView({ block: "nearest" }); } catch { /* noop */ }
    }
  }, [activeIndex]);

  const setActive = useCallback((idx: number) => setActiveIndex(idx), []);
  const reset = useCallback(() => setActiveIndex(-1), []);

  const open = useCallback(() => {
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
    setOpen(true);
  }, [setOpen]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [setOpen]);

  const closeDelayed = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, blurCloseDelay);
  }, [setOpen, blurCloseDelay]);

  const selectAt = useCallback((idx: number) => {
    const list = itemsRef.current;
    const inputEl = inputRef.current;
    if (idx >= 0 && list[idx]) {
      onSelect(list[idx], inputEl);
      setActiveIndex(-1);
      setOpen(false);
      if (advanceFocus) {
        // Defer to allow parent state updates to settle
        setTimeout(() => focusNextField(inputEl), 50);
      }
    } else if (idx < 0 && onHeaderSelect) {
      onHeaderSelect(idx, inputEl);
      setActiveIndex(-1);
      setOpen(false);
    }
  }, [onSelect, onHeaderSelect, advanceFocus, setOpen]);

  const registerOption = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) optionRefs.current.set(idx, el);
    else optionRefs.current.delete(idx);
  }, []);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLInputElement>) => {
    const max = items.length - 1;
    // When auto-highlighting first item, never let ArrowUp dive into header rows
    // — Enter must select an existing item, not a stray header action.
    const min = headerOptionCount > 0 && !autoHighlightFirstItem ? -headerOptionCount : 0;

    // Open on ArrowDown if closed
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      open();
      setActiveIndex(0);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(i => Math.min(i + 1, max));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(i => Math.max(i - 1, min));
    } else if (e.key === "Enter") {
      const idx = activeIndexRef.current;
      // With autoHighlightFirstItem, NEVER let Enter trigger a header action
      // even if the user manually navigated up. Enter is reserved for items.
      const headerAllowed = !autoHighlightFirstItem;
      if (isOpen && (idx >= 0 || (idx < 0 && headerAllowed && headerOptionCount > 0 && onHeaderSelect))) {
        e.preventDefault();
        e.stopPropagation();
        selectAt(idx);
      } else if (isOpen) {
        // Open but nothing highlighted — block submit, don't move focus
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      // Tab confirms selection if one is highlighted, else just closes & lets default Tab proceed
      const idx = activeIndexRef.current;
      if (isOpen && idx >= 0) {
        // Don't preventDefault — let Tab move focus naturally after selecting
        selectAt(idx);
      }
    }
  }, [isOpen, items.length, headerOptionCount, onHeaderSelect, open, close, selectAt, autoHighlightFirstItem]);

  // Cleanup blur timer
  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  return {
    inputRef,
    activeIndex,
    isOpen,
    open,
    close,
    closeDelayed,
    reset,
    setActive,
    selectAt,
    registerOption,
    onKeyDown,
  };
}

export default useSearchableDropdown;
