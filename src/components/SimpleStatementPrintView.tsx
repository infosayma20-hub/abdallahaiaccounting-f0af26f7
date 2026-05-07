/**
 * Simple, bank-style Statement of Account print view.
 * Clean white background, clear borders, minimal colors, A4 portrait.
 * No calculations performed here — purely presentational.
 */

interface InvoiceItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  total: number;
  unit?: string | null;
}

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
  payment_method?: string | null;
  currency?: string;
  dueDate?: string;
  isLineItem?: boolean;
  lineItemDetail?: string;
  invoiceItems?: InvoiceItem[];
  voucherDetail?: {
    paymentMethod?: string | null;
    cashBox?: string | null;
    bank?: string | null;
    chequeNumber?: string | null;
    chequeDate?: string | null;
    chequeStatus?: string | null;
    notes?: string | null;
  };
}

interface CompanyInfo {
  name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  tax_number: string;
}

interface ContactInfo {
  name: string;
  type: string;
  phone: string;
  address: string;
  email?: string;
}

interface Props {
  company: CompanyInfo;
  contact: ContactInfo;
  rows: StatementRow[];
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  dateFrom: string;
  dateTo: string;
  statementNumber?: string;
  contactCode?: string;
  showCompanyLogo?: boolean;
  showContactInfo?: boolean;
  showSignature?: boolean;
  showAging?: boolean;
  agingData?: {
    current: number;
    d1_30: number;
    d31_60: number;
    d60plus: number;
    total: number;
  } | null;
}

const fmt = (n: number) =>
  `₪${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[0]}-${p[1]}-${p[2]}` : d;
};

const fmtToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getTypeLabel = (t: string) => {
  if (!t) return "حركة";
  if (t.includes("pos")) return "مبيعات POS";
  if (t.includes("sale") || t.includes("فاتورة مبيعات") || t === "invoice") return "فاتورة مبيعات";
  if (t.includes("purchase") || t.includes("مشتريات")) return "فاتورة مشتريات";
  if (t.includes("receipt") || t.includes("قبض")) return "سند قبض";
  if (t.includes("payment") || t.includes("صرف")) return "سند صرف";
  if (t.includes("reverse") || t.includes("عكس")) return "قيد عكسي";
  if (t.includes("journal") || t.includes("قيد") || t.includes("salary")) return "قيد محاسبي";
  if (t.includes("cheque") || t.includes("شيك")) return "شيك";
  if (t.includes("opening")) return "رصيد افتتاحي";
  if (t.includes("expense") || t.includes("مصروف")) return "مصروف";
  return t;
};

// ─────── Color tokens (semantic) ───────
const C = {
  navy: "#0D1B2E",
  ink: "#111827",
  sub: "#6B7280",
  border: "#D1D5DB",
  borderSoft: "#E5E7EB",
  rowAlt: "#FAFAFA",
  debit: "#DC2626",   // red
  credit: "#059669",  // green
  warn: "#F59E0B",
  warnBg: "#FFFBEB",
  warnInk: "#92400E",
};

const SimpleStatementPrintView = ({
  company,
  contact,
  rows,
  openingBalance,
  closingBalance,
  totalDebit,
  totalCredit,
  dateFrom,
  dateTo,
  statementNumber,
  contactCode,
  showCompanyLogo = true,
  showContactInfo = true,
  showSignature = true,
  showAging = true,
  agingData = null,
}: Props) => {
  const soaNum = statementNumber || "SOA-0000";

  // Group invoice-table sub-rows under their parent row so we can render
  // a single "details" sub-row directly under the invoice line (without
  // breaking the bank-table look).
  const invoiceItemsByParent: Record<string, InvoiceItem[]> = {};
  rows.forEach((r) => {
    if (r.lineItemDetail === "invoice-table" && r.invoiceItems?.length) {
      // The parent transaction id is the original (without "-invoice-table")
      const parentId = r.transaction_id.replace(/-invoice-table$/, "");
      invoiceItemsByParent[parentId] = r.invoiceItems;
    }
  });

  // Build a clean primary list (skip nested marker rows — we render details
  // as a separate row right after the parent).
  const mainRows = rows.filter((r) => !r.isLineItem);

  const cellBase: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    padding: "7px 8px",
    fontSize: 11,
    color: C.ink,
    verticalAlign: "middle",
  };
  const thBase: React.CSSProperties = {
    ...cellBase,
    background: C.navy,
    color: "#FFFFFF",
    fontWeight: 600,
    fontSize: 11,
    textAlign: "center",
  };
  const numCell: React.CSSProperties = {
    direction: "ltr",
    fontFamily: "system-ui, -apple-system, monospace",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        direction: "rtl",
        fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
        fontSize: 12,
        color: C.ink,
        background: "white",
        padding: "32px 36px",
        boxSizing: "border-box",
      }}
      dir="rtl"
    >
      {/* ════════ HEADER ════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "flex-start",
          gap: 16,
          paddingBottom: 14,
          borderBottom: `2px solid ${C.navy}`,
        }}
      >
        {/* Right (RTL first): Company */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
            {company.name || "—"}
          </div>
          {showContactInfo && company.address && (
            <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>{company.address}</div>
          )}
          {showContactInfo && company.phone && (
            <div style={{ fontSize: 11, color: C.sub, direction: "ltr", textAlign: "right" }}>
              {company.phone}
            </div>
          )}
          {showContactInfo && company.tax_number && (
            <div style={{ fontSize: 10.5, color: C.sub, marginTop: 2 }}>
              ضريبي: {company.tax_number}
            </div>
          )}
        </div>

        {/* Center: Title + logo */}
        <div style={{ textAlign: "center", padding: "0 12px" }}>
          {showCompanyLogo && company.logo_url && (
            <img
              src={company.logo_url}
              alt={company.name || "Logo"}
              crossOrigin="anonymous"
              style={{ maxHeight: 38, maxWidth: 130, objectFit: "contain", marginBottom: 6 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div style={{ fontSize: 24, fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>
            كشف حساب
          </div>
        </div>

        {/* Left (RTL last): Contact */}
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 10.5, color: C.sub, marginBottom: 2 }}>العميل</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{contact.name || "—"}</div>
          {contact.phone && (
            <div style={{ fontSize: 11, color: C.sub, direction: "ltr", textAlign: "left" }}>
              {contact.phone}
            </div>
          )}
          {contactCode && (
            <div
              style={{
                display: "inline-block",
                marginTop: 4,
                fontSize: 10.5,
                color: C.navy,
                border: `1px solid ${C.border}`,
                padding: "1px 6px",
                borderRadius: 3,
                fontFamily: "monospace",
              }}
            >
              {contactCode}
            </div>
          )}
        </div>
      </div>

      {/* ════════ INFO ROW (4 boxes) ════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginTop: 14,
        }}
      >
        {[
          { label: "رقم الحساب", value: contactCode || "—" },
          { label: "تاريخ الإصدار", value: fmtToday() },
          { label: "العملة", value: "شيكل إسرائيلي (₪)" },
          { label: "فترة الحساب", value: `${fmtDate(dateFrom)} إلى ${fmtDate(dateTo)}` },
        ].map((b) => (
          <div
            key={b.label}
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 10px",
              borderRadius: 3,
              background: "white",
            }}
          >
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 3 }}>{b.label}</div>
            <div style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{b.value}</div>
          </div>
        ))}
      </div>

      {/* ════════ SUMMARY (4 boxes) ════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginTop: 12,
        }}
      >
        {[
          { label: "الرصيد السابق", value: fmt(openingBalance), color: C.ink },
          { label: "إجمالي المدين", value: fmt(totalDebit), color: C.debit },
          { label: "إجمالي الدائن", value: fmt(totalCredit), color: C.credit },
          { label: "الرصيد الحالي", value: fmt(closingBalance), color: C.navy },
        ].map((b) => (
          <div
            key={b.label}
            style={{
              border: `1px solid ${C.border}`,
              padding: "10px 12px",
              borderRadius: 3,
              background: "white",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10.5, color: C.sub, marginBottom: 4 }}>{b.label}</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: b.color,
                direction: "ltr",
                fontFamily: "system-ui, -apple-system, monospace",
              }}
            >
              {b.value}
            </div>
          </div>
        ))}
      </div>

      {/* ════════ MAIN TABLE ════════ */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 16,
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "auto" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thBase}>التاريخ</th>
            <th style={thBase}>المرجع</th>
            <th style={thBase}>النوع</th>
            <th style={thBase}>البيان</th>
            <th style={thBase}>مدين (₪)</th>
            <th style={thBase}>دائن (₪)</th>
            <th style={thBase}>الرصيد (₪)</th>
          </tr>
        </thead>
        <tbody>
          {/* Opening balance */}
          <tr style={{ background: C.rowAlt }}>
            <td style={cellBase}>{fmtDate(dateFrom)}</td>
            <td style={{ ...cellBase, color: C.sub }}>—</td>
            <td style={{ ...cellBase, color: C.sub }}>—</td>
            <td style={{ ...cellBase, fontStyle: "italic", color: C.sub }}>رصيد أول المدة</td>
            <td style={{ ...cellBase, ...numCell, color: C.sub }}>—</td>
            <td style={{ ...cellBase, ...numCell, color: C.sub }}>—</td>
            <td style={{ ...cellBase, ...numCell, fontWeight: 600 }}>{fmt(openingBalance)}</td>
          </tr>

          {mainRows.map((r, i) => {
            const items = invoiceItemsByParent[r.transaction_id];
            const altBg = i % 2 === 1 ? C.rowAlt : "white";
            return (
              <>
                <tr key={r.transaction_id + "-" + i} style={{ background: altBg }}>
                  <td style={cellBase}>{fmtDate(r.date)}</td>
                  <td style={{ ...cellBase, fontFamily: "monospace", fontSize: 10.5, color: C.navy }}>
                    {r.reference || "—"}
                  </td>
                  <td style={{ ...cellBase, fontSize: 11, color: C.sub }}>
                    {getTypeLabel(r.transaction_type)}
                  </td>
                  <td style={{ ...cellBase, lineHeight: 1.45 }}>{r.description}</td>
                  <td style={{ ...cellBase, ...numCell, color: r.debit > 0 ? C.debit : C.sub }}>
                    {r.debit > 0 ? fmt(r.debit) : "—"}
                  </td>
                  <td style={{ ...cellBase, ...numCell, color: r.credit > 0 ? C.credit : C.sub }}>
                    {r.credit > 0 ? fmt(r.credit) : "—"}
                  </td>
                  <td style={{ ...cellBase, ...numCell, fontWeight: 600 }}>{fmt(r.balance)}</td>
                </tr>
                {items && items.length > 0 && (
                  <tr key={r.transaction_id + "-details-" + i} style={{ pageBreakInside: "avoid" }}>
                    <td colSpan={7} style={{ border: `1px solid ${C.border}`, padding: "10px 14px", background: "#FAFBFC" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
                        تفاصيل الفاتورة {r.reference}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
                        <thead>
                          <tr>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "right" }}>الصنف</th>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "center", width: 60 }}>الكمية</th>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "left", width: 80 }}>السعر</th>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "left", width: 70 }}>الخصم</th>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "left", width: 60 }}>الضريبة</th>
                            <th style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, background: "#F3F4F6", textAlign: "left", width: 90 }}>الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => (
                            <tr key={idx}>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11 }}>{it.productName || "—"}</td>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, textAlign: "center" }}>
                                {it.quantity}{it.unit ? ` ${it.unit}` : ""}
                              </td>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, textAlign: "left", direction: "ltr" }}>{fmt(it.unitPrice)}</td>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, textAlign: "left", direction: "ltr", color: it.discount > 0 ? C.warnInk : C.sub }}>
                                {it.discount > 0 ? it.discount : "—"}
                              </td>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, textAlign: "left", direction: "ltr", color: C.sub }}>
                                {it.tax > 0 ? `${it.tax}%` : "—"}
                              </td>
                              <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, textAlign: "left", direction: "ltr", fontWeight: 600 }}>{fmt(it.total)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={5} style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11, fontWeight: 700, textAlign: "left", background: "#F9FAFB" }}>الإجمالي</td>
                            <td style={{ border: `1px solid ${C.borderSoft}`, padding: "5px 8px", fontSize: 11.5, fontWeight: 700, textAlign: "left", direction: "ltr", color: C.navy, background: "#F9FAFB" }}>
                              {fmt(items.reduce((s, it) => s + (Number(it.total) || 0), 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}

          {/* Totals row */}
          <tr style={{ background: C.navy }}>
            <td style={{ ...cellBase, color: "#fff", fontWeight: 700 }} colSpan={4}>الإجمالي</td>
            <td style={{ ...cellBase, ...numCell, color: "#fff", fontWeight: 700 }}>{fmt(totalDebit)}</td>
            <td style={{ ...cellBase, ...numCell, color: "#fff", fontWeight: 700 }}>{fmt(totalCredit)}</td>
            <td style={{ ...cellBase, ...numCell, color: "#fff", fontWeight: 700 }}>{fmt(closingBalance)}</td>
          </tr>
        </tbody>
      </table>

      {/* ════════ OUTSTANDING ALERT ════════ */}
      <div style={{ marginTop: 14 }}>
        {closingBalance > 0 ? (
          <div
            style={{
              borderRight: `4px solid ${C.warn}`,
              background: C.warnBg,
              color: C.warnInk,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: "0 4px 4px 0",
            }}
          >
            ملاحظة: الرصيد المستحق على العميل: {fmt(closingBalance)} — يرجى التواصل لترتيب السداد.
          </div>
        ) : closingBalance < 0 ? (
          <div
            style={{
              borderRight: `4px solid ${C.credit}`,
              background: "#ECFDF5",
              color: "#065F46",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: "0 4px 4px 0",
            }}
          >
            رصيد دائن لصالح العميل: {fmt(closingBalance)}
          </div>
        ) : (
          <div
            style={{
              borderRight: `4px solid ${C.border}`,
              background: "#F9FAFB",
              color: C.sub,
              padding: "10px 14px",
              fontSize: 12,
              borderRadius: "0 4px 4px 0",
            }}
          >
            لا يوجد رصيد مستحق — الحساب مسدد بالكامل.
          </div>
        )}
      </div>

      {/* ════════ AGING ════════ */}
      {showAging && agingData && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
          <thead>
            <tr>
              <th style={thBase} colSpan={5}>تحليل التقادم (Aging)</th>
            </tr>
            <tr>
              <th style={{ ...thBase, background: "#F3F4F6", color: C.ink }}>جاري</th>
              <th style={{ ...thBase, background: "#F3F4F6", color: C.ink }}>1–30 يوم</th>
              <th style={{ ...thBase, background: "#F3F4F6", color: C.ink }}>31–60 يوم</th>
              <th style={{ ...thBase, background: "#F3F4F6", color: C.ink }}>+60 يوم</th>
              <th style={{ ...thBase, background: "#F3F4F6", color: C.ink }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cellBase, ...numCell, textAlign: "center", color: C.credit }}>{fmt(agingData.current)}</td>
              <td style={{ ...cellBase, ...numCell, textAlign: "center" }}>{fmt(agingData.d1_30)}</td>
              <td style={{ ...cellBase, ...numCell, textAlign: "center" }}>{fmt(agingData.d31_60)}</td>
              <td style={{ ...cellBase, ...numCell, textAlign: "center", color: C.debit }}>{fmt(agingData.d60plus)}</td>
              <td style={{ ...cellBase, ...numCell, textAlign: "center", fontWeight: 700 }}>{fmt(agingData.total)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ════════ SIGNATURES ════════ */}
      {showSignature && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 60, marginTop: 50 }}>
          <div style={{ flex: 1, borderTop: `1px solid ${C.border}`, paddingTop: 6, fontSize: 10.5, color: C.sub, textAlign: "center" }}>
            ختم الشركة وتوقيع المحاسب
          </div>
          <div style={{ flex: 1, borderTop: `1px solid ${C.border}`, paddingTop: 6, fontSize: 10.5, color: C.sub, textAlign: "center" }}>
            اعتماد العميل
          </div>
        </div>
      )}

      {/* ════════ FOOTER ════════ */}
      <div
        style={{
          marginTop: 22,
          paddingTop: 8,
          borderTop: `1px solid ${C.borderSoft}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: C.sub,
        }}
      >
        <span>طُبع بتاريخ: {fmtToday()}</span>
        <span style={{ color: C.ink, fontWeight: 600 }}>{company.name || ""}</span>
        <span>{soaNum}</span>
      </div>
    </div>
  );
};

export default SimpleStatementPrintView;