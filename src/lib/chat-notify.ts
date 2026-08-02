/**
 * Shared browser notification + sound helper for HR <-> employee chat.
 * Never throws: falls back silently when the browser blocks audio/notifications.
 */
import { installAudioUnlock, playAlertBeep } from "@/lib/audio-unlock";

let asked = false;

export function ensureNotificationPermission() {
  try {
    installAudioUnlock();
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (asked) return;
    asked = true;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function playChatSound() {
  try {
    playAlertBeep();
  } catch {
    /* ignore */
  }
}

export function notifyChat(title: string, body?: string) {
  playChatSound();
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    const n = new Notification(title, { body, tag: "unify-hr-chat", icon: "/logos/amwali-mark-only.svg" });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/** Sets (or clears) the installed-app icon badge — iOS 16.4+ PWA / Android / desktop. */
export function setAppBadgeCount(count: number) {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* ignore */
  }
}
