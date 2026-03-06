import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force Western Arabic numerals (123) globally instead of Eastern (١٢٣)
const origNumberToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locale?: string | string[], options?: Intl.NumberFormatOptions) {
  // If locale is Arabic, force en-US to get Western numerals
  if (!locale || (typeof locale === 'string' && locale.startsWith('ar'))) {
    return origNumberToLocaleString.call(this, 'en-US', options);
  }
  return origNumberToLocaleString.call(this, locale, options);
};

const origDateToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
  if (!locale || (typeof locale === 'string' && locale.startsWith('ar'))) {
    return origDateToLocaleString.call(this, 'en-US', options);
  }
  return origDateToLocaleString.call(this, locale, options);
};

const origDateToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
  if (!locale || (typeof locale === 'string' && locale.startsWith('ar'))) {
    return origDateToLocaleDateString.call(this, 'en-US', options);
  }
  return origDateToLocaleDateString.call(this, locale, options);
};

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
