import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import i18n, { LANG_META, readStoredLang } from "./i18n/config"; // i18n bootstrap (ar/en/he)
import { hydrateConfigFromBridge } from "./lib/device-config";
import { captureRefFromUrl } from "./lib/referralCapture";
import { supabase } from "./integrations/supabase/client";
import { installRealtimeGuard } from "./lib/realtime-guard";
import { registerAppShellSW } from "./lib/app-shell-sw";


// Apply the stored language direction before first paint (ar/he = RTL, en = LTR)
{
  const lng = readStoredLang();
  document.documentElement.setAttribute("lang", lng);
  document.documentElement.setAttribute("dir", LANG_META[lng].dir);
  i18n.on("languageChanged", (next) => {
    const meta = LANG_META[next as keyof typeof LANG_META] ?? LANG_META.ar;
    document.documentElement.setAttribute("lang", next);
    document.documentElement.setAttribute("dir", meta.dir);
  });
}


// Capture ?ref=CODE from URL into localStorage for referral attribution
captureRefFromUrl();

// Protect the app from Supabase Realtime channel reuse crashes after dependency upgrades.
installRealtimeGuard(supabase);

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
} else {
  // Offline app shell: lets the program open and navigate without internet.
  registerAppShellSW();
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

// Excel branding interceptor: loaded AFTER first paint so the ~400KB
// spreadsheet library never delays the login screen. It only needs to be in
// place before the user actually clicks an export button.
{
  const loadExcelBranding = () => { void import("./lib/excel-export"); };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(loadExcelBranding, { timeout: 5000 });
  else setTimeout(loadExcelBranding, 3000);
}

// Restore device configuration from the Print Bridge's on-disk copy
// so the cashier PC keeps its branch/terminal/bridge URL even after
// a "Clear browsing data" wipe. Fire-and-forget, non-blocking.
hydrateConfigFromBridge();
