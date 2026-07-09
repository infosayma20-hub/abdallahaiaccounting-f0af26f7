/**
 * Print builder for the Invoices list (كشف الفواتير).
 * Follows the same visual language as buildAccountStatementPrintHTML:
 * white background, thin gray borders, plain Arabic typography, A4-friendly.
 */

export interface InvoicePrintRow {
  date: string;
  invoiceNumber: string;
  contactName: string;
  type: "sales" | "purchase";
  statusLabel: string;
  paymentLabel: string;
  cashBoxName?: string | null;
  notes?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  currency?: string;
  cancelled?: boolean;
}

export interface InvoiceListPrintOpts {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  title: string;                // e.g. "كشف فواتير المبيعات"
  rows: InvoicePrintRow[];
  filters: { label: string; value: string }[];
  totals: {
    count: number;
    cancelledCount: number;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    remaining: number;
  };
  currencySymbol?: string;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDate = (d: string) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const fmtToday = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function buildInvoiceListPrintHTML(opts: InvoiceListPrintOpts): string {
  const {
    companyName, companyAddress, companyPhone, companyTaxNumber,
    title, rows, filters, totals,
    currencySymbol = "₪",
  } = opts;

  const fmt = (n: number) => {
    const v = Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currencySymbol}${v}`;
  };

  const cols = [
    { key: "date", label: "التاريخ", align: "right", width: "9%" },
    { key: "invoiceNumber", label: "رقم الفاتورة", align: "right", width: "12%" },
    { key: "contactName", label: "العميل/المورد", align: "right", width: "auto" },
    { key: "type", label: "النوع", align: "center", width: "8%" },
    { key: "statusLabel", label: "الحالة", align: "center", width: "9%" },
    { key: "paymentLabel", label: "الدفع", align: "center", width: "8%" },
    { key: "cashBoxName", label: "الصندوق/البنك", align: "right", width: "12%" },
    { key: "total", label: "الإجمالي", align: "left", width: "10%" },
    { key: "paid", label: "المدفوع", align: "left", width: "10%" },
    { key: "remaining", label: "المتبقي", align: "left", width: "10%" },
  ] as const;

  const headerHTML = `
    <header class="doc-head">
      <div class="doc-head__right">
        <div class="doc-company">${esc(companyName || "AMWALI")}</div>
        ${companyAddress ? `<div class="doc-meta-line">${esc(companyAddress)}</div>` : ""}
        ${companyPhone ? `<div class="doc-meta-line">${esc(companyPhone)}</div>` : ""}
        ${companyTaxNumber ? `<div class="doc-meta-line">الرقم الضريبي: ${esc(companyTaxNumber)}</div>` : ""}
      </div>
      <div class="doc-head__left">
        <div class="doc-title">${esc(title)}</div>
        <div class="doc-title-en">INVOICES REPORT</div>
        <div class="doc-meta-line">تاريخ الطباعة: ${esc(fmtToday())}</div>
      </div>
    </header>
  `;

  const infoHTML = `
    <section class="doc-info">
      <table class="doc-info__meta">
        <tbody>
          <tr><td>عدد الفواتير</td><td>${totals.count.toLocaleString()}</td></tr>
          ${totals.cancelledCount ? `<tr><td>فواتير ملغاة (مستبعدة من المجاميع)</td><td>${totals.cancelledCount.toLocaleString()}</td></tr>` : ""}
          ${filters.map(f => `<tr><td>${esc(f.label)}</td><td>${esc(f.value)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;

  const summaryHTML = `
    <table class="doc-summary">
      <thead>
        <tr>
          <th>الإجمالي الفرعي</th>
          <th>الخصم</th>
          <th>الضريبة</th>
          <th>الإجمالي</th>
          <th>المدفوع</th>
          <th>المتبقي</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(fmt(totals.subtotal))}</td>
          <td>${esc(fmt(totals.discount))}</td>
          <td>${esc(fmt(totals.tax))}</td>
          <td><strong>${esc(fmt(totals.total))}</strong></td>
          <td>${esc(fmt(totals.paid))}</td>
          <td><strong>${esc(fmt(totals.remaining))}</strong></td>
        </tr>
      </tbody>
    </table>
  `;

  const theadHTML = `
    <thead>
      <tr>
        ${cols.map(c => `<th class="al-${c.align}" style="width:${c.width}">${esc(c.label)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const bodyHTML = rows.map(r => `
    <tr class="data-row${r.cancelled ? " cancelled" : ""}">
      <td class="al-right">${esc(fmtDate(r.date))}</td>
      <td class="al-right">${esc(r.invoiceNumber || "—")}</td>
      <td class="al-right">${esc(r.contactName || "—")}</td>
      <td class="al-center">${r.type === "purchase" ? "مشتريات" : "مبيعات"}</td>
      <td class="al-center">${esc(r.statusLabel || "—")}</td>
      <td class="al-center">${esc(r.paymentLabel || "—")}</td>
      <td class="al-right">${esc(r.cashBoxName || "—")}</td>
      <td class="al-left">${esc(fmt(r.total))}</td>
      <td class="al-left">${r.paid > 0 ? esc(fmt(r.paid)) : "—"}</td>
      <td class="al-left">${r.remaining > 0 ? esc(fmt(r.remaining)) : "—"}</td>
    </tr>
  `).join("");

  const totalsRow = `
    <tr class="totals">
      <td colspan="7"><strong>الإجمالي (${totals.count.toLocaleString()} فاتورة${totals.cancelledCount ? ` — ${totals.cancelledCount} ملغاة مستبعدة` : ""})</strong></td>
      <td class="al-left"><strong>${esc(fmt(totals.total))}</strong></td>
      <td class="al-left"><strong>${esc(fmt(totals.paid))}</strong></td>
      <td class="al-left"><strong>${esc(fmt(totals.remaining))}</strong></td>
    </tr>
  `;

  const tableHTML = `
    <table class="doc-tbl">
      ${theadHTML}
      <tbody>
        ${bodyHTML || `<tr><td colspan="${cols.length}" class="al-center" style="padding:14px;color:#666">لا توجد فواتير مطابقة للفلاتر</td></tr>`}
        ${rows.length ? totalsRow : ""}
      </tbody>
    </table>
  `;

  const footerHTML = `
    <footer class="doc-foot">
      <span>${esc(companyName || "AMWALI")}</span>
      <span>طُبع في ${esc(fmtToday())}</span>
    </footer>
  `;

  const css = `
    @page { size: A4 landscape; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      font-family: 'Cairo', 'Tajawal', Arial, sans-serif;
      direction: rtl;
      font-size: 11px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media screen {
      body { width: 297mm; min-height: 210mm; padding: 12mm 14mm; }
    }
    .muted { color: #555; font-size: 10px; }
    strong { font-weight: 700; }

    .doc-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #111;
      margin-bottom: 12px;
    }
    .doc-head__right { text-align: right; }
    .doc-head__left { text-align: left; }
    .doc-company { font-size: 16px; font-weight: 700; }
    .doc-title { font-size: 16px; font-weight: 700; }
    .doc-title-en { font-size: 9px; color: #555; margin-top: 2px; }
    .doc-meta-line { font-size: 10px; color: #444; margin-top: 2px; }

    .doc-info { margin-bottom: 12px; }
    .doc-info__meta { border-collapse: collapse; font-size: 10px; }
    .doc-info__meta td { padding: 2px 6px; }
    .doc-info__meta td:first-child { color: #555; padding-left: 14px; }
    .doc-info__meta td:last-child { font-weight: 600; color: #111; }

    .doc-summary { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10.5px; }
    .doc-summary th { border: 1px solid #999; background: #f5f5f5; color: #111; font-weight: 600; padding: 5px 8px; text-align: center; }
    .doc-summary td { border: 1px solid #999; padding: 6px 8px; text-align: center; font-size: 11.5px; }

    .doc-tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
    .doc-tbl th {
      border-top: 1px solid #111;
      border-bottom: 1px solid #111;
      padding: 6px 5px;
      font-weight: 700;
      background: #fff;
      color: #111;
      font-size: 10px;
    }
    .doc-tbl td {
      border-bottom: 1px solid #d6d6d6;
      padding: 5px 5px;
      vertical-align: top;
      word-wrap: break-word;
    }
    .doc-tbl tr.cancelled td { color: #888; text-decoration: line-through; }
    .doc-tbl tr.totals td {
      border-top: 1px solid #111;
      border-bottom: 1.5px solid #111;
      font-weight: 700;
      background: #fafafa;
    }
    .al-right  { text-align: right; }
    .al-left   { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; }
    .al-center { text-align: center; }

    .doc-foot {
      margin-top: 16px;
      padding-top: 6px;
      border-top: 1px solid #999;
      display: flex; justify-content: space-between;
      font-size: 9px; color: #555;
    }

    .doc-tbl thead { display: table-header-group; }
    .doc-tbl tr, .doc-summary, .doc-info, .doc-head { page-break-inside: avoid; break-inside: avoid; }

    @media print { body { padding: 0; } .no-print { display: none !important; } }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  ${headerHTML}
  ${infoHTML}
  ${summaryHTML}
  ${tableHTML}
  ${footerHTML}
</body>
</html>`;
}

/** Print via a hidden iframe (avoids "about:blank" footer). */
export function printInvoiceListHTML(html: string) {
  const existing = document.getElementById("__invlist_print_iframe__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__invlist_print_iframe__";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("print error", e);
    }
  }, 700);
}