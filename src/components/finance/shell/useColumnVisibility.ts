import { useCallback, useEffect, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  /** Required columns can never be hidden (e.g. ref number, amount, actions). */
  required?: boolean;
  /** Default visibility (defaults to true). */
  defaultVisible?: boolean;
}

const PREFIX = "cols-";

/**
 * Per-page column visibility, persisted in localStorage.
 * Pattern: stable cross-tab via `storage` event.
 */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const fullKey = `${PREFIX}${storageKey}`;

  const computeInitial = useCallback((): Record<string, boolean> => {
    const base: Record<string, boolean> = {};
    for (const c of columns) base[c.key] = c.defaultVisible ?? true;
    if (typeof window === "undefined") return base;
    try {
      const raw = window.localStorage.getItem(fullKey);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, boolean>;
        for (const c of columns) {
          if (c.required) base[c.key] = true;
          else if (typeof stored[c.key] === "boolean") base[c.key] = stored[c.key];
        }
      }
    } catch { /* ignore */ }
    return base;
  }, [fullKey, columns]);

  const [visibility, setVisibility] = useState<Record<string, boolean>>(computeInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(visibility));
    } catch { /* ignore */ }
  }, [fullKey, visibility]);

  // Cross-tab sync via storage event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== fullKey || !e.newValue) return;
      try {
        const stored = JSON.parse(e.newValue) as Record<string, boolean>;
        setVisibility((prev) => {
          const next = { ...prev };
          for (const c of columns) {
            if (c.required) next[c.key] = true;
            else if (typeof stored[c.key] === "boolean") next[c.key] = stored[c.key];
          }
          return next;
        });
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [fullKey, columns]);

  const toggle = useCallback((key: string) => {
    setVisibility((v) => {
      const col = columns.find((c) => c.key === key);
      if (col?.required) return v;
      return { ...v, [key]: !v[key] };
    });
  }, [columns]);

  const showAll = useCallback(() => {
    setVisibility(() => {
      const next: Record<string, boolean> = {};
      for (const c of columns) next[c.key] = true;
      return next;
    });
  }, [columns]);

  const hideAllOptional = useCallback(() => {
    setVisibility(() => {
      const next: Record<string, boolean> = {};
      for (const c of columns) next[c.key] = !!c.required;
      return next;
    });
  }, [columns]);

  const isVisible = useCallback(
    (key: string) => visibility[key] !== false,
    [visibility],
  );

  const hiddenCount = columns.filter((c) => !c.required && visibility[c.key] === false).length;

  return { visibility, isVisible, toggle, showAll, hideAllOptional, hiddenCount, columns };
}

export type UseColumnVisibilityReturn = ReturnType<typeof useColumnVisibility>;