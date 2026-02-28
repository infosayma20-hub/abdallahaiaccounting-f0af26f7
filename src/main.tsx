import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aggressive cache busting: clear old caches and force SW update
if ('serviceWorker' in navigator) {
  // Force update all service workers
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      reg.update();
      // If there's a waiting worker, skip waiting immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              window.location.reload();
            }
          });
        }
      });
    });
  });

  // Clear all old caches on startup
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        // Delete old workbox/precache entries
        if (name.includes('workbox') || name.includes('precache')) {
          caches.delete(name);
        }
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
