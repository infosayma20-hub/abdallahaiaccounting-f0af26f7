import { useSyncExternalStore } from "react";

/**
 * Tiny shared flag: POSPage publishes whether its first-paint data is still
 * loading, so the single POS boot popup (rendered by POSDeviceAuthGuard)
 * stays up until BOTH the device checks and the screen data are ready.
 */
let pageLoading = false;
const listeners = new Set<() => void>();

export function setPosPageLoading(value: boolean) {
  if (pageLoading === value) return;
  pageLoading = value;
  listeners.forEach((l) => l());
}

export function usePosPageLoading() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pageLoading,
    () => false,
  );
}
