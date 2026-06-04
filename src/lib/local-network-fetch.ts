/**
 * Chrome Local Network Access / Private Network Access helper.
 *
 * Requests from the hosted app to the cashier PC's local Print Bridge need the
 * experimental `targetAddressSpace` hint so Chrome can show/remember the local
 * network permission prompt instead of blocking localhost/private IP calls.
 */
export type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: "local" | "private";
};

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
  return "Chrome منع الوصول إلى برنامج الطباعة المحلي. اضغط سماح عند طلب الوصول للشبكة المحلية، أو افتح إعدادات الموقع واسمح بـ Local network access ثم أعد الفحص.";
}