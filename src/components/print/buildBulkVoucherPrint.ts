import { openPrintWindow, esc } from "@/lib/print/openPrintWindow";

export interface BulkVoucherPrintLine {
  index: number;
  party: string;
  description: string;
  amount: number;
}

export interface BulkVoucherPrintOptions {
  mode: "payment" | "receipt";
  refNumber: string;
  date: string;
  paymentMethodLabel: string;
  sourceLabel: string;
  description?: string;
  notes?: string;
  companyName?: string;
  lines: BulkVoucherPrintLine[];
  total: number;
  currency?: string;
  status?: string;
}

/**
 * Compact A4 print template for a Bulk Payment/Receipt Voucher.
 * Shows header, lines grid, total, and signatures box.
 */
export function printBulkVoucher(opts: BulkVoucherPrintOptions): void {
  const {
    mode, refNumber, date, paymentMethodLabel, sourceLabel,
    description, notes, companyName, lines, total,
    currency = "₪", status,
  } = opts;

  const title = mode === "payment" ? "سند صرف جماعي" : "سند قبض جماعي";
  const sideAmount = `${currency}${Number(total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const now = new Date();
  const printDate = now.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });

  const rowsHtml = lines.map((l) => `
    <tr>
      <td class="c">${l.index}</td>
      <td>${esc(l.party || "—")}</td>
      <td>${esc(l.description || "")}</td>
      <td class="l num">${currency}${Number(l.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  const bodyHtml = `
    <div class="doc-header">
      <div>
        <h1>${esc(title)}</h1>
        ${companyName ? `<div class="muted">${esc(companyName)}</div>` : ""}
      </div>
      <div class="meta">
        <div><b>رقم السند:</b> ${esc(refNumber)}</div>
        <div><b>التاريخ:</b> ${esc(date)}</div>
        <div><b>تاريخ الطباعة:</b> ${printDate}</div>
        ${status ? `<div><b>الحالة:</b> ${esc(status)}</div>` : ""}
      </div>
    </div>

    <div class="info-grid">
      <div><b>طريقة الدفع:</b> ${esc(paymentMethodLabel)}</div>
      <div><b>${mode === "payment" ? "من:" : "إلى:"}</b> ${esc(sourceLabel)}</div>
      <div><b>عدد السطور:</b> ${lines.length}</div>
    </div>

    ${description ? `<div class="desc"><b>البيان:</b> ${esc(description)}</div>` : ""}

    <table class="lines">
      <thead>
        <tr>
          <th class="c" style="width:36px;">#</th>
          <th>${mode === "payment" ? "المستفيد / الحساب" : "العميل / الحساب"}</th>
          <th>البيان</th>
          <th class="l" style="width:120px;">المبلغ</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="r"><b>الإجمالي</b></td>
          <td class="l num"><b>${sideAmount}</b></td>
        </tr>
      </tfoot>
    </table>

    ${notes ? `<div class="notes"><b>ملاحظات:</b> ${esc(notes)}</div>` : ""}

    <div class="signatures">
      <div class="sig"><div class="lbl">المُعِدّ</div><div class="line"></div></div>
      <div class="sig"><div class="lbl">المدير المالي</div><div class="line"></div></div>
      <div class="sig"><div class="lbl">${mode === "payment" ? "المستلم" : "المُسلِّم"}</div><div class="line"></div></div>
    </div>
  `;

  const extraCss = `
    body { font-family: "Segoe UI", Tahoma, sans-serif; direction: rtl; color: #111; }
    .doc-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0D1B2E; padding-bottom:10px; margin-bottom:12px; }
    .doc-header h1 { margin:0; font-size:20px; color:#0D1B2E; }
    .doc-header .meta { text-align:left; font-size:11px; color:#333; }
    .doc-header .meta > div { margin-bottom:3px; }
    .muted { color:#666; font-size:12px; margin-top:2px; }
    .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:12px; background:#f7f9fc; padding:8px 10px; border-radius:6px; margin-bottom:10px; }
    .desc { font-size:12.5px; margin-bottom:10px; padding:6px 10px; background:#fffbea; border-right:3px solid #f5b400; }
    table.lines { width:100%; border-collapse:collapse; font-size:12px; }
    table.lines th, table.lines td { border:1px solid #d5dbe3; padding:6px 8px; }
    table.lines thead th { background:#0D1B2E; color:#fff; text-align:right; font-weight:600; }
    table.lines tbody tr:nth-child(even) td { background:#f8fafc; }
    table.lines tfoot td { background:#e9eef5; font-size:13px; }
    .c { text-align:center; }
    .l { text-align:left; }
    .r { text-align:right; }
    .num { font-variant-numeric: tabular-nums; font-family: Consolas, monospace; }
    .notes { margin-top:10px; padding:6px 10px; font-size:12px; background:#f7f9fc; border-radius:6px; }
    .signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-top:32px; }
    .signatures .sig { text-align:center; font-size:12px; }
    .signatures .lbl { color:#555; margin-bottom:28px; }
    .signatures .line { border-top:1px solid #333; padding-top:4px; }
    @page { size: A4; margin: 12mm; }
  `;

  openPrintWindow({ title, bodyHtml, extraCss, autoPrint: true });
}