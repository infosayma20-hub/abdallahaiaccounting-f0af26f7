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

  const run = useCallback(async (force: boolean) => {
    setState((prev) => ({ ...prev, checking: true }));
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
  }, []);

  useEffect(() => {
    void run(false);
  }, [run]);

  const recheck = useCallback(() => run(true), [run]);

  return { ...state, recheck };
}
