/**
 * Clean B&W Statement of Account Print View — QOYOD-inspired
 */

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
  invoiceItems?: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    tax: number;
    total: number;
    unit?: string | null;
  }>;
  voucherDetail?: {
    paymentMethod?: string | null;
    cashBox?: string | null;
    bank?: string | null;
    chequeNumber?: string | null;
    chequeDate?: string | null;
    chequeStatus?: string | null;
    notes?: string | null;
  };
  voucherKind?: string;
  voucherAmount?: number;
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
  /** View options — control which document elements appear in the printed output. */
  showCompanyLogo?: boolean;
  showContactInfo?: boolean;
  showSignature?: boolean;
  showReference?: boolean;
  showDueDate?: boolean;
  showType?: boolean;
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
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const fmtToday = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const getTypeLabel = (t: string) => {
  if (t.includes("pos")) return "مبيعات POS";
  if (t.includes("sale") || t.includes("فاتورة")) return "فاتورة مبيعات";
  if (t.includes("receipt") || t.includes("قبض")) return "سند قبض";
  if (t.includes("payment") || t.includes("صرف")) return "سند صرف";
  if (t.includes("purchase") || t.includes("مشتريات")) return "فاتورة مشتريات";
  if (t.includes("journal") || t.includes("قيد") || t.includes("salary")) return "قيد محاسبي";
  if (t.includes("cheque")) return "شيك";
  if (t.includes("opening_balance")) return "رصيد افتتاحي";
  return "حركة";
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي", bank: "بنك", cheque: "شيك", check: "شيك",
  transfer: "تحويل", card: "بطاقة", credit: "آجل",
};
const paymentMethodLabel = (m?: string | null) => m ? (PAYMENT_METHOD_LABELS[m] || m) : "—";

const CHEQUE_STATUS_LABELS: Record<string, string> = {
  registered: "مسجل", deferred: "مؤجل", due: "مستحق",
  deposited: "مودع بالبنك", under_collection: "برسم التحصيل",
  collected: "محصّل", endorsed: "مجيّر لمورد",
  returned: "مرتجع", return_to_customer: "مرتجع للعميل", rejected: "مرفوض",
  paid: "مدفوع", cancelled: "ملغى",
};

const S = {
  page: { direction: "rtl" as const, fontFamily: "'Cairo', Arial, sans-serif", fontSize: 11, color: "#111827", background: "white", padding: "40px 48px", maxWidth: 780 },
  headerWrap: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: "2px solid #111827" } as React.CSSProperties,
  companyName: { fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 },
  companySub: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  titleBlock: { textAlign: "left" as const },
  titleAr: { fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 },
  titleEn: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  soaNum: { fontSize: 10, color: "#6B7280", marginTop: 4 },
  infoGrid: { display: "flex", justifyContent: "space-between", gap: 24, marginTop: 16, marginBottom: 16 } as React.CSSProperties,
  infoLabel: { fontSize: 10, color: "#6B7280", marginBottom: 2, margin: 0 },
  infoName: { fontSize: 13, fontWeight: 600, color: "#111827", margin: "2px 0" },
  infoType: { fontSize: 10, color: "#6B7280", marginTop: 1, margin: 0 },
  metaTable: { fontSize: 10, borderCollapse: "collapse" as const },
  metaLabel: { color: "#6B7280", padding: "2px 0", paddingLeft: 16, whiteSpace: "nowrap" as const, textAlign: "right" as const },
  metaValue: { color: "#111827", fontWeight: 500, padding: "2px 0", textAlign: "right" as const },
  summaryBar: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } as React.CSSProperties,
  summaryItem: { flex: 1, textAlign: "center" as const },
  summaryLabel: { fontSize: 9, color: "#9CA3AF", marginBottom: 2 },
  summaryDivider: { width: 1, height: 32, background: "#E5E7EB", flexShrink: 0 } as React.CSSProperties,
  table: { width: "100%", tableLayout: "fixed" as const, borderCollapse: "collapse" as const },
  th: { borderTop: "1px solid #111827", borderBottom: "1px solid #111827", background: "white", fontSize: 10, fontWeight: 600, color: "#111827", padding: "7px 4px", whiteSpace: "normal" as const, wordBreak: "keep-all" as const, textAlign: "right" as const },
  td: { borderBottom: "1px solid #F3F4F6", fontSize: 10.5, padding: "6px 4px", verticalAlign: "top" as const },
  tdAmount: { textAlign: "left" as const, whiteSpace: "nowrap" as const, direction: "ltr" as const, fontFamily: "system-ui, monospace" },
  totalsRow: { borderTop: "1px solid #111827", borderBottom: "1px solid #111827", background: "white" },
  alert: { borderRight: "3px solid #F59E0B", padding: "8px 12px", fontSize: 10, color: "#92400E", background: "#FFFBEB", borderRadius: "0 4px 4px 0", marginTop: 12 },
  statsLine: { fontSize: 9.5, color: "#6B7280", marginTop: 8, textAlign: "center" as const } as React.CSSProperties,
  sigWrap: { display: "flex", justifyContent: "space-between", gap: 40, marginTop: 48 } as React.CSSProperties,
  sigBox: { flex: 1, borderTop: "1px solid #D1D5DB", paddingTop: 8, fontSize: 10, color: "#6B7280", textAlign: "center" as const } as React.CSSProperties,
  footer: { borderTop: "1px solid #E5E7EB", paddingTop: 6, marginTop: 20, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9CA3AF" } as React.CSSProperties,
};

const StatementPrintViewClean = ({
  company, contact, rows, openingBalance, closingBalance,
  totalDebit, totalCredit, dateFrom, dateTo, statementNumber, contactCode,
  showCompanyLogo = true, showContactInfo = true, showSignature = true,
  showReference = true, showDueDate = true, showType = true,
  showAging = true, agingData = null,
}: Props) => {
  // Build dynamic column set based on view options
  const columns = [
    { key: "date", label: "التاريخ", width: "11%" },
    ...(showReference ? [{ key: "reference", label: "المرجع", width: "13%" }] : []),
    { key: "description", label: "البيان", width: "auto" as const },
    ...(showDueDate ? [{ key: "due", label: "الاستحقاق", width: "9%" }] : []),
    ...(showType ? [{ key: "type", label: "النوع", width: "9%" }] : []),
    { key: "debit", label: "مدين (عليه)", width: "11%" },
    { key: "credit", label: "دائن (له)", width: "11%" },
    { key: "balance", label: "الرصيد", width: "12%" },
  ];
  const amountStartIdx = columns.findIndex(c => c.key === "debit");
  const balColor = (v: number) => v > 0 ? "#DC2626" : v < 0 ? "#059669" : "#6B7280";
  const soaNum = statementNumber || `SOA-0000`;

  return (
    <div style={S.page} dir="rtl">
      {/* ═══ HEADER (3 columns: company-details | logo | title) ═══ */}
      <div style={S.headerWrap}>
        {/* RIGHT (RTL first column): Company details */}
        <div style={{ textAlign: "right" }}>
          <p style={S.companyName}>{company.name || "AMWALI"}</p>
          {showContactInfo && (company.phone || company.email) && (
            <p style={S.companySub}>{[company.phone, company.email].filter(Boolean).join(" | ")}</p>
          )}
          {showContactInfo && company.address && (
            <p style={S.companySub}>{company.address}</p>
          )}
          {showContactInfo && company.tax_number && (
            <p style={S.companySub}>الرقم الضريبي: {company.tax_number}</p>
          )}
        </div>

        {/* CENTER: Logo only */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {showCompanyLogo && company.logo_url && (
            <img
              src={company.logo_url}
              alt={company.name || "Logo"}
              crossOrigin="anonymous"
              style={{ maxHeight: 45, maxWidth: 140, width: "auto", objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>

        {/* LEFT (RTL last column): Statement title */}
        <div style={S.titleBlock}>
          <p style={S.titleAr}>كشف حساب</p>
          <p style={S.titleEn}>STATEMENT OF ACCOUNT</p>
          <p style={S.soaNum}>{soaNum}</p>
        </div>
      </div>

      {/* ═══ INFO BLOCK ═══ */}
      <div style={S.infoGrid}>
        <div style={{ flex: 1 }}>
          <p style={S.infoLabel}>صادر إلى</p>
          <p style={S.infoName}>{contact.name}</p>
          <p style={S.infoType}>{contact.type}{contactCode ? ` — ${contactCode}` : ""}</p>
          {contact.phone && <p style={S.infoType}>{contact.phone}</p>}
        </div>
        <div style={{ flexShrink: 0 }}>
          <table style={S.metaTable}>
            <tbody>
              <tr><td style={S.metaLabel}>رقم الكشف:</td><td style={S.metaValue}>{soaNum}</td></tr>
              <tr><td style={S.metaLabel}>تاريخ الإصدار:</td><td style={S.metaValue}>{fmtToday()}</td></tr>
              <tr><td style={S.metaLabel}>الفترة من:</td><td style={S.metaValue}>{fmtDate(dateFrom)} — {fmtDate(dateTo)}</td></tr>
              <tr><td style={S.metaLabel}>العملة:</td><td style={S.metaValue}>شيكل إسرائيلي (₪)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SUMMARY BAR ═══ */}
      <div style={S.summaryBar}>
        <div style={S.summaryItem}>
          <div style={S.summaryLabel}>رصيد افتتاحي</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{fmt(openingBalance)}</div>
        </div>
        <div style={S.summaryDivider} />
        <div style={S.summaryItem}>
          <div style={S.summaryLabel}>إجمالي المدين</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1E40AF" }}>{fmt(totalDebit)}</div>
        </div>
        <div style={S.summaryDivider} />
        <div style={S.summaryItem}>
          <div style={S.summaryLabel}>إجمالي الدائن</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#065F46" }}>{fmt(totalCredit)}</div>
        </div>
        <div style={S.summaryDivider} />
        <div style={S.summaryItem}>
          <div style={S.summaryLabel}>الرصيد المستحق</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: balColor(closingBalance) }}>{fmt(closingBalance)}</div>
          <div style={{ fontSize: 9, color: "#9CA3AF" }}>
            {closingBalance > 0 ? "(مدين عليه)" : closingBalance < 0 ? "(دائن له)" : "مسدد ✓"}
          </div>
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <table style={S.table}>
        <colgroup>
          {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} style={{ ...S.th, textAlign: i >= amountStartIdx ? "left" : "right" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Opening balance */}
          <tr>
            {columns.map((c) => {
              if (c.key === "date") return <td key={c.key} style={{ ...S.td, fontStyle: "italic", color: "#9CA3AF" }}>{fmtDate(dateFrom)}</td>;
              if (c.key === "description") return <td key={c.key} style={{ ...S.td, fontStyle: "italic", color: "#9CA3AF" }}>رصيد أول المدة</td>;
              if (c.key === "debit") return <td key={c.key} style={{ ...S.td, ...S.tdAmount, color: "#1E40AF" }}>{openingBalance > 0 ? fmt(openingBalance) : "—"}</td>;
              if (c.key === "credit") return <td key={c.key} style={{ ...S.td, ...S.tdAmount, color: "#065F46" }}>{openingBalance < 0 ? fmt(openingBalance) : "—"}</td>;
              if (c.key === "balance") return <td key={c.key} style={{ ...S.td, ...S.tdAmount, fontWeight: 600, color: balColor(openingBalance) }}>{fmt(openingBalance)}</td>;
              if (c.key === "reference") return <td key={c.key} style={{ ...S.td, color: "#9CA3AF" }}>—</td>;
              return <td key={c.key} style={S.td} />;
            })}
          </tr>

          {/* Data rows */}
          {rows.map((r, i) => {
            // ─── Nested Invoice Items Table (Print) ───
            if (r.lineItemDetail === "invoice-table" && r.invoiceItems && r.invoiceItems.length > 0) {
              const items = r.invoiceItems;
              const isSingle = items.length === 1;
              const cardStyle: React.CSSProperties = {
                background: "#F8FAFC",
                borderRight: "3px solid #0D1B2E",
                borderRadius: 6,
                padding: "5px 9px 6px",
                margin: "2px 28px 5px 4px",
                pageBreakInside: "avoid",
              };
              const headerStyle: React.CSSProperties = {
                fontSize: 8.5,
                color: "#64748B",
                fontWeight: 600,
                marginBottom: 4,
                paddingBottom: 3,
                borderBottom: "1px dashed #E2E8F0",
              };
              const chipStyle: React.CSSProperties = {
                display: "inline-block",
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 4,
                padding: "1.5px 6px",
                fontSize: 8.5,
                marginLeft: 4,
                marginBottom: 2,
              };
              const chipLabel: React.CSSProperties = { color: "#94A3B8", fontWeight: 600, fontSize: 8 };
              const chipValue: React.CSSProperties = { color: "#1F2937", fontWeight: 600, marginRight: 3, direction: "ltr", display: "inline-block" };
              if (isSingle) {
                const it = items[0];
                return (
                  <tr key={r.transaction_id + "-" + i}>
                    <td colSpan={columns.length} style={{ padding: 0, border: "none" }}>
                      <div style={cardStyle}>
                        <div style={headerStyle}>
                          تفاصيل الفاتورة <span style={{ fontFamily: "monospace", color: "#0D1B2E" }}>{r.reference}</span> · 1 صنف
                        </div>
                        <div>
                          <span style={{ ...chipStyle, background: "#0D1B2E", borderColor: "#0D1B2E", color: "#fff", fontWeight: 700 }}>{it.productName || "—"}</span>
                          <span style={chipStyle}><span style={chipLabel}>الكمية:</span><span style={chipValue}>{it.quantity}{it.unit ? ` ${it.unit}` : ""}</span></span>
                          <span style={chipStyle}><span style={chipLabel}>السعر:</span><span style={chipValue}>{fmt(it.unitPrice)}</span></span>
                          <span style={{ ...chipStyle, ...(it.discount > 0 ? { background: "#FEF3C7", borderColor: "#FDE68A" } : {}) }}>
                            <span style={chipLabel}>الخصم:</span>
                            <span style={{ ...chipValue, color: it.discount > 0 ? "#B45309" : "#CBD5E1" }}>{it.discount > 0 ? it.discount : "—"}</span>
                          </span>
                          <span style={chipStyle}><span style={chipLabel}>الضريبة:</span><span style={{ ...chipValue, color: "#475569" }}>{it.tax > 0 ? `${it.tax}%` : "—"}</span></span>
                          <span style={{ ...chipStyle, background: "#ECFDF5", borderColor: "#A7F3D0" }}>
                            <span style={chipLabel}>الإجمالي:</span>
                            <span style={{ ...chipValue, color: "#065F46", fontWeight: 700 }}>{fmt(it.total)}</span>
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }
              const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
              return (
                <tr key={r.transaction_id + "-" + i}>
                  <td colSpan={columns.length} style={{ padding: 0, border: "none" }}>
                    <div style={cardStyle}>
                      <div style={headerStyle}>
                        تفاصيل الفاتورة <span style={{ fontFamily: "monospace", color: "#0D1B2E" }}>{r.reference}</span> · {items.length} أصناف
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 4 }}>
                        <thead>
                          <tr style={{ background: "#F1F5F9", borderBottom: "1px solid #E2E8F0" }}>
                            <th style={{ textAlign: "right", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5 }}>الصنف</th>
                            <th style={{ textAlign: "center", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5, width: 45 }}>كمية</th>
                            <th style={{ textAlign: "left", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5, width: 60 }}>سعر</th>
                            <th style={{ textAlign: "left", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5, width: 45 }}>خصم</th>
                            <th style={{ textAlign: "left", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5, width: 40 }}>ضريبة</th>
                            <th style={{ textAlign: "left", padding: "2px 6px 3px", fontWeight: 600, color: "#94A3B8", fontSize: 8.5, width: 70 }}>إجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === items.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                              <td style={{ padding: "2px 6px", color: "#1F2937", fontSize: 9 }}>{it.productName || "—"}</td>
                              <td style={{ padding: "2px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>
                                {it.quantity}{it.unit ? <span style={{ color: "#94A3B8", fontSize: 8, marginRight: 2 }}>{it.unit}</span> : null}
                              </td>
                              <td style={{ padding: "2px 6px", textAlign: "left", direction: "ltr", color: "#475569", fontSize: 9 }}>{fmt(it.unitPrice)}</td>
                              <td style={{ padding: "2px 6px", textAlign: "left", direction: "ltr", color: it.discount > 0 ? "#B45309" : "#CBD5E1", fontSize: 9 }}>{it.discount > 0 ? `${it.discount}` : "—"}</td>
                              <td style={{ padding: "2px 6px", textAlign: "left", direction: "ltr", color: "#64748B", fontSize: 9 }}>{it.tax > 0 ? `${it.tax}%` : "—"}</td>
                              <td style={{ padding: "2px 6px", textAlign: "left", direction: "ltr", color: "#065F46", fontWeight: 600, fontSize: 9 }}>{fmt(it.total)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: "#ECFDF5" }}>
                            <td colSpan={5} style={{ padding: "3px 6px", textAlign: "left", fontSize: 8.5, color: "#475569", fontWeight: 600 }}>الإجمالي</td>
                            <td style={{ padding: "3px 6px", textAlign: "left", direction: "ltr", color: "#065F46", fontWeight: 700, fontSize: 9.5 }}>{fmt(subtotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              );
            }
            // ─── Nested Voucher Detail Table (Print) ───
            if (r.lineItemDetail === "voucher-table" && r.voucherDetail) {
              const d = r.voucherDetail;
              const isCheque = d.paymentMethod === "cheque" || d.paymentMethod === "check" || !!d.chequeNumber;
              const accountValue = isCheque ? (d.bank || "—") : (d.cashBox || d.bank || "—");
              const accountLabel = isCheque ? "البنك" : (d.cashBox ? "صندوق" : (d.bank ? "البنك" : null));
              const railStyle: React.CSSProperties = {
                borderRight: "2px solid #CBD5E1",
                background: "#F8FAFC",
                marginRight: 28,
                padding: "4px 10px 5px",
                pageBreakInside: "avoid",
              };
              return (
                <tr key={r.transaction_id + "-" + i}>
                  <td colSpan={columns.length} style={{ padding: "0 0 5px", border: "none" }}>
                    <div style={railStyle}>
                      <span style={{ fontSize: 8.5, color: "#94A3B8", fontWeight: 600, marginLeft: 6 }}>تفاصيل {r.reference}:</span>
                      <span style={{ fontSize: 9.5, color: "#1F2937", fontWeight: 600 }}>{paymentMethodLabel(d.paymentMethod)}</span>
                      {accountLabel && accountValue !== "—" && (
                        <span style={{ fontSize: 9, color: "#6B7280" }}> · {accountLabel}: {accountValue}</span>
                      )}
                      {isCheque && d.chequeNumber && (
                        <>
                          <span style={{ fontSize: 9, color: "#6B7280" }}> · شيك </span>
                          <span style={{ fontSize: 9, color: "#1F2937", fontWeight: 600, fontFamily: "monospace" }}>{d.chequeNumber}</span>
                          {d.chequeDate && <span style={{ fontSize: 9, color: "#6B7280" }}> · استحقاق {fmtDate(d.chequeDate)}</span>}
                          {d.chequeStatus && (
                            <span style={{ fontSize: 8.5, color: "#92400E", background: "#FEF3C7", padding: "1px 5px", borderRadius: 3, marginRight: 4 }}>
                              {CHEQUE_STATUS_LABELS[d.chequeStatus] || d.chequeStatus}
                            </span>
                          )}
                        </>
                      )}
                      {d.notes && (
                        <div style={{ fontSize: 8.5, color: "#64748B", marginTop: 2, lineHeight: 1.35 }}>
                          <span style={{ color: "#94A3B8", fontWeight: 600 }}>ملاحظات: </span>{d.notes}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }
            return (
            <tr key={r.transaction_id + "-" + i} style={r.isLineItem ? { background: "#F9FAFB" } : undefined}>
              {columns.map((c) => {
                if (r.isLineItem) {
                  // Sub-row (invoice item / voucher detail): only date + description, hide amounts.
                  if (c.key === "description") return <td key={c.key} style={{ ...S.td, lineHeight: 1.4, fontSize: 9.5, color: "#4B5563", paddingRight: 18 }}>{r.description}</td>;
                  if (c.key === "date") return <td key={c.key} style={{ ...S.td, color: "#9CA3AF", fontSize: 9 }}>—</td>;
                  if (c.key === "balance") return <td key={c.key} style={{ ...S.td, ...S.tdAmount, color: "#9CA3AF" }}>—</td>;
                  return <td key={c.key} style={{ ...S.td, color: "#9CA3AF" }}>—</td>;
                }
                switch (c.key) {
                  case "date": return <td key={c.key} style={S.td}>{fmtDate(r.date)}</td>;
                  case "reference": return <td key={c.key} style={{ ...S.td, fontSize: 9, wordBreak: "break-all", whiteSpace: "normal", lineHeight: 1.3 }}>{r.reference || "—"}</td>;
                  case "description": return <td key={c.key} style={{ ...S.td, lineHeight: 1.4 }}>{r.description}</td>;
                  case "due": return <td key={c.key} style={{ ...S.td, fontSize: 9.5, color: "#6B7280" }}>{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>;
                  case "type": return <td key={c.key} style={{ ...S.td, fontSize: 9.5, color: "#6B7280" }}>{getTypeLabel(r.transaction_type)}</td>;
                  case "debit": return <td key={c.key} style={{ ...S.td, ...S.tdAmount, color: "#1E40AF" }}>{r.debit > 0 ? fmt(r.debit) : "—"}</td>;
                  case "credit": return <td key={c.key} style={{ ...S.td, ...S.tdAmount, color: "#065F46" }}>{r.credit > 0 ? fmt(r.credit) : "—"}</td>;
                  case "balance": return <td key={c.key} style={{ ...S.td, ...S.tdAmount, fontWeight: 600, color: balColor(r.balance) }}>{fmt(r.balance)}</td>;
                  default: return <td key={c.key} style={S.td} />;
                }
              })}
            </tr>
            );
          })}

          {/* Totals row */}
          <tr style={S.totalsRow}>
            {columns.map((c) => {
              const baseStyle = { ...S.td, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" } as React.CSSProperties;
              if (c.key === "description") return <td key={c.key} style={{ ...baseStyle, fontWeight: 700, fontSize: 11 }}>رصيد ختامي</td>;
              if (c.key === "debit") return <td key={c.key} style={{ ...baseStyle, ...S.tdAmount, fontWeight: 700, fontSize: 11, color: "#1E40AF" }}>{fmt(totalDebit)}</td>;
              if (c.key === "credit") return <td key={c.key} style={{ ...baseStyle, ...S.tdAmount, fontWeight: 700, fontSize: 11, color: "#065F46" }}>{fmt(totalCredit)}</td>;
              if (c.key === "balance") return <td key={c.key} style={{ ...baseStyle, ...S.tdAmount, fontWeight: 700, fontSize: 12, color: balColor(closingBalance) }}>{fmt(closingBalance)}</td>;
              if (c.key === "date") return <td key={c.key} style={{ ...baseStyle, fontWeight: 700, fontSize: 11 }}>—</td>;
              if (c.key === "reference") return <td key={c.key} style={baseStyle}>—</td>;
              return <td key={c.key} style={baseStyle} />;
            })}
          </tr>
        </tbody>
      </table>

      {/* ═══ OUTSTANDING ALERT ═══ */}
      {closingBalance > 0 && (
        <div style={S.alert}>
          رصيد مستحق: {fmt(closingBalance)} — يرجى التواصل لترتيب السداد
        </div>
      )}

      {/* ═══ STATS LINE ═══ */}
      <div style={S.statsLine}>
        إجمالي الحركات: {rows.filter(r => !r.isLineItem).length} قيود | مدين: {fmt(totalDebit)} | دائن: {fmt(totalCredit)} | الرصيد: {fmt(closingBalance)} ({closingBalance > 0 ? "مدين" : closingBalance < 0 ? "دائن" : "مسدد"})
      </div>

      {/* ═══ AGING ANALYSIS ═══ */}
      {showAging && agingData && (
        <div style={{ marginTop: 16, border: "1px solid #E5E7EB", borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 8 }}>تحليل التقادم (Aging)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, textAlign: "center" }}>
            {[
              { label: "جاري", value: agingData.current, color: "#059669" },
              { label: "1-30 يوم", value: agingData.d1_30, color: "#D97706" },
              { label: "31-60 يوم", value: agingData.d31_60, color: "#EA580C" },
              { label: "+60 يوم", value: agingData.d60plus, color: "#DC2626" },
              { label: "الإجمالي", value: agingData.total, color: "#111827" },
            ].map(a => (
              <div key={a.label}>
                <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>{a.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{fmt(a.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SIGNATURES ═══ */}
      {showSignature && (
        <div style={S.sigWrap}>
          <div style={S.sigBox}>ختم الشركة وتوقيع المحاسب</div>
          <div style={S.sigBox}>اعتماد العميل</div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div style={S.footer}>
        <span>طُبع بتاريخ: {fmtToday()}</span>
        <span style={{ color: "#374151", fontWeight: 500 }}>{company.name || "AMWALI"}</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default StatementPrintViewClean;
