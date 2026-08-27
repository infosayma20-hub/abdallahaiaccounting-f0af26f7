import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared, app-wide connectivity status.
 *
 * Uses the same "confirm-then-flip" strategy proven in the POS offline layer:
 * `navigator.onLine` is only a hint — we verify against three independent
 * endpoints and only declare a real outage after 3 consecutive failures.
 * This prevents Wi-Fi flicker / captive-portal probes from scaring the user.
 */

export type NetworkQuality = "stable" | "verifying" | "offline";

const PROBE_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 3500;
const OFFLINE_RECHECK_MS = 10_000;

async function probe(url: string, timeoutMs: number, init?: RequestInit): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", ...init });
    clearTimeout(t);
    return res.ok || res.type === "opaque";
  } catch {
    return false;
  }
}

export async function checkRealConnectivity(): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  const results = await Promise.all([
    supabaseUrl && apiKey
      ? probe(`${supabaseUrl}/rest/v1/`, PROBE_TIMEOUT_MS, { method: "HEAD", headers: { apikey: apiKey } })
      : Promise.resolve(false),
    probe("https://1.1.1.1/cdn-cgi/trace", 3500, { method: "GET", mode: "cors" }),
    probe("https://www.gstatic.com/generate_204", 3500, { method: "GET", mode: "no-cors" }),
  ]);

  return results.some(Boolean);
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [quality, setQuality] = useState<NetworkQuality>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "stable",
  );

  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsRef = useRef(0);
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;

  const verifyAndFlip = useCallback(() => {
    if (verifyTimerRef.current) return;
    setQuality("verifying");
    failsRef.current = 0;

    const run = async () => {
      const ok = await checkRealConnectivity();
      if (ok) {
        failsRef.current = 0;
        verifyTimerRef.current = null;
        setQuality("stable");
        setIsOnline(true);
        return;
      }
      failsRef.current += 1;
      if (failsRef.current >= 3) {
        verifyTimerRef.current = null;
        setQuality("offline");
        setIsOnline(false);
        return;
      }
      verifyTimerRef.current = setTimeout(run, RETRY_DELAY_MS);
    };

    void run();
  }, []);

  useEffect(() => {
    const handler = () => verifyAndFlip();
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current);
        verifyTimerRef.current = null;
      }
    };
  }, [verifyAndFlip]);

  // While offline, poll frequently so recovery is noticed within seconds.
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(() => {
      void checkRealConnectivity().then((ok) => {
        if (ok) {
          setIsOnline(true);
          setQuality("stable");
        }
      });
    }, OFFLINE_RECHECK_MS);
    return () => clearInterval(id);
  }, [isOnline]);

  return { isOnline, quality, recheck: verifyAndFlip };
}
