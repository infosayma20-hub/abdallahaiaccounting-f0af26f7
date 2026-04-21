import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "amwali_fast_entry_mode";
const EVENT = "amwali_fast_entry_mode_changed";

const read = (): boolean => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true; // default ON — better UX for accountants
    return v === "1" || v === "true";
  } catch {
    return true;
  }
};

/**
 * Fast entry mode (وضع الإدخال السريع):
 *   - ON (default): after save → toast + auto-reset form, no blocking screen.
 *   - OFF: legacy success screen with explicit buttons.
 *
 * Persisted in localStorage so it survives reloads. Cross-tab + cross-component
 * sync via a CustomEvent.
 */
export function useFastEntryMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((v: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
    setEnabled(v);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  return [enabled, update];
}

export const isFastEntryEnabled = read;
