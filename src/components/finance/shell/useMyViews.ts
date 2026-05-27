import { useCallback, useEffect, useState } from "react";
import type { FilterCondition, SavedView } from "./types";

/**
 * Persists "My Views" per page in localStorage.
 * Each view stores its filter conditions + sort + visible columns.
 * Mirrors D365 F&O "My view" behaviour (per-user saved layouts).
 */
export function useMyViews(storageKey: string | undefined) {
  const fullKey = storageKey ? `finance.views.${storageKey}` : null;
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullKey) return;
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { views: SavedView[]; activeId: string | null };
        setViews(parsed.views || []);
        setActiveViewId(parsed.activeId || null);
      }
    } catch {
      /* ignore */
    }
  }, [fullKey]);

  const persist = useCallback(
    (next: SavedView[], nextActive: string | null) => {
      if (!fullKey) return;
      localStorage.setItem(fullKey, JSON.stringify({ views: next, activeId: nextActive }));
    },
    [fullKey]
  );

  const saveView = useCallback(
    (name: string, filters: FilterCondition[]) => {
      const view: SavedView = {
        id: crypto.randomUUID(),
        name,
        filters,
        createdAt: new Date().toISOString(),
      };
      const next = [...views, view];
      setViews(next);
      setActiveViewId(view.id);
      persist(next, view.id);
      return view;
    },
    [views, persist]
  );

  const updateView = useCallback(
    (id: string, patch: Partial<SavedView>) => {
      const next = views.map((v) => (v.id === id ? { ...v, ...patch } : v));
      setViews(next);
      persist(next, activeViewId);
    },
    [views, activeViewId, persist]
  );

  const deleteView = useCallback(
    (id: string) => {
      const next = views.filter((v) => v.id !== id);
      const nextActive = activeViewId === id ? null : activeViewId;
      setViews(next);
      setActiveViewId(nextActive);
      persist(next, nextActive);
    },
    [views, activeViewId, persist]
  );

  const activateView = useCallback(
    (id: string | null) => {
      setActiveViewId(id);
      persist(views, id);
    },
    [views, persist]
  );

  const activeView = views.find((v) => v.id === activeViewId) || null;

  return { views, activeView, activeViewId, saveView, updateView, deleteView, activateView };
}