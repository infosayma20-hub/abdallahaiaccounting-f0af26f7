// Firebase web SDK config. These values are PUBLIC by design (not secrets);
// Firebase access is gated by RLS/security rules, not by these keys.
// Fill in once from Firebase Console → Project Settings → Your apps → Web app.
// The SAME values must also be set in public/firebase-messaging-sw.js
// (service workers cannot read env vars or imports).

export const firebaseConfig = {
  apiKey: "AIzaSyDL8qrIFu7d0pp7v0-hqdKY4ALxhBxAw2g",
  authDomain: "amwali-74aa6.firebaseapp.com",
  projectId: "amwali-74aa6",
  storageBucket: "amwali-74aa6.firebasestorage.app",
  messagingSenderId: "673285338010",
  appId: "1:673285338010:web:6243f5cc32508970988023",
};

// VAPID public key from Firebase Console → Project Settings → Cloud Messaging
// → Web configuration → "Web Push certificates". Public by design.
export const FIREBASE_VAPID_KEY = "m0H-yvtTCOtC87zo5uYlJq_tEhY0KgRUHzz74Zfrglk";

export const isFirebaseConfigured = () =>
  !firebaseConfig.apiKey.startsWith("TODO_") &&
  !FIREBASE_VAPID_KEY.startsWith("TODO_");