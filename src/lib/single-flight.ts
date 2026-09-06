/**
 * De-duplicate identical in-flight async work.
 *
 * Many hooks resolve the same tenant-level facts (owner id, company row…) and
 * mount at the same moment on a screen, so the app used to fire 5–9 identical
 * requests per page open. `singleFlight` makes concurrent callers share one
 * promise; the entry is dropped as soon as it settles, so nothing is cached
 * beyond the burst and every later call re-reads fresh data.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

export default singleFlight;
