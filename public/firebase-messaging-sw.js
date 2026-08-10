/* eslint-disable */
// Firebase Cloud Messaging — background message handler.
// IMPORTANT: This file is SEPARATE from public/sw.js and public/service-worker.js
// (which are kill-switch). Do NOT merge or modify those.
//
// SECURITY: Firebase web config values (apiKey, projectId, etc.) are PUBLIC by design
// for Firebase web SDK. They are NOT secrets. Service workers cannot read import.meta.env,
// so values must live inline here. Values below are filled from your Firebase Console
// (Project Settings → General → Your apps → Web app).

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDL8qrIFu7d0pp7v0-hqdKY4ALxhBxAw2g",
  authDomain: "amwali-74aa6.firebaseapp.com",
  projectId: "amwali-74aa6",
  storageBucket: "amwali-74aa6.firebasestorage.app",
  messagingSenderId: "673285338010",
  appId: "1:673285338010:web:6243f5cc32508970988023",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Data-only payload (see push-send/index.ts). Read fields from data.
  const title = payload?.data?.title || payload?.notification?.title || "إشعار جديد";
  const body  = payload?.data?.body  || payload?.notification?.body  || "";
  const path  = payload?.data?.path  || "/";
  const badge = parseInt(payload?.data?.badge ?? "", 10);
  if (!isNaN(badge) && self.navigator && "setAppBadge" in self.navigator) {
    try {
      badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge();
    } catch (e) { /* ignore */ }
  }
  // IMPORTANT (Android/Chrome): a shared static `tag` + `renotify:false` makes
  // every new notification silently REPLACE the previous one — no sound, no
  // vibration, no heads-up banner. iOS ignores this, which is why the same
  // account alerted on iPhone but looked "dead" on Samsung.
  // → unique tag per message + renotify:true so each notification alerts.
  const tag =
    payload?.data?.tag ||
    `amwali-${payload?.data?.id || payload?.messageId || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { path },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(path);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(path);
      }),
  );
});