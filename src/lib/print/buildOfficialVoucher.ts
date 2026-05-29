/**
 * Unified official print template for all financial vouchers
 * (Journal / Receipt / Payment / etc.).
 *
 * Goals (per UX spec):
 *  - One template shared across all voucher types.
 *  - Formal, quiet design: single primary navy color, white/gray surfaces.
 *  - No colored badges, no green/red pills, no gradients, no card backgrounds.
 *  - Header: company name + logo (right, RTL), doc type as plain title +
 *    ref number + date (left).
 *  - Info row as a simple inline grid.
 *  - Table with light gray header; totals as plain rows / footer line.
 *  - Three signature blocks, compact footer.
 */

export interface OfficialVoucherCompany {
  name?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
}

export interface OfficialVoucherInfo {
  label: string;
  value: string;
  /** Optional: render value in muted color */
  muted?: boolean;
  /** Optional: highlight value (use sparingly — only for warnings like "غير متوازن") */
  warn?: boolean;
}

export interface OfficialVoucherTable {
  columns: { label: string; align?: "right" | "left" | "center"; width?: string }[];
  rows: (string | number)[][];
  /** Optional footer row aligned to columns (use empty strings for blanks). */
  footer?: (string | number)[];
  /** Optional caption shown above the table. */
  caption?: string;
}

export interface OfficialVoucherSignature {
  label: string;
}

export interface OfficialVoucherOptions {
  /** e.g. "سند قيد" / "سند قبض" / "سند صرف" */
  docTypeLabel: string;
  /** English subtitle under the title, e.g. "Journal Voucher" */
  docTypeLabelEn?: string;
  refNumber: string;
  /** Pre-formatted date string (dd/mm/yyyy). */
  date: string;
  company?: OfficialVoucherCompany;
  /** Top info strip (date / type / party / method / currency / status…) */
  info?: OfficialVoucherInfo[];
  /** Optional free-text description block (e.g. وصف القيد). */
  description?: string;
  /** Main details table(s). */
  tables?: OfficialVoucherTable[];
  /** Plain text totals lines under the table. */
  totals?: { label: string; value: string; warn?: boolean }[];
  /** Optional warning note shown below totals (e.g. unbalanced entry). */
  warningNote?: string;
  /** Notes block (free text). */
  notes?: string;
  /** Signature blocks (default: محاسب / مراجع / مدير مالي). */
  signatures?: OfficialVoucherSignature[];
  /** Watermark, e.g. "ملغي" / "مسودة". */
  watermark?: string;
}

const PRIMARY = "#0D1B2E"; // brand navy
const BORDER = "#E2E8F0";
const MUTED = "#64748B";
const TEXT = "#1A2332";
const SURFACE_ALT = "#F8FAFC";

function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildOfficialVoucherHtml(o: OfficialVoucherOptions): string {
  const company = o.company || {};
  const signatures = o.signatures && o.signatures.length
    ? o.signatures
    : [{ label: "المحاسب" }, { label: "المراجع" }, { label: "المدير المالي" }];

  const headerHtml = `
    <header class="doc-header">
      <div class="doc-company">
        ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="" class="doc-logo" />` : ""}
        <div>
          <div class="doc-company-name">${escapeHtml(company.name || "")}</div>
          ${company.address ? `<div class="doc-company-sub">${escapeHtml(company.address)}</div>` : ""}
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">${escapeHtml(o.docTypeLabel)}</h1>
        ${o.docTypeLabelEn ? `<div class="doc-title-en">${escapeHtml(o.docTypeLabelEn)}</div>` : ""}
        <div class="doc-meta">
          ${o.refNumber ? `<div><span class="doc-meta-l">رقم السند:</span> <strong>${escapeHtml(o.refNumber)}</strong></div>` : ""}
          <div><span class="doc-meta-l">التاريخ:</span> <strong>${escapeHtml(o.date)}</strong></div>
        </div>
      </div>
    </header>
  `;

  const infoHtml = o.info && o.info.length
    ? `<section class="doc-info">${o.info
        .map(
          (i) => `
      <div class="doc-info-cell">
        <div class="doc-info-l">${escapeHtml(i.label)}</div>
        <div class="doc-info-v ${i.warn ? "warn" : ""} ${i.muted ? "muted" : ""}">${escapeHtml(i.value || "—")}</div>
      </div>`,
        )
        .join("")}</section>`
    : "";

  const descHtml = o.description
    ? `<section class="doc-desc"><span class="doc-desc-l">الوصف:</span> ${escapeHtml(o.description)}</section>`
    : "";

  const tablesHtml = (o.tables || [])
    .map((t) => {
      const colgroup = t.columns.some((c) => c.width)
        ? `<colgroup>${t.columns.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ""} />`).join("")}</colgroup>`
        : "";
      const thead = `<thead><tr>${t.columns
        .map(
          (c) =>
            `<th style="text-align:${c.align || "right"}">${escapeHtml(c.label)}</th>`,
        )
        .join("")}</tr></thead>`;
      const tbody = t.rows.length
        ? `<tbody>${t.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell, idx) => {
                    const col = t.columns[idx];
                    return `<td style="text-align:${col?.align || "right"}">${escapeHtml(cell)}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody>`
        : `<tbody><tr><td colspan="${t.columns.length}" class="doc-empty">لا توجد سطور</td></tr></tbody>`;
      const tfoot = t.footer
        ? `<tfoot><tr>${t.footer
            .map(
              (cell, idx) =>
                `<td style="text-align:${t.columns[idx]?.align || "right"}">${escapeHtml(cell)}</td>`,
            )
            .join("")}</tr></tfoot>`
        : "";
      return `${t.caption ? `<div class="doc-caption">${escapeHtml(t.caption)}</div>` : ""}<table class="doc-table">${colgroup}${thead}${tbody}${tfoot}</table>`;
    })
    .join("");

  const totalsHtml =
    o.totals && o.totals.length
      ? `<section class="doc-totals">${o.totals
          .map(
            (t) =>
              `<div class="doc-total-row"><span class="doc-total-l">${escapeHtml(t.label)}</span><span class="doc-total-v ${t.warn ? "warn" : ""}">${escapeHtml(t.value)}</span></div>`,
          )
          .join("")}</section>`
      : "";

  const warningHtml = o.warningNote
    ? `<div class="doc-warning">${escapeHtml(o.warningNote)}</div>`
    : "";

  const notesHtml = o.notes
    ? `<section class="doc-notes"><span class="doc-notes-l">ملاحظات:</span> ${escapeHtml(o.notes)}</section>`
    : "";

  const signaturesHtml = `
    <section class="doc-signatures">
      ${signatures
        .map(
          (s) =>
            `<div class="doc-sig"><div class="doc-sig-line"></div><div class="doc-sig-label">${escapeHtml(s.label)}</div></div>`,
        )
        .join("")}
    </section>
  `;

  const footerBitsRight = [
    company.name,
    company.phone,
    company.email,
    company.taxNumber ? `رقم ضريبي: ${company.taxNumber}` : "",
  ]
    .filter(Boolean)
    .map((s) => escapeHtml(s))
    .join(" · ");

  const footerHtml = `
    <footer class="doc-footer">
      <div class="doc-footer-info">${footerBitsRight}</div>
      <div class="doc-footer-brand">AMWALI ERP Software</div>
    </footer>
  `;

  const watermarkHtml = o.watermark
    ? `<div class="doc-watermark">${escapeHtml(o.watermark)}</div>`
    : "";

  const css = `
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      direction: rtl;
      color: ${TEXT};
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; }
    .doc { position: relative; max-width: 800px; margin: 0 auto; padding: 4px 0 0; }
    .doc-watermark {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 96px; font-weight: 900; color: rgba(13,27,46,0.07);
      transform: rotate(-28deg); pointer-events: none; z-index: 0; letter-spacing: 4px;
    }
    .doc-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; padding-bottom: 12px; border-bottom: 2px solid ${PRIMARY};
      margin-bottom: 14px;
    }
    .doc-company { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .doc-logo { height: 46px; width: auto; object-fit: contain; }
    .doc-company-name { font-size: 16px; font-weight: 700; color: ${PRIMARY}; }
    .doc-company-sub { font-size: 10.5px; color: ${MUTED}; margin-top: 2px; }
    .doc-title-block { text-align: left; flex-shrink: 0; }
    .doc-title { font-size: 20px; font-weight: 800; color: ${PRIMARY}; letter-spacing: 0.5px; }
    .doc-title-en { font-size: 10px; color: ${MUTED}; letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }
    .doc-meta { margin-top: 6px; font-size: 11px; color: ${TEXT}; line-height: 1.6; }
    .doc-meta-l { color: ${MUTED}; }
    .doc-info {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px 16px; padding: 10px 12px; margin-bottom: 14px;
      border: 1px solid ${BORDER}; border-radius: 4px; background: ${SURFACE_ALT};
    }
    .doc-info-cell { min-width: 0; }
    .doc-info-l { font-size: 10px; color: ${MUTED}; margin-bottom: 2px; }
    .doc-info-v { font-size: 12px; font-weight: 600; color: ${TEXT}; word-break: break-word; }
    .doc-info-v.muted { color: ${MUTED}; font-weight: 500; }
    .doc-info-v.warn { color: #B91C1C; }
    .doc-desc {
      padding: 10px 12px; margin-bottom: 14px;
      border: 1px solid ${BORDER}; border-radius: 4px;
      font-size: 12px; line-height: 1.6;
    }
    .doc-desc-l { color: ${MUTED}; font-size: 10.5px; margin-left: 4px; }
    .doc-caption { font-size: 11px; font-weight: 700; color: ${PRIMARY}; margin: 10px 0 4px; }
    .doc-table {
      width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 14px;
      font-variant-numeric: tabular-nums;
    }
    .doc-table thead th {
      background: #F1F5F9; color: ${PRIMARY};
      font-size: 11px; font-weight: 700;
      padding: 8px 10px; border-bottom: 1.5px solid ${PRIMARY};
    }
    .doc-table tbody td {
      padding: 7px 10px; border-bottom: 1px solid ${BORDER};
      vertical-align: top;
    }
    .doc-table tbody tr:last-child td { border-bottom: 1px solid ${BORDER}; }
    .doc-table tfoot td {
      padding: 9px 10px; background: ${SURFACE_ALT};
      font-weight: 700; border-top: 1.5px solid ${PRIMARY};
      border-bottom: none;
    }
    .doc-empty { text-align: center; color: ${MUTED}; padding: 18px 10px; font-size: 11px; }
    .doc-totals {
      margin: 4px 0 14px; padding: 10px 12px;
      border: 1px solid ${BORDER}; border-radius: 4px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .doc-total-row {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 12px;
    }
    .doc-total-l { color: ${MUTED}; }
    .doc-total-v { font-weight: 700; color: ${TEXT}; font-variant-numeric: tabular-nums; }
    .doc-total-v.warn { color: #B91C1C; }
    .doc-warning {
      margin-bottom: 14px; padding: 8px 12px;
      border-right: 3px solid #B91C1C; background: #FEF2F2;
      color: #7F1D1D; font-size: 11.5px; font-weight: 600;
    }
    .doc-notes {
      padding: 10px 12px; margin-bottom: 16px;
      border: 1px dashed ${BORDER}; border-radius: 4px;
      font-size: 11.5px; line-height: 1.6; color: ${TEXT};
    }
    .doc-notes-l { color: ${MUTED}; font-size: 10.5px; margin-left: 4px; }
    .doc-signatures {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
      margin: 28px 0 18px;
    }
    .doc-sig { text-align: center; }
    .doc-sig-line { border-bottom: 1px solid ${MUTED}; height: 36px; margin-bottom: 6px; }
    .doc-sig-label { font-size: 11px; color: ${MUTED}; font-weight: 600; }
    .doc-footer {
      border-top: 1px solid ${BORDER}; padding-top: 8px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 9.5px; color: ${MUTED};
    }
    .doc-footer-brand { color: ${PRIMARY}; font-weight: 700; letter-spacing: 0.5px; }
    @media print {
      .doc-table thead { display: table-header-group; }
      .doc-table tfoot { display: table-footer-group; }
      tr, .doc-sig, .doc-signatures { page-break-inside: avoid; }
      .doc-header { page-break-after: avoid; }
    }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(o.docTypeLabel)} ${escapeHtml(o.refNumber)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="doc">
    ${watermarkHtml}
    ${headerHtml}
    ${infoHtml}
    ${descHtml}
    ${tablesHtml}
    ${totalsHtml}
    ${warningHtml}
    ${notesHtml}
    ${signaturesHtml}
    ${footerHtml}
  </div>
  <script>
    (function(){
      function go(){ try { window.focus(); window.print(); } catch(e){} }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function(){ setTimeout(go, 120); });
      } else {
        setTimeout(go, 350);
      }
    })();
  </script>
</body>
</html>`;
}

/** Convenience: open the printable HTML in a new window. */
export function openOfficialVoucherWindow(opts: OfficialVoucherOptions): void {
  const html = buildOfficialVoucherHtml(opts);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}