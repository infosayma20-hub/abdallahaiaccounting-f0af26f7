// Frontend helper for FCM push notifications (Phase 1).
// Handles: SW registration, permission request, token acquisition, register call,
// and foreground onMessage → toast.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported,
  type Messaging,
} from "firebase/messaging";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  firebaseConfig,
  FIREBASE_VAPID_KEY,
  isFirebaseConfigured,
} from "./firebase-config";

let messagingInstance: Messaging | null = null;
let onMessageBound = false;

function detectPlatform(): "android" | "ios" | "web" {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "web";
}

export function isIos(): boolean {
  return detectPlatform() === "ios";
}

// iOS requires the PWA to be installed (added to Home Screen) before push works.
export function isIosStandalone(): boolean {
  // @ts-ignore
  return isIos() && (window.navigator.standalone === true);
}

export async function pushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  try {
    return await isMessagingSupported();
  } catch {
    return false;
  }
}

async function ensureMessaging(): Promise<Messaging> {
  if (messagingInstance) return messagingInstance;
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase config not set. Fill src/lib/firebase-config.ts and public/firebase-messaging-sw.js.");
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  messagingInstance = getMessaging(app);

  if (!onMessageBound) {
    onMessageBound = true;
    onMessage(messagingInstance, (payload) => {
      const title = payload?.notification?.title || "إشعار";
      const body = payload?.notification?.body || "";
      toast(title, { description: body });
    });
  }
  return messagingInstance;
}

async function registerMessagingSW(): Promise<ServiceWorkerRegistration> {
  // Use a dedicated scope so this never collides with /sw.js or /service-worker.js
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/firebase-cloud-messaging-push-scope",
  });
}

export type EnablePushResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function enablePushNotifications(): Promise<EnablePushResult> {
  try {
    if (!(await pushSupported())) {
      return { ok: false, reason: "المتصفح لا يدعم إشعارات Push." };
    }
    if (isIos() && !isIosStandalone()) {
      return {
        ok: false,
        reason: "على iPhone: أضف التطبيق للشاشة الرئيسية أولاً ثم فعّل الإشعارات من داخله.",
      };
    }
    if (!isFirebaseConfigured()) {
      return { ok: false, reason: "إعدادات Firebase غير مكتملة. راجع firebase-config.ts." };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "تم رفض إذن الإشعارات." };
    }

    const swReg = await registerMessagingSW();
    const messaging = await ensureMessaging();

    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return { ok: false, reason: "تعذّر الحصول على FCM token." };
    }

    const platform = detectPlatform();
    const device_info = `${navigator.platform} · ${navigator.userAgent.slice(0, 120)}`;

    const { error } = await supabase.functions.invoke("push-register", {
      body: { token, platform, device_info },
    });
    if (error) {
      return { ok: false, reason: `فشل تسجيل الجهاز: ${error.message}` };
    }

    return { ok: true, token };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "خطأ غير معروف" };
  }
}

// Bind foreground listener early if user already granted permission and Firebase
// is configured — call this from app boot if desired (optional).
export async function bindForegroundMessagingIfReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isFirebaseConfigured()) return;
  if (!(await pushSupported())) return;
  if (Notification.permission !== "granted") return;
  try {
    await ensureMessaging();
  } catch {
    /* no-op */
  }
}