import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPortalTerms, type PortalProfile, type PortalTerms } from '@/lib/portal/profile';

export interface PortalProfileState {
  profile: PortalProfile | null;
  hiddenSections: string[];
  terms: PortalTerms;
  loading: boolean;
  isSection: (key: string) => boolean;
}

interface CachedSettings {
  profile: PortalProfile | null;
  hiddenSections: string[];
}

// Module-level cache: the portal renders many components that all need the
// profile; they must share one `get_settings` round-trip.
let cache: CachedSettings | null = null;
let inflight: Promise<CachedSettings> | null = null;
const listeners = new Set<(s: CachedSettings) => void>();

async function loadSettings(): Promise<CachedSettings> {
  try {
    const { data } = await supabase.functions.invoke('malaki-data', {
      body: { action: 'get_settings' },
    });
    const s = data?.settings;
    const raw = s?.portal_profile;
    const profile: PortalProfile | null =
      raw === 'restaurant' || raw === 'retail' || raw === 'general' ? raw : null;
    const hiddenSections = Array.isArray(s?.hidden_sections)
      ? (s.hidden_sections as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return { profile, hiddenSections };
  } catch {
    // Never break the portal because of a settings read — fall back to legacy.
    return { profile: null, hiddenSections: [] };
  }
}

export function resetPortalProfileCache() {
  cache = null;
  inflight = null;
}

export function usePortalProfile(): PortalProfileState {
  const [state, setState] = useState<CachedSettings | null>(cache);

  useEffect(() => {
    if (cache) {
      setState(cache);
      return;
    }
    let alive = true;
    const onResolved = (s: CachedSettings) => { if (alive) setState(s); };
    listeners.add(onResolved);

    if (!inflight) {
      inflight = loadSettings().then((s) => {
        cache = s;
        listeners.forEach((l) => l(s));
        return s;
      });
    } else {
      inflight.then(onResolved);
    }

    return () => { alive = false; listeners.delete(onResolved); };
  }, []);

  const profile = state?.profile ?? null;
  const hiddenSections = state?.hiddenSections ?? [];

  return {
    profile,
    hiddenSections,
    terms: getPortalTerms(profile),
    loading: state === null,
    isSection: (key: string) => !hiddenSections.includes(key),
  };
}