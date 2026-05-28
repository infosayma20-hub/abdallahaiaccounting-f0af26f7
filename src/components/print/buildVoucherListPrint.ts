import { openPrintWindow, esc } from "@/lib/print/openPrintWindow";

export interface PrintListColumn<T> {
  key: string;
  label: string;
  align?: "right" | "left" | "center";
  width?: string;
  render: (row: T) => string;
}

export interface PrintListOptions<T> {
  title: string;
  subtitle?: string;
  companyName?: string;
  rows: T[];
  columns: PrintListColumn<T>[];
  /** Optional KPI summary boxes shown above the table. */
  summary?: { label: string; value: string }[];
  /** Optional info pairs (period, filters, generated-by). */
  info?: { label: string; value: string }[];
  /** Footer label for the totals row, e.g. "المجموع (8 سند)". */
  totalsLabel?: string;
  /** Footer cells aligned to the table columns (use the same length as columns). */
  totalsCells?: (string | null)[];
  /** Mark cancelled / strikethrough rows. */
  isCancelled?: (row: T) => boolean;
}

/**
 * Renders a clean print window styled like an Account Statement (SOA),
 * suitable for vouchers / invoices / receipts lists.
 */
export function printVoucherList<T>(opts: PrintListOptions<T>): void {
  const {
    title, subtitle, companyName, rows, columns, summary = [], info = [],
    totalsLabel, totalsCells, isCancelled,
  } = opts;

  const now = new Date();
  const printDate = now.toLocaleDateString("ar-EG-u-nu-latn", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const printTime = now.toLocaleTimeString("ar-EG-u-nu-latn", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const headerHtml = `
    <div class="doc-header">
      <div>
        <h1>${esc(title)}</h1>
        ${subtitle ? `<div class="muted" style="margin-top:2px;">${esc(subtitle)}</div>` : ""}
        ${companyName ? `<div class="muted" style="margin-top:2px;">${esc(companyName)}</div>` : ""}
      </div>
      <div class="meta">
        <div>تاريخ الطباعة: ${printDate}</div>
        <div>الوقت: ${printTime}</div>
        <div>عدد السجلات: ${rows.length}</div>
      </div>
    </div>
  `;

  const infoHtml = info.length
    ? `<div class="info-grid">${info
        .map((i) => `<div><span class="label">${esc(i.label)}: </span><strong>${esc(i.value)}</strong></div>`)
        .join("")}</div>`
    : "";

  const summaryHtml = summary.length
    ? `<div class="summary">${summary
        .map((s) => `<div class="box"><div class="l">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const cols = columns
    .map((c) => `<col${c.width ? ` style="width:${c.width}"` : ""} />`)
    .join("");

  const thead = `<thead><tr>${columns
    .map((c) => `<th style="text-align:${c.align || "right"}">${esc(c.label)}</th>`)
    .join("")}</tr></thead>`;

  const tbody = `<tbody>${rows
    .map((r) => {
      const cancelled = isCancelled?.(r) ? " class=\"strike\"" : "";
      return `<tr${cancelled}>${columns
        .map((c) => `<td style="text-align:${c.align || "right"}"${c.align === "left" ? " class=\"num\"" : ""}>${c.render(r) ?? ""}</td>`)
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;

  const tfoot = totalsLabel && totalsCells
    ? `<tfoot><tr>${totalsCells
        .map((cell, i) => {
          if (i === 0) return `<td colspan="1">${esc(totalsLabel)}</td>`;
          const align = columns[i]?.align || "right";
          return `<td style="text-align:${align}"${align === "left" ? " class=\"num\"" : ""}>${cell ?? ""}</td>`;
        })
        .join("")}</tr></tfoot>`
    : "";

  const tableHtml = `<table><colgroup>${cols}</colgroup>${thead}${tbody}${tfoot}</table>`;

  const footerLine = `
    <div class="footer-line">
      <span>${esc(companyName || "")}</span>
      <span>طُبع في ${printTime} ${printDate}</span>
    </div>
  `;

  openPrintWindow({
    title,
    bodyHtml: headerHtml + infoHtml + summaryHtml + tableHtml + footerLine,
  });
}