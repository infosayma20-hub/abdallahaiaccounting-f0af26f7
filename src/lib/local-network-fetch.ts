/**
 * Chrome Local Network Access / Private Network Access helper.
 *
 * Requests from the hosted app to the cashier PC's local Print Bridge should
 * stay as plain CORS for loopback URLs. The experimental `targetAddressSpace`
 * hint is available only for explicit LAN-IP calls that need it.
 */
export type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: "local" | "private";
};

/**
 * AbortSignal.timeout landed after the Edge 92 builds still used on some POS
 * machines. Calling it there throws before fetch starts, which makes a healthy
 * bridge look offline. Keep one compatibility helper for every bridge call.
 */
export function localNetworkTimeoutSignal(timeoutMs: number): AbortSignal {
  const nativeTimeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  }).timeout;
  if (typeof nativeTimeout === "function") return nativeTimeout(timeoutMs);

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function withLocalNetworkAccess(init: RequestInit = {}): LocalNetworkRequestInit {
  // Chrome currently allows loopback (`127.0.0.1` / `localhost`) from HTTPS
  // with a normal CORS request. Forcing the experimental `targetAddressSpace`
  // hint on every bridge call can make Chrome show/block the Local Network
  // prompt even when the bridge is healthy. Keep the helper conservative by
  // default; callers that must target a non-loopback LAN IP can still pass the
  // hint explicitly.
  const next: LocalNetworkRequestInit = { ...init };
  if (!next.mode) next.mode = "cors";
  return next;
}

export function withExplicitLocalNetworkAccess(init: RequestInit = {}): LocalNetworkRequestInit {
  return {
    ...init,
    mode: init.mode ?? "cors",
    targetAddressSpace: "local",
  };
}

export function getLocalNetworkBlockedMessage(): string {
  return "المتصفح منع الوصول إلى برنامج الطباعة المحلي. حدّث Edge/Chrome إلى آخر إصدار، ثم اسمح بالوصول إلى الشبكة المحلية من أذونات الموقع وأعد الفحص.";
}