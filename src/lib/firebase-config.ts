// Firebase web SDK config. These values are PUBLIC by design (not secrets);
// Firebase access is gated by RLS/security rules, not by these keys.
// Fill in once from Firebase Console → Project Settings → Your apps → Web app.
// The SAME values must also be set in public/firebase-messaging-sw.js
// (service workers cannot read env vars or imports).

export const firebaseConfig = {
  apiKey: "TODO_FIREBASE_API_KEY",
  authDomain: "TODO_FIREBASE_AUTH_DOMAIN",
  projectId: "TODO_FIREBASE_PROJECT_ID",
  messagingSenderId: "TODO_FIREBASE_MESSAGING_SENDER_ID",
  appId: "TODO_FIREBASE_APP_ID",
};

// VAPID public key from Firebase Console → Project Settings → Cloud Messaging
// → Web configuration → "Web Push certificates". Public by design.
export const FIREBASE_VAPID_KEY = "TODO_FIREBASE_VAPID_PUBLIC_KEY";

export const isFirebaseConfigured = () =>
  !firebaseConfig.apiKey.startsWith("TODO_") &&
  !FIREBASE_VAPID_KEY.startsWith("TODO_");