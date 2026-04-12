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

const S = {
  page: { direction: "rtl" as const, fontFamily: "'Cairo', Arial, sans-serif", fontSize: 11, color: "#111827", background: "white", padding: "40px 48px", maxWidth: 780 },
  headerWrap: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "2px solid #111827" } as React.CSSProperties,
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

const COL_WIDTHS = ["11%", "13%", "24%", "9%", "9%", "11%", "11%", "12%"];
const COL_HEADERS = ["التاريخ", "المرجع", "البيان", "الاستحقاق", "النوع", "مدين (عليه)", "دائن (له)", "الرصيد"];

const StatementPrintViewClean = ({
  company, contact, rows, openingBalance, closingBalance,
  totalDebit, totalCredit, dateFrom, dateTo, statementNumber, contactCode,
}: Props) => {
  const balColor = (v: number) => v > 0 ? "#DC2626" : v < 0 ? "#059669" : "#6B7280";
  const soaNum = statementNumber || `SOA-0000`;

  return (
    <div style={S.page} dir="rtl">
      {/* ═══ HEADER ═══ */}
      <div style={S.headerWrap}>
        <div>
          <p style={S.companyName}>{company.name || "AMWALI"}</p>
          {company.phone && <p style={S.companySub}>{[company.phone, company.email].filter(Boolean).join(" | ")}</p>}
          {company.tax_number && <p style={S.companySub}>الرقم الضريبي: {company.tax_number}</p>}
        </div>
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
          {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {COL_HEADERS.map((h, i) => (
              <th key={i} style={{ ...S.th, textAlign: i >= 5 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Opening balance */}
          <tr>
            <td style={{ ...S.td, fontStyle: "italic", color: "#9CA3AF" }}>{fmtDate(dateFrom)}</td>
            <td style={{ ...S.td, color: "#9CA3AF" }}>—</td>
            <td style={{ ...S.td, fontStyle: "italic", color: "#9CA3AF" }}>رصيد أول المدة</td>
            <td style={S.td} />
            <td style={S.td} />
            <td style={{ ...S.td, ...S.tdAmount, color: "#1E40AF" }}>{openingBalance > 0 ? fmt(openingBalance) : "—"}</td>
            <td style={{ ...S.td, ...S.tdAmount, color: "#065F46" }}>{openingBalance < 0 ? fmt(openingBalance) : "—"}</td>
            <td style={{ ...S.td, ...S.tdAmount, fontWeight: 600, color: balColor(openingBalance) }}>{fmt(openingBalance)}</td>
          </tr>

          {/* Data rows */}
          {rows.map((r, i) => (
            <tr key={r.transaction_id + "-" + i}>
              <td style={S.td}>{fmtDate(r.date)}</td>
              <td style={{ ...S.td, fontSize: 9, wordBreak: "break-all", whiteSpace: "normal", lineHeight: 1.3 }}>{r.reference || "—"}</td>
              <td style={{ ...S.td, lineHeight: 1.4 }}>{r.description}</td>
              <td style={{ ...S.td, fontSize: 9.5, color: "#6B7280" }}>{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
              <td style={{ ...S.td, fontSize: 9.5, color: "#6B7280" }}>{getTypeLabel(r.transaction_type)}</td>
              <td style={{ ...S.td, ...S.tdAmount, color: "#1E40AF" }}>{r.debit > 0 ? fmt(r.debit) : "—"}</td>
              <td style={{ ...S.td, ...S.tdAmount, color: "#065F46" }}>{r.credit > 0 ? fmt(r.credit) : "—"}</td>
              <td style={{ ...S.td, ...S.tdAmount, fontWeight: 600, color: balColor(r.balance) }}>{fmt(r.balance)}</td>
            </tr>
          ))}

          {/* Totals row */}
          <tr style={S.totalsRow}>
            <td style={{ ...S.td, fontWeight: 700, fontSize: 11, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>—</td>
            <td style={{ ...S.td, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>—</td>
            <td style={{ ...S.td, fontWeight: 700, fontSize: 11, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>رصيد ختامي</td>
            <td style={{ ...S.td, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }} />
            <td style={{ ...S.td, borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }} />
            <td style={{ ...S.td, ...S.tdAmount, fontWeight: 700, fontSize: 11, color: "#1E40AF", borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>{fmt(totalDebit)}</td>
            <td style={{ ...S.td, ...S.tdAmount, fontWeight: 700, fontSize: 11, color: "#065F46", borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>{fmt(totalCredit)}</td>
            <td style={{ ...S.td, ...S.tdAmount, fontWeight: 700, fontSize: 12, color: balColor(closingBalance), borderTop: "1px solid #111827", borderBottom: "1px solid #111827" }}>{fmt(closingBalance)}</td>
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
        إجمالي الحركات: {rows.length} قيود | مدين: {fmt(totalDebit)} | دائن: {fmt(totalCredit)} | الرصيد: {fmt(closingBalance)} ({closingBalance > 0 ? "مدين" : closingBalance < 0 ? "دائن" : "مسدد"})
      </div>

      {/* ═══ SIGNATURES ═══ */}
      <div style={S.sigWrap}>
        <div style={S.sigBox}>ختم الشركة وتوقيع المحاسب</div>
        <div style={S.sigBox}>اعتماد العميل</div>
      </div>

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
