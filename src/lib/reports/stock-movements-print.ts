/**
 * Minimal black-and-white print HTML builder for Stock Movements report
 * (كشف حركات المخزون). Matches the visual language of the account statement
 * print (buildAccountStatementPrintHTML): white background, thin gray borders,
 * plain Arabic typography, A4-friendly with @media print rules.
 */

export interface StockPrintRow {
  date: string;              // ISO or yyyy-mm-dd
  productName: string;
  unit?: string | null;
  movementType: string;      // وارد / صادر / تعديل يدوي / مرتجع...
  direction: "in" | "out" | "neutral";
  quantity: number;          // absolute
  balanceAfter: number | null;
  reference?: string | null; // e.g. INV-2026-0057
  note?: string | null;
  warehouse?: string | null;
}

export interface StockPrintCompany {
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_number?: string;
}

export interface BuildStockPrintOpts {
  company: StockPrintCompany;
  rows: StockPrintRow[];
  totalIn: number;
  totalOut: number;
  netDelta: number;
  reportNumber: string;
  // Filter context (optional labels)
  productLabel?: string;
  warehouseLabel?: string;
  typeLabel?: string;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

const fmtToday = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fmtQty = (n: number) =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const fmtSigned = (n: number) => (n < 0 ? `(${fmtQty(n)})` : fmtQty(n));

export function buildStockMovementsPrintHTML(opts: BuildStockPrintOpts): string {
  const {
    company, rows, totalIn, totalOut, netDelta,
    reportNumber, productLabel, warehouseLabel, typeLabel,
  } = opts;

  const cols: Array<{ key: string; label: string; align: "right" | "left" | "center"; width: string }> = [
    { key: "date", label: "التاريخ", align: "right", width: "11%" },
    { key: "reference", label: "المرجع", align: "right", width: "13%" },
    { key: "product", label: "المنتج", align: "right", width: "auto" },
    { key: "type", label: "النوع", align: "center", width: "10%" },
    { key: "in", label: "وارد", align: "left", width: "10%" },
    { key: "out", label: "صادر", align: "left", width: "10%" },
    { key: "balance", label: "الرصيد بعد الحركة", align: "left", width: "13%" },
  ];

  const renderCell = (key: string, r: StockPrintRow) => {
    switch (key) {
      case "date": return esc(fmtDate(r.date));
      case "reference": return esc(r.reference || "—");
      case "product": {
        const unit = r.unit ? ` <span class="muted">(${esc(r.unit)})</span>` : "";
        const wh = r.warehouse ? `<div class="muted" style="font-size:9px">${esc(r.warehouse)}</div>` : "";
        const note = r.note ? `<div class="muted" style="font-size:9px">${esc(r.note)}</div>` : "";
        return `${esc(r.productName || "—")}${unit}${wh}${note}`;
      }
      case "type": return esc(r.movementType || "—");
      case "in":
        return r.direction === "in" ? esc(fmtQty(r.quantity))
             : r.direction === "neutral" && r.quantity > 0 ? esc(fmtQty(r.quantity))
             : "—";
      case "out":
        return r.direction === "out" ? esc(fmtQty(r.quantity))
             : r.direction === "neutral" && r.quantity < 0 ? esc(fmtQty(r.quantity))
             : "—";
      case "balance":
        return r.balanceAfter == null ? "—" : esc(fmtSigned(r.balanceAfter));
      default: return "";
    }
  };

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
        <div class="doc-title">كشف حركات المخزون</div>
        <div class="doc-title-en">STOCK MOVEMENTS REPORT</div>
        <div class="doc-meta-line">${esc(reportNumber)}</div>
      </div>
    </header>
  `;

  const infoHTML = `
    <section class="doc-info">
      <div class="doc-info__party">
        <div class="doc-info__label">نطاق التقرير</div>
        <div class="doc-info__name">${esc(productLabel || "جميع المنتجات")}</div>
        <div class="doc-meta-line">
          ${esc(warehouseLabel || "جميع المستودعات")}${typeLabel ? ` — ${esc(typeLabel)}` : ""}
        </div>
      </div>
      <table class="doc-info__meta">
        <tbody>
          <tr><td>رقم التقرير</td><td>${esc(reportNumber)}</td></tr>
          <tr><td>تاريخ الإصدار</td><td>${esc(fmtToday().split(" ")[0])}</td></tr>
          <tr><td>عدد الحركات</td><td>${esc(rows.length.toLocaleString("en-US"))}</td></tr>
        </tbody>
      </table>
    </section>
  `;

  const summaryHTML = `
    <table class="doc-summary">
      <thead>
        <tr>
          <th>إجمالي الوارد</th>
          <th>إجمالي الصادر</th>
          <th>صافي التغيير</th>
          <th>عدد الحركات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(fmtQty(totalIn))}</td>
          <td>${esc(fmtQty(totalOut))}</td>
          <td><strong>${esc(fmtSigned(netDelta))}</strong>${
            netDelta > 0 ? ' <span class="muted">(زيادة)</span>'
            : netDelta < 0 ? ' <span class="muted">(نقص)</span>'
            : ""}</td>
          <td>${esc(rows.length.toLocaleString("en-US"))}</td>
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

  const bodyRows = rows.length === 0
    ? `<tr><td colspan="${cols.length}" style="text-align:center;padding:16px;color:#666">لا توجد حركات ضمن المعايير المحددة</td></tr>`
    : rows.map(r => `
        <tr class="data-row">
          ${cols.map(c => `<td class="al-${c.align}">${renderCell(c.key, r)}</td>`).join("")}
        </tr>
      `).join("");

  const totalsRow = rows.length > 0 ? `
    <tr class="totals">
      ${cols.map(c => {
        if (c.key === "product") return `<td><strong>الإجمالي</strong></td>`;
        if (c.key === "in") return `<td class="al-left"><strong>${esc(fmtQty(totalIn))}</strong></td>`;
        if (c.key === "out") return `<td class="al-left"><strong>${esc(fmtQty(totalOut))}</strong></td>`;
        if (c.key === "balance") return `<td class="al-left"><strong>${esc(fmtSigned(netDelta))}</strong></td>`;
        return `<td></td>`;
      }).join("")}
    </tr>
  ` : "";

  const tableHTML = `
    <table class="doc-tbl">
      ${theadHTML}
      <tbody>
        ${bodyRows}
        ${totalsRow}
      </tbody>
    </table>
  `;

  const footerHTML = `
    <footer class="doc-foot">
      <span>${esc(company.name || "AMWALI")}</span>
      <span>طُبع في ${esc(fmtToday())}</span>
    </footer>
  `;

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
      body { width: 210mm; min-height: 297mm; padding: 14mm 18mm; }
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

    .doc-info {
      display: flex; justify-content: space-between; gap: 24px; margin-bottom: 12px;
    }
    .doc-info__label { font-size: 10px; color: #555; margin-bottom: 2px; }
    .doc-info__name { font-size: 13px; font-weight: 700; }
    .doc-info__meta { border-collapse: collapse; font-size: 10px; }
    .doc-info__meta td { padding: 2px 6px; }
    .doc-info__meta td:first-child { color: #555; padding-left: 14px; }
    .doc-info__meta td:last-child { font-weight: 600; color: #111; }

    .doc-summary { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10.5px; }
    .doc-summary th {
      border: 1px solid #999; background: #f5f5f5; color: #111;
      font-weight: 600; padding: 5px 8px; text-align: center;
    }
    .doc-summary td {
      border: 1px solid #999; padding: 6px 8px; text-align: center; font-size: 11.5px;
    }

    .doc-tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
    .doc-tbl th {
      border-top: 1px solid #111; border-bottom: 1px solid #111;
      padding: 6px 5px; font-weight: 700; background: #fff; color: #111; font-size: 10px;
    }
    .doc-tbl td {
      border-bottom: 1px solid #d6d6d6; padding: 5px 5px; vertical-align: top; word-wrap: break-word;
    }
    .doc-tbl tr.totals td {
      border-top: 1px solid #111; border-bottom: 1.5px solid #111;
      font-weight: 700; background: #fafafa;
    }
    .al-right { text-align: right; }
    .al-left { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; }
    .al-center { text-align: center; }

    .doc-foot {
      margin-top: 16px; padding-top: 6px; border-top: 1px solid #999;
      display: flex; justify-content: space-between; font-size: 9px; color: #555;
    }

    .doc-tbl thead { display: table-header-group; }
    .doc-tbl tr { page-break-inside: avoid; break-inside: avoid; }
    .doc-summary, .doc-info, .doc-head { page-break-inside: avoid; break-inside: avoid; }

    @media print { body { padding: 0; } .no-print { display: none !important; } }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>كشف حركات المخزون — ${esc(reportNumber)}</title>
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