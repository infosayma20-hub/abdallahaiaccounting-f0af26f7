import { openPrintWindow, esc } from "@/lib/print/openPrintWindow";

export interface SingleVoucherPrintOptions {
  /** e.g. "سند قبض" / "سند صرف" / "فاتورة" */
  docTypeLabel: string;
  refNumber: string;
  date: string;
  companyName?: string;
  partyLabel: string;       // العميل/المورد
  partyName: string;
  paymentMethod?: string;
  account?: string;         // الصندوق/البنك
  costCenter?: string;
  currency: string;
  amount: number;
  amountInWords?: string;
  notes?: string;
  status?: string;
  /** optional lines/items (e.g. invoice items). columns must match each row length. */
  itemColumns?: string[];
  itemRows?: (string | number)[][];
}

/**
 * Print a single voucher / invoice in the same clean SOA style.
 */
export function printSingleVoucher(o: SingleVoucherPrintOptions): void {
  const printedAt = new Date().toLocaleString("ar-EG-u-nu-latn", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const amountStr = o.amount.toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const header = `
    <div class="doc-header">
      <div>
        <h1>${esc(o.docTypeLabel)}</h1>
        ${o.companyName ? `<div class="muted" style="margin-top:2px;">${esc(o.companyName)}</div>` : ""}
      </div>
      <div class="meta">
        <div><strong>${esc(o.refNumber)}</strong></div>
        <div>التاريخ: ${esc(o.date)}</div>
        ${o.status ? `<div>الحالة: ${esc(o.status)}</div>` : ""}
      </div>
    </div>
  `;

  const pairs: { label: string; value: string }[] = [
    { label: o.partyLabel, value: o.partyName || "—" },
  ];
  if (o.paymentMethod) pairs.push({ label: "طريقة الدفع", value: o.paymentMethod });
  if (o.account) pairs.push({ label: "الصندوق / البنك", value: o.account });
  if (o.costCenter) pairs.push({ label: "مركز التكلفة", value: o.costCenter });
  pairs.push({ label: "العملة", value: o.currency });

  const infoBlock = `
    <div class="info-grid">
      ${pairs.map((p) => `<div><span class="label">${esc(p.label)}: </span><strong>${esc(p.value)}</strong></div>`).join("")}
    </div>
  `;

  const amountBlock = `
    <table style="margin-bottom:12px;">
      <thead><tr>
        <th style="text-align:right">المبلغ</th>
        <th style="text-align:right">العملة</th>
        <th style="text-align:right">المبلغ بالكلمات</th>
      </tr></thead>
      <tbody><tr>
        <td class="num" style="text-align:right;font-weight:700;font-size:14px;">${amountStr}</td>
        <td>${esc(o.currency)}</td>
        <td style="font-size:11px;">${esc(o.amountInWords || "—")}</td>
      </tr></tbody>
    </table>
  `;

  let itemsBlock = "";
  if (o.itemColumns?.length && o.itemRows?.length) {
    const thead = `<thead><tr>${o.itemColumns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${o.itemRows
      .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
    itemsBlock = `<table style="margin-bottom:12px;">${thead}${tbody}</table>`;
  }

  const notesBlock = o.notes
    ? `<div class="info-grid" style="grid-template-columns:1fr;">
         <div><span class="label">ملاحظات: </span>${esc(o.notes)}</div>
       </div>`
    : "";

  const signatures = `
    <table style="margin-top:24px;border:0;">
      <tbody><tr>
        <td style="border:0;text-align:center;padding-top:36px;border-top:1px dashed #94A3B8;width:33%;">المُستلِم</td>
        <td style="border:0;width:5%"></td>
        <td style="border:0;text-align:center;padding-top:36px;border-top:1px dashed #94A3B8;width:33%;">المحاسب</td>
        <td style="border:0;width:5%"></td>
        <td style="border:0;text-align:center;padding-top:36px;border-top:1px dashed #94A3B8;width:33%;">المدير</td>
      </tr></tbody>
    </table>
  `;

  const footer = `
    <div class="footer-line">
      <span>${esc(o.companyName || "")}</span>
      <span>طُبع في ${printedAt}</span>
    </div>
  `;

  openPrintWindow({
    title: `${o.docTypeLabel} ${o.refNumber}`,
    bodyHtml: header + infoBlock + amountBlock + itemsBlock + notesBlock + signatures + footer,
  });
}