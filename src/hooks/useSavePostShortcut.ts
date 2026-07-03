import { useEffect } from "react";

/**
 * Ctrl/Cmd + Enter → trigger save & post on any form screen.
 * Works everywhere (inputs, selects, textareas).
 */
export default function useSavePostShortcut(
  onSave: () => void,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled, onSave]);
}