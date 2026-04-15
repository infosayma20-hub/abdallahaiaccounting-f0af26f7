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
    return origDateToLocaleDateString.call(this, 'en-GB', options);
  }
  return origDateToLocaleDateString.call(this, locale, options);
};

// PWA: Unregister service workers in iframe/preview contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");
if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
