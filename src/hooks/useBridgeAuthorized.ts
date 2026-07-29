import { useCallback, useEffect, useState } from "react";
import { checkBridgeAuthorized, type BridgeAuthResult } from "@/lib/pos-device-auth";

type State = {
  checking: boolean;
  authorized: boolean;
  bridgeUrl: string | null;
  version: string | null;
};

/**
 * Hook that resolves whether the current device is allowed to use POS.
 * Authorization == Print Bridge reachable on 127.0.0.1:3001 (or localhost).
 *
 * The first call hits the cached result (per-tab session cache, 60s TTL).
 * Call `recheck()` to bypass the cache (used by manual retry buttons).
 */
export function useBridgeAuthorized() {
  const [state, setState] = useState<State>({
    checking: true,
    authorized: false,
    bridgeUrl: null,
    version: null,
  });

  // `silent=true` performs a background revalidation WITHOUT flipping
  // `checking` back to true. Critical for the heartbeat (every 15s) so
  // it doesn't blank POS with a full-screen "Checking…" spinner every
  // time it re-probes the bridge.
  const run = useCallback(async (force: boolean, silent: boolean = false) => {
    setState((prev) => (silent ? prev : { ...prev, checking: true }));
    let result: BridgeAuthResult;
    try {
      result = await checkBridgeAuthorized({ force });
    } catch {
      result = { authorized: false, bridgeUrl: null, version: null, fromCache: false };
    }
    setState({
      checking: false,
      authorized: result.authorized,
      bridgeUrl: result.bridgeUrl,
      version: result.version,
    });
    // Safety net: the first probe uses a short 1.8s timeout so POS opens fast.
    // If it came back negative (and wasn't just a cached negative), retry ONCE
    // in the background with a generous timeout so a slow-but-alive Bridge
    // (cold start / busy printer) still authorizes the device without the
    // cashier having to click "إعادة الفحص".
    if (!result.authorized && !result.fromCache) {
      try {
        const slow = await checkBridgeAuthorized({ force: true, timeoutMs: 6000 });
        if (slow.authorized) {
          setState({
            checking: false,
            authorized: true,
            bridgeUrl: slow.bridgeUrl,
            version: slow.version,
          });
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    void run(false);
  }, [run]);

  // Manual button → show feedback. Background heartbeat → silent.
  const recheck = useCallback((opts?: { silent?: boolean }) => run(true, opts?.silent === true), [run]);

  return { ...state, recheck };
}
