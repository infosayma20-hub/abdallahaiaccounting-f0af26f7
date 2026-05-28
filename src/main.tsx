import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "@fontsource/cairo/900.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./lib/excel-export"; // Activates Excel branding interceptor globally
import { hydrateConfigFromBridge } from "./lib/device-config";

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

// Force dd/mm/yyyy display on all native date inputs
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLElement) {
        const inputs = node.matches?.('input[type="date"]') ? [node] : Array.from(node.querySelectorAll?.('input[type="date"]') || []);
        inputs.forEach((inp: Element) => inp.setAttribute('lang', 'en-GB'));
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
document.querySelectorAll('input[type="date"]').forEach(inp => inp.setAttribute('lang', 'en-GB'));

createRoot(document.getElementById("root")!).render(<App />);

// Restore device configuration from the Print Bridge's on-disk copy
// so the cashier PC keeps its branch/terminal/bridge URL even after
// a "Clear browsing data" wipe. Fire-and-forget, non-blocking.
hydrateConfigFromBridge();
