import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
}

interface CompanyInfo {
  name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_number: string;
}

interface ContactInfo {
  name: string;
  type: string;
  phone: string;
  address: string;
  email?: string;
  contactClass?: string;
  paymentTermsDays?: number;
}

interface StatementPrintViewProps {
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
}

const fmtAmount = (n: number) =>
  `₪${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) => {
  if (!d) return "—";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

const fmtDateSlash = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const StatementPrintView = ({
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
}: StatementPrintViewProps) => {
  const isDebit = closingBalance >= 0;
  const today = new Date();
  const soaNumber = statementNumber || `SOA-${today.getFullYear()}-${String(rows.length + 1).padStart(4, "0")}`;

  const dueDateStr = useMemo(() => {
    const due = new Date();
    due.setDate(due.getDate() + (contact.paymentTermsDays || 30));
    return fmtDateSlash(due);
  }, [contact.paymentTermsDays]);

  return (
    <div
      className="statement-print-page bg-white text-black"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        padding: "0",
        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
        direction: "rtl",
        fontSize: "11px",
        lineHeight: 1.5,
        position: "relative",
      }}
    >
      {/* ━━━ HEADER BAR ━━━ */}
      <div
        style={{
          background: "linear-gradient(135deg, #1B3A5C 0%, #0F2640 100%)",
          color: "white",
          padding: "16px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt="Logo"
              style={{ width: "52px", height: "52px", borderRadius: "8px", objectFit: "contain", background: "white", padding: "3px" }}
            />
          ) : (
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: 800,
                color: "#C9A84C",
              }}
            >
              {company.name?.charAt(0) || "C"}
            </div>
          )}
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.3px" }}>{company.name}</div>
            <div style={{ fontSize: "10px", opacity: 0.85, marginTop: "2px" }}>
              {company.address && <span>{company.address}</span>}
              {company.phone && <span style={{ marginRight: "12px" }}>📞 {company.phone}</span>}
            </div>
            <div style={{ fontSize: "10px", opacity: 0.75, marginTop: "1px" }}>
              {company.email && <span>✉️ {company.email}</span>}
              {company.tax_number && <span style={{ marginRight: "12px" }}>رقم ضريبي: {company.tax_number}</span>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>كشف حساب</div>
          <div style={{ fontSize: "10px", opacity: 0.8, fontFamily: "'Segoe UI', sans-serif" }}>STATEMENT OF ACCOUNT</div>
        </div>
      </div>

      {/* ━━━ GOLD ACCENT LINE ━━━ */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #C9A84C, #E8D48B, #C9A84C)" }} />

      {/* ━━━ INFO SECTION ━━━ */}
      <div style={{ padding: "14px 28px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
        <div>
          <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            صادر إلى
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B3A5C" }}>{contact.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <span
              style={{
                fontSize: "9px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: contact.type === "عميل" ? "#EBF5FF" : "#FEF3E2",
                color: contact.type === "عميل" ? "#1B3A5C" : "#92400E",
                fontWeight: 600,
              }}
            >
              {contact.type}
            </span>
            {contact.contactClass && (
              <span
                style={{
                  fontSize: "9px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "#F3F4F6",
                  color: "#374151",
                  fontWeight: 600,
                }}
              >
                فئة: {contact.contactClass}
              </span>
            )}
          </div>
          {contact.phone && <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "4px" }}>📞 {contact.phone}</div>}
          {contact.address && <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "2px" }}>📍 {contact.address}</div>}
        </div>

        <div style={{ textAlign: "left", fontSize: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>رقم الكشف:</span>
            <span style={{ fontWeight: 700, color: "#1B3A5C", fontFamily: "monospace" }}>{soaNumber}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>تاريخ الإصدار:</span>
            <span style={{ fontWeight: 600 }}>{fmtDateSlash(today)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>من:</span>
            <span style={{ fontWeight: 600 }}>{fmtDate(dateFrom)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>إلى:</span>
            <span style={{ fontWeight: 600 }}>{fmtDate(dateTo)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
            <span style={{ color: "#6B7280" }}>العملة:</span>
            <span style={{ fontWeight: 600 }}>شيكل إسرائيلي (₪ ILS)</span>
          </div>
        </div>
      </div>

      {/* ━━━ SUMMARY CARDS ━━━ */}
      <div style={{ padding: "12px 28px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
        {[
          { label: "رصيد افتتاحي", value: openingBalance, bg: "#F8FAFC", border: "#E2E8F0", color: "#334155" },
          { label: "إجمالي المدين", value: totalDebit, bg: "#FEF2F2", border: "#FECACA", color: "#DC2626" },
          { label: "إجمالي الدائن", value: totalCredit, bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A" },
          { label: "الرصيد المستحق", value: Math.abs(closingBalance), bg: isDebit ? "#FEF2F2" : "#F0FDF4", border: isDebit ? "#FECACA" : "#BBF7D0", color: isDebit ? "#DC2626" : "#16A34A", suffix: isDebit ? "مدين" : "دائن" },
        ].map((card, i) => (
          <div
            key={i}
            style={{
              background: card.bg,
              border: `1px solid ${card.border}`,
              borderRadius: "8px",
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>{card.label}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: card.color, fontFeatureSettings: "'tnum'" }}>
              {fmtAmount(card.value)}
            </div>
            {(card as any).suffix && (
              <div style={{ fontSize: "9px", color: card.color, marginTop: "2px", fontWeight: 600 }}>({(card as any).suffix})</div>
            )}
          </div>
        ))}
      </div>

      {/* ━━━ TABLE ━━━ */}
      <div style={{ padding: "0 28px 8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ background: "#1B3A5C", color: "white" }}>
              {["التاريخ", "المرجع", "البيان", "النوع", "مدين ₪", "دائن ₪", "الرصيد ₪"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "8px 8px",
                    textAlign: i >= 4 ? "left" : "right",
                    fontWeight: 700,
                    fontSize: "10px",
                    borderBottom: "2px solid #C9A84C",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Opening balance */}
            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" }}>
              <td style={{ padding: "6px 8px", color: "#6B7280" }}>{fmtDate(dateFrom)}</td>
              <td style={{ padding: "6px 8px", color: "#9CA3AF" }}>—</td>
              <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1B3A5C" }}>رصيد أول المدة</td>
              <td style={{ padding: "6px 8px" }}></td>
              <td style={{ padding: "6px 8px", textAlign: "left", color: "#9CA3AF" }}>—</td>
              <td style={{ padding: "6px 8px", textAlign: "left", color: "#9CA3AF" }}>—</td>
              <td style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: openingBalance >= 0 ? "#DC2626" : "#16A34A", fontFeatureSettings: "'tnum'" }}>
                {fmtAmount(openingBalance)}
              </td>
            </tr>

            {/* Rows */}
            {rows.map((row, i) => (
              <tr
                key={row.transaction_id}
                style={{
                  background: i % 2 === 0 ? "white" : "#FAFBFC",
                  borderBottom: "1px solid #F3F4F6",
                }}
              >
                <td style={{ padding: "6px 8px", fontFeatureSettings: "'tnum'", color: "#374151" }}>{fmtDate(row.date)}</td>
                <td style={{ padding: "6px 8px" }}>
                  {row.reference ? (
                    <span style={{ color: "#1B3A5C", fontWeight: 600, fontFamily: "monospace", fontSize: "9px" }}>{row.reference}</span>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "6px 8px", color: "#111827" }}>{row.description}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: "8px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: row.debit > 0 ? "#FEF2F2" : "#F0FDF4",
                      color: row.debit > 0 ? "#DC2626" : "#16A34A",
                      border: `1px solid ${row.debit > 0 ? "#FECACA" : "#BBF7D0"}`,
                    }}
                  >
                    {row.debit > 0 ? "مدين" : "دائن"}
                  </span>
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "left",
                    fontWeight: row.debit > 0 ? 700 : 400,
                    color: row.debit > 0 ? "#DC2626" : "#9CA3AF",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {row.debit > 0 ? fmtAmount(row.debit) : "—"}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "left",
                    fontWeight: row.credit > 0 ? 700 : 400,
                    color: row.credit > 0 ? "#16A34A" : "#9CA3AF",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {row.credit > 0 ? fmtAmount(row.credit) : "—"}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "left",
                    fontWeight: 700,
                    color: row.balance >= 0 ? "#DC2626" : "#16A34A",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtAmount(row.balance)}
                  <span style={{ fontSize: "8px", marginRight: "3px", opacity: 0.7 }}>
                    {row.balance >= 0 ? "م" : "د"}
                  </span>
                </td>
              </tr>
            ))}

            {/* Closing balance */}
            <tr style={{ background: "#1B3A5C", color: "white", fontWeight: 700 }}>
              <td style={{ padding: "8px" }}>—</td>
              <td style={{ padding: "8px" }}>—</td>
              <td style={{ padding: "8px", fontWeight: 700 }}>رصيد ختامي</td>
              <td style={{ padding: "8px" }}></td>
              <td style={{ padding: "8px", textAlign: "left", fontFeatureSettings: "'tnum'" }}>{fmtAmount(totalDebit)}</td>
              <td style={{ padding: "8px", textAlign: "left", fontFeatureSettings: "'tnum'" }}>{fmtAmount(totalCredit)}</td>
              <td style={{ padding: "8px", textAlign: "left", fontFeatureSettings: "'tnum'" }}>
                <span style={{ color: "#C9A84C", fontWeight: 800, fontSize: "12px" }}>
                  {fmtAmount(closingBalance)}
                </span>
                <span style={{ fontSize: "9px", marginRight: "4px", color: "#C9A84C" }}>
                  {isDebit ? "مدين" : "دائن"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ━━━ OVERDUE ALERT ━━━ */}
      {closingBalance > 0 && (
        <div
          style={{
            margin: "0 28px 12px",
            padding: "10px 16px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "18px" }}>⚠️</span>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#991B1B" }}>
              يوجد رصيد مستحق بقيمة <span style={{ color: "#DC2626" }}>{fmtAmount(closingBalance)}</span>
            </div>
            <div style={{ fontSize: "9px", color: "#7F1D1D", marginTop: "2px" }}>
              تاريخ الاستحقاق المتوقع: <strong>{dueDateStr}</strong> | يرجى التواصل لترتيب السداد
            </div>
          </div>
        </div>
      )}

      {/* ━━━ FOOTER - CONTACT & SIGNATURE ━━━ */}
      <div
        style={{
          margin: "0 28px",
          padding: "14px 0",
          borderTop: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {/* Contact info */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "6px" }}>للمطابقة والاستفسار:</div>
          <div style={{ fontSize: "10px", color: "#4B5563", lineHeight: 1.8 }}>
            {company.phone && <div>📞 {company.phone}</div>}
            {company.email && <div>✉️ {company.email}</div>}
            {company.website && <div>🌐 {company.website}</div>}
            {company.address && <div>📍 {company.address}</div>}
          </div>
          <div style={{ fontSize: "8px", color: "#9CA3AF", marginTop: "4px", fontStyle: "italic" }}>
            يرجى الإشارة إلى رقم الكشف عند التواصل
          </div>
        </div>

        {/* Signature */}
        <div style={{ textAlign: "center", minWidth: "180px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>
            ختم الشركة وتوقيع المحاسب:
          </div>
          <div
            style={{
              width: "160px",
              height: "60px",
              border: "1px dashed #D1D5DB",
              borderRadius: "6px",
              margin: "0 auto 6px",
            }}
          />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>اسم المحاسب وتوقيعه</div>
        </div>
      </div>

      {/* ━━━ BOTTOM BAR ━━━ */}
      <div
        style={{
          background: "#1B3A5C",
          color: "rgba(255,255,255,0.7)",
          padding: "8px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "9px",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <span>طُبع بتاريخ: {fmtDateSlash(today)}</span>
        <span style={{ color: "#C9A84C", fontWeight: 600 }}>نظام عبدالله AI للمحاسبة</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default StatementPrintView;
