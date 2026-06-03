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
  return {
    ...init,
    mode: init.mode ?? "cors",
    targetAddressSpace: "local",
  };
}

export function getLocalNetworkBlockedMessage(): string {
  return "Chrome منع الوصول إلى برنامج الطباعة المحلي. اضغط سماح عند طلب الوصول للشبكة المحلية، أو افتح إعدادات الموقع واسمح بـ Local network access ثم أعد الفحص.";
}