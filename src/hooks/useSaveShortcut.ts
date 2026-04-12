import { useEffect } from "react";

/**
 * Listen for the global Ctrl+S "app:save" event.
 * Pass your save handler and it will be called when user presses Ctrl+S.
 */
export function useSaveShortcut(onSave: (() => void) | undefined) {
  useEffect(() => {
    if (!onSave) return;
    const handler = () => onSave();
    window.addEventListener("app:save", handler);
    return () => window.removeEventListener("app:save", handler);
  }, [onSave]);
}
