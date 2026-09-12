import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

/**
 * Print any fully inline-styled React node (invoice / voucher templates)
 * through a hidden iframe instead of `window.open("", "_blank")`.
 *
 * Why: mobile browsers (iOS Safari, Android Chrome) block or silently drop
 * blank popups that are written to asynchronously, so `window.open` printing
 * simply did nothing on phones. The hidden-iframe approach is the same one the
 * invoice-list print already uses successfully, and it behaves identically on
 * desktop (no extra tab, no "about:blank" header/footer).
 *
 * The printed markup is unchanged — only the print *transport* differs.
 */
export function printReactDocument(
  node: ReactNode,
  options: { title: string; headExtra?: string; onError?: (e: unknown) => void } ,
): void {
  const { title, headExtra = "", onError } = options;
  const id = "__react_print_iframe__";
  document.getElementById(id)?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = id;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    onError?.(new Error("print iframe unavailable"));
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(`<html dir="rtl"><head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #fff; font-family: Cairo, system-ui, sans-serif; }
      @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }
    </style>
    ${headExtra}
  </head><body><div id="print-root"></div></body></html>`);
  doc.close();

  const start = () => {
    const container = doc.getElementById("print-root");
    if (!container) {
      onError?.(new Error("print root missing"));
      iframe.remove();
      return;
    }
    const root = createRoot(container);
    root.render(<>{node}</>);

    // Give React + webfonts + logos a moment, then print.
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        onError?.(e);
      }
      // Keep the iframe alive long enough for the print dialog to read it.
      window.setTimeout(() => {
        try { root.unmount(); } catch { /* noop */ }
        iframe.remove();
      }, 60000);
    }, 800);
  };

  window.setTimeout(start, 120);
}

export default printReactDocument;
