import { useEffect, useState } from "react";
import { checkBridgeHealth } from "@/lib/print-bridge-client";

/** Reuses the existing print-bridge health check (no DB). null = still checking. */
export function usePrinterOnline(pollMs = 15000): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const r = await checkBridgeHealth();
        if (!cancelled) setOnline(!!r.online);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    run();
    const t = setInterval(run, pollMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [pollMs]);
  return online;
}
