/**
 * Open a clean, isolated print window with the given HTML body.
 * - No browser chrome inside the iframe content
 * - A4 RTL by default, 12mm margins
 * - Auto-triggers print after fonts load, closes when print dialog returns
 */
export interface PrintWindowOptions {
  title?: string;
  /** Inner HTML for <body> (the wrapper, margins, and @page rules are added) */
  bodyHtml: string;
  /** Extra CSS appended to the print-window <style> block */
  extraCss?: string;
  /** Auto-trigger print() (default: true) */
  autoPrint?: boolean;
}

const BASE_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
    direction: rtl;
    color: #0F172A;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { padding: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead { background: #F1F5F9; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #E2E8F0; text-align: right; vertical-align: middle; }
  th { font-weight: 700; color: #0F172A; font-size: 11px; }
  tfoot td { background: #F8FAFC; font-weight: 700; border-top: 2px solid #CBD5E1; }
  .num { font-variant-numeric: tabular-nums; text-align: left; }
  .muted { color: #64748B; font-size: 10.5px; }
  .strike { text-decoration: line-through; opacity: 0.55; }
  .doc-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #0F172A; padding-bottom: 8px; margin-bottom: 12px;
  }
  .doc-header h1 { margin: 0; font-size: 18px; }
  .doc-header .meta { font-size: 11px; color: #475569; text-align: left; }
  .info-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;
    border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;
    font-size: 12px;
  }
  .info-grid .label { color: #64748B; font-size: 10.5px; }
  .summary {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;
  }
  .summary .box {
    border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 10px; text-align: center;
  }
  .summary .box .v { font-weight: 700; font-size: 13px; margin-top: 2px; }
  .summary .box .l { font-size: 10px; color: #64748B; }
  .footer-line {
    margin-top: 14px; padding-top: 6px; border-top: 1px solid #E2E8F0;
    display: flex; justify-content: space-between; font-size: 10px; color: #64748B;
  }
  @media print {
    .no-print { display: none !important; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
`;

export function openPrintWindow({ title = "", bodyHtml, extraCss = "", autoPrint = true }: PrintWindowOptions): void {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    // Popup blocked → fallback to inline print
    window.print();
    return;
  }

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}${extraCss}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  if (!autoPrint) return;

  // Wait for fonts and layout
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch { /* ignore */ }
  };

  if ((win.document as any).fonts?.ready) {
    (win.document as any).fonts.ready.then(() => setTimeout(trigger, 80));
  } else {
    setTimeout(trigger, 350);
  }

  // Best-effort: close after print dialog completes
  win.addEventListener("afterprint", () => {
    try { win.close(); } catch { /* ignore */ }
  });
}

/** Escape user-supplied text for safe HTML injection. */
export function esc(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}