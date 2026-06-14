/**
 * Minimal black-and-white print HTML builder for Account Statement (كشف حساب).
 *
 * Goals:
 *  - Professional accounting document look (no colored badges/pills, no dark headers).
 *  - White background, thin gray borders, plain Arabic typography.
 *  - A4-friendly with @media print rules (page-break, repeated thead).
 *  - Builds HTML directly from data — does NOT reuse the colorful on-screen preview.
 *  - RTL preserved.
 */

export interface PrintRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
  dueDate?: string;
}

export interface PrintInvoiceItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  total: number;
  unit?: string | null;
}

export interface PrintCompany {
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_number?: string;
}

export interface PrintContact {
  name: string;
  type?: string;
  code?: string;
  phone?: string;
}

export interface BuildPrintOpts {
  company: PrintCompany;
  contact: PrintContact;
  rows: PrintRow[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  dateFrom: string;
  dateTo: string;
  statementNumber: string;
  currencyLabel: string;          // e.g. "شيكل إسرائيلي (₪)"
  currencySymbol: string;          // e.g. "₪"
  /** Render a small sub-table of items beneath each invoice row. */
  includeInvoiceDetails?: boolean;
  /** Map: invoice reference → items[] */
  invoiceDetailsByRef?: Record<string, PrintInvoiceItem[]>;
  /** Show reference column. */
  showReference?: boolean;
  /** Show due-date / type columns merged into one "الاستحقاق / النوع" column. */
  showDueOrType?: boolean;
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

const typeLabel = (t: string) => {
  const x = (t || "").toLowerCase();
  if (x.includes("pos")) return "مبيعات POS";
  if (x.includes("sale") || t.includes("فاتورة")) return "فاتورة مبيعات";
  if (x.includes("receipt") || t.includes("قبض")) return "سند قبض";
  if (x.includes("payment") || t.includes("صرف")) return "سند صرف";
  if (x.includes("purchase") || t.includes("مشتريات")) return "فاتورة مشتريات";
  if (x.includes("journal") || t.includes("قيد") || x.includes("salary")) return "قيد محاسبي";
  if (x.includes("cheque")) return "شيك";
  if (x.includes("opening_balance")) return "رصيد افتتاحي";
  return "حركة";
};

export function buildAccountStatementPrintHTML(opts: BuildPrintOpts): string {
  const {
    company, contact, rows,
    openingBalance, totalDebit, totalCredit, closingBalance,
    dateFrom, dateTo, statementNumber,
    currencyLabel, currencySymbol,
    includeInvoiceDetails = false,
    invoiceDetailsByRef = {},
    showReference = true,
    showDueOrType = true,
  } = opts;

  const fmt = (n: number) => {
    const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currencySymbol}${v}`;
  };
  // Negative numbers shown with parentheses (no color)
  const fmtSigned = (n: number) => (n < 0 ? `(${fmt(n)})` : fmt(n));

  // Column model
  const cols: Array<{ key: string; label: string; align: "right" | "left" | "center"; width: string }> = [
    { key: "date", label: "التاريخ", align: "right", width: "10%" },
    ...(showReference ? [{ key: "reference", label: "المرجع", align: "right" as const, width: "12%" }] : []),
    { key: "description", label: "البيان", align: "right" as const, width: "auto" },
    ...(showDueOrType
      ? [{ key: "due_type", label: "الاستحقاق / النوع", align: "right" as const, width: "16%" }]
      : []),
    { key: "debit", label: "مدين", align: "left", width: "11%" },
    { key: "credit", label: "دائن", align: "left", width: "11%" },
    { key: "balance", label: "الرصيد", align: "left", width: "12%" },
  ];

  const colCount = cols.length;

  const renderCell = (col: typeof cols[number], r: PrintRow) => {
    switch (col.key) {
      case "date": return esc(fmtDate(r.date));
      case "reference": return esc(r.reference || "—");
      case "description": return esc(r.description || "");
      case "due_type": {
        const due = r.dueDate ? fmtDate(r.dueDate) : "";
        const type = typeLabel(r.transaction_type);
        return due ? `${esc(due)} <span style="color:#666"> · ${esc(type)}</span>` : esc(type);
      }
      case "debit": return r.debit > 0 ? esc(fmt(r.debit)) : "—";
      case "credit": return r.credit > 0 ? esc(fmt(r.credit)) : "—";
      case "balance": return esc(fmtSigned(r.balance));
      default: return "";
    }
  };

  // ─── HEADER ───
  const headerHTML = `
    <header class="doc-head">
      <div class="doc-head__right">
        <div class="doc-company">${esc(company.name || "AMWALI")}</div>
        ${company.address ? `<div class="doc-meta-line">${esc(company.address)}</div>` : ""}
        ${(company.phone || company.email)
          ? `<div class="doc-meta-line">${esc([company.phone, company.email].filter(Boolean).join(" · "))}</div>`
          : ""}
        ${company.tax_number ? `<div class="doc-meta-line">الرقم الضريبي: ${esc(company.tax_number)}</div>` : ""}
      </div>
      <div class="doc-head__left">
        <div class="doc-title">كشف حساب</div>
        <div class="doc-title-en">STATEMENT OF ACCOUNT</div>
        <div class="doc-meta-line">${esc(statementNumber)}</div>
      </div>
    </header>
  `;

  // ─── INFO BLOCK ───
  const infoHTML = `
    <section class="doc-info">
      <div class="doc-info__party">
        <div class="doc-info__label">صادر إلى</div>
        <div class="doc-info__name">${esc(contact.name || "—")}</div>
        <div class="doc-meta-line">
          ${esc(contact.type || "")}${contact.code ? ` — ${esc(contact.code)}` : ""}
        </div>
        ${contact.phone ? `<div class="doc-meta-line">${esc(contact.phone)}</div>` : ""}
      </div>
      <table class="doc-info__meta">
        <tbody>
          <tr><td>رقم الكشف</td><td>${esc(statementNumber)}</td></tr>
          <tr><td>تاريخ الإصدار</td><td>${esc(fmtToday().split(" ")[0])}</td></tr>
          <tr><td>الفترة</td><td>${esc(fmtDate(dateFrom))} — ${esc(fmtDate(dateTo))}</td></tr>
          <tr><td>العملة</td><td>${esc(currencyLabel)}</td></tr>
        </tbody>
      </table>
    </section>
  `;

  // ─── SUMMARY ROW (plain 4-column table) ───
  const summaryHTML = `
    <table class="doc-summary">
      <thead>
        <tr>
          <th>الرصيد الافتتاحي</th>
          <th>إجمالي المدين</th>
          <th>إجمالي الدائن</th>
          <th>الرصيد المستحق</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(fmtSigned(openingBalance))}</td>
          <td>${esc(fmt(totalDebit))}</td>
          <td>${esc(fmt(totalCredit))}</td>
          <td><strong>${esc(fmtSigned(closingBalance))}</strong>${
            closingBalance > 0 ? " <span class=\"muted\">(مدين)</span>"
            : closingBalance < 0 ? " <span class=\"muted\">(دائن)</span>"
            : ""}</td>
        </tr>
      </tbody>
    </table>
  `;

  // ─── MAIN TABLE ───
  const theadHTML = `
    <thead>
      <tr>
        ${cols.map(c => `<th class="al-${c.align}" style="width:${c.width}">${esc(c.label)}</th>`).join("")}
      </tr>
    </thead>
  `;

  // Opening balance row
  const openingRow = `
    <tr class="opening">
      ${cols.map(c => {
        if (c.key === "date") return `<td>${esc(fmtDate(dateFrom))}</td>`;
        if (c.key === "description") return `<td><em>رصيد أول المدة</em></td>`;
        if (c.key === "debit") return `<td class="al-left">${openingBalance > 0 ? esc(fmt(openingBalance)) : "—"}</td>`;
        if (c.key === "credit") return `<td class="al-left">${openingBalance < 0 ? esc(fmt(openingBalance)) : "—"}</td>`;
        if (c.key === "balance") return `<td class="al-left"><strong>${esc(fmtSigned(openingBalance))}</strong></td>`;
        return `<td>—</td>`;
      }).join("")}
    </tr>
  `;

  // Body rows + optional invoice item sub-tables
  const bodyRows = rows.map(r => {
    const mainTr = `
      <tr class="data-row">
        ${cols.map(c => `<td class="al-${c.align}">${renderCell(c, r)}</td>`).join("")}
      </tr>
    `;
    if (!includeInvoiceDetails) return mainTr;
    const items = invoiceDetailsByRef[r.reference];
    if (!items || items.length === 0) return mainTr;
    const itemsTbl = `
      <tr class="items-row">
        <td colspan="${colCount}" class="items-cell">
          <div class="items-label">أصناف الفاتورة ${esc(r.reference)} · ${items.length} صنف</div>
          <table class="items-tbl">
            <thead>
              <tr>
                <th class="al-right">الصنف</th>
                <th class="al-center" style="width:50px">الكمية</th>
                <th class="al-left" style="width:70px">السعر</th>
                <th class="al-left" style="width:60px">الخصم</th>
                <th class="al-left" style="width:60px">الضريبة</th>
                <th class="al-left" style="width:80px">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `
                <tr>
                  <td>${esc(it.productName || "—")}</td>
                  <td class="al-center">${esc(it.quantity)}${it.unit ? ` <span class="muted">${esc(it.unit)}</span>` : ""}</td>
                  <td class="al-left">${esc(fmt(it.unitPrice))}</td>
                  <td class="al-left">${it.discount > 0 ? esc(fmt(it.discount)) : "—"}</td>
                  <td class="al-left">${it.tax > 0 ? `${esc(it.tax)}%` : "—"}</td>
                  <td class="al-left"><strong>${esc(fmt(it.total))}</strong></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </td>
      </tr>
    `;
    return mainTr + itemsTbl;
  }).join("");

  // Totals row
  const totalsRow = `
    <tr class="totals">
      ${cols.map(c => {
        if (c.key === "description") return `<td><strong>الإجمالي</strong></td>`;
        if (c.key === "debit") return `<td class="al-left"><strong>${esc(fmt(totalDebit))}</strong></td>`;
        if (c.key === "credit") return `<td class="al-left"><strong>${esc(fmt(totalCredit))}</strong></td>`;
        if (c.key === "balance") return `<td class="al-left"><strong>${esc(fmtSigned(closingBalance))}</strong></td>`;
        return `<td></td>`;
      }).join("")}
    </tr>
  `;

  const tableHTML = `
    <table class="doc-tbl">
      ${theadHTML}
      <tbody>
        ${openingRow}
        ${bodyRows}
        ${totalsRow}
      </tbody>
    </table>
  `;

  // ─── FOOTER ───
  const footerHTML = `
    <footer class="doc-foot">
      <span>${esc(company.name || "AMWALI")}</span>
      <span>طُبع في ${esc(fmtToday())}</span>
    </footer>
  `;

  // ─── CSS (minimal, B&W, A4) ───
  const css = `
    @page { size: A4; margin: 14mm 18mm; }
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
      body {
        width: 210mm;
        min-height: 297mm;
        padding: 14mm 18mm;
      }
    }
    .muted { color: #555; font-size: 10px; }
    em { font-style: italic; color: #444; }
    strong { font-weight: 700; }

    /* Header */
    .doc-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #111;
      margin-bottom: 12px;
    }
    .doc-head__right { text-align: right; }
    .doc-head__left { text-align: left; }
    .doc-company { font-size: 16px; font-weight: 700; }
    .doc-title { font-size: 16px; font-weight: 700; letter-spacing: 0; }
    .doc-title-en { font-size: 9px; color: #555; letter-spacing: 0; margin-top: 2px; }
    .doc-meta-line { font-size: 10px; color: #444; margin-top: 2px; }

    /* Info block */
    .doc-info {
      display: flex; justify-content: space-between; gap: 24px;
      margin-bottom: 12px;
    }
    .doc-info__label { font-size: 10px; color: #555; margin-bottom: 2px; }
    .doc-info__name { font-size: 13px; font-weight: 700; }
    .doc-info__meta { border-collapse: collapse; font-size: 10px; }
    .doc-info__meta td { padding: 2px 6px; }
    .doc-info__meta td:first-child { color: #555; padding-left: 14px; }
    .doc-info__meta td:last-child { font-weight: 600; color: #111; }

    /* Summary table */
    .doc-summary {
      width: 100%; border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    .doc-summary th {
      border: 1px solid #999;
      background: #f5f5f5;
      color: #111;
      font-weight: 600;
      padding: 5px 8px;
      text-align: center;
    }
    .doc-summary td {
      border: 1px solid #999;
      padding: 6px 8px;
      text-align: center;
      font-size: 11.5px;
    }

    /* Main table */
    .doc-tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      table-layout: fixed;
    }
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
    .doc-tbl tr.opening td { color: #444; font-style: italic; }
    .doc-tbl tr.totals td {
      border-top: 1px solid #111;
      border-bottom: 1.5px solid #111;
      font-weight: 700;
      background: #fafafa;
    }
    .al-right  { text-align: right; }
    .al-left   { text-align: left;   direction: ltr; font-variant-numeric: tabular-nums; }
    .al-center { text-align: center; }

    /* Items sub-table */
    .items-row td.items-cell {
      border-bottom: 1px solid #e5e5e5;
      padding: 4px 12px 8px 12px;
      background: #fff;
    }
    .items-label { font-size: 9.5px; color: #555; margin: 2px 0 4px; }
    .items-tbl { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    .items-tbl th, .items-tbl td {
      border: 1px solid #d6d6d6;
      padding: 3px 6px;
    }
    .items-tbl th { font-weight: 600; background: #fafafa; color: #222; }

    /* Footer */
    .doc-foot {
      margin-top: 16px;
      padding-top: 6px;
      border-top: 1px solid #999;
      display: flex; justify-content: space-between;
      font-size: 9px; color: #555;
    }

    /* Page-break behaviour */
    .doc-tbl thead { display: table-header-group; }
    .doc-tbl tfoot { display: table-footer-group; }
    .doc-tbl tr,
    .items-row,
    .items-tbl tr { page-break-inside: avoid; break-inside: avoid; }
    .doc-summary, .doc-info, .doc-head { page-break-inside: avoid; break-inside: avoid; }

    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>كشف حساب — ${esc(contact.name || "")}</title>
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