// App icon badge (Badging API) — shows the unread count on the installed
// app icon (Android/Chrome/Edge/Samsung Internet + macOS Safari dock).
//
// Notes on platform reality (why the code looks like this):
// - `navigator.setAppBadge` only has a visible effect for an INSTALLED app
//   (added to home screen / installed PWA). In a normal browser tab the call
//   silently resolves and nothing shows — so we never surface errors.
// - iOS/Safari on iPhone does not implement the Badging API yet; the badge
//   there comes from the notification itself, so there is nothing to do.
// - The service worker sets the same badge for pushes that arrive while the
//   app is closed (see public/firebase-messaging-sw.js).

const MAX_BADGE = 99;

function badgingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as any).setAppBadge === "function"
  );
}

/** Set (or clear when 0) the number shown on the app icon. Never throws. */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (!badgingSupported()) return;
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    if (n <= 0) {
      await (navigator as any).clearAppBadge();
    } else {
      await (navigator as any).setAppBadge(Math.min(n, MAX_BADGE));
    }
  } catch {
    /* unsupported / not installed — ignore */
  }
}

/** Remove the badge from the app icon. */
export async function clearAppBadgeCount(): Promise<void> {
  await setAppBadgeCount(0);
}
