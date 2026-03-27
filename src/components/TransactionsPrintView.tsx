import { useMemo } from "react";

interface PrintTransaction {
  id: string;
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  debit_account_name: string;
  credit_account_name: string;
  transaction_type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  reference: string | null;
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

interface TransactionsPrintViewProps {
  company: CompanyInfo;
  transactions: PrintTransaction[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  filterLabel: string;
  dateRange?: string;
}

const typeLabels: Record<string, string> = {
  pos_sale: "مبيعات POS",
  pos_cogs: "تكلفة مبيعات",
  sale_cash: "بيع نقدي",
  sale_credit: "بيع آجل",
  sale_bank: "بيع بنكي",
  sale_cheque: "بيع شيك",
  purchase_cash: "شراء نقدي",
  purchase_credit: "شراء آجل",
  purchase_bank: "شراء بنكي",
  purchase_cheque: "شراء شيك",
  receipt: "سند قبض",
  payment: "سند صرف",
  salary: "رواتب",
  exchange_diff: "فروق عملة",
  opening_balance: "رصيد افتتاحي",
  manual: "قيد يدوي",
  cheque_collection: "تحصيل شيك",
  journal: "قيد يومية",
};

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

const TransactionsPrintView = ({
  company,
  transactions,
  totalDebit,
  totalCredit,
  isBalanced,
  filterLabel,
  dateRange,
}: TransactionsPrintViewProps) => {
  const today = new Date();
  const reportNumber = `JE-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // Count by type
  const typeSummary = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      const label = typeLabels[tx.transaction_type] || tx.transaction_type || "أخرى";
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [transactions]);

  return (
    <div
      id="transactions-print-wrapper"
      className="transactions-print-page bg-white text-black print-only"
      style={{
        width: "100%",
        maxWidth: "794px",
        margin: "0 auto",
        padding: "0",
        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
        direction: "rtl",
        fontSize: "11px",
        lineHeight: 1.4,
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* ━━━ HEADER BAR ━━━ */}
      <div
        style={{
          background: "linear-gradient(135deg, #1B3A5C 0%, #0F2640 100%)",
          color: "white",
          padding: "12px 28px",
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
                color: "#4A9EE8",
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
          <div style={{ fontSize: "18px", fontWeight: 700 }}>تقرير الحركات المحاسبية</div>
          <div style={{ fontSize: "10px", opacity: 0.8, fontFamily: "'Segoe UI', sans-serif" }}>JOURNAL ENTRIES REPORT</div>
        </div>
      </div>

      {/* ━━━ GOLD ACCENT LINE ━━━ */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #4A9EE8, #E8D48B, #4A9EE8)" }} />

      {/* ━━━ INFO SECTION ━━━ */}
      <div style={{ padding: "10px 28px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
        <div>
          <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            تفاصيل التقرير
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1B3A5C" }}>دفتر اليومية العام</div>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
            {filterLabel && (
              <span style={{ fontSize: "9px", padding: "2px 8px", borderRadius: "4px", background: "#EBF5FF", color: "#1B3A5C", fontWeight: 600 }}>
                {filterLabel}
              </span>
            )}
            <span style={{ fontSize: "9px", padding: "2px 8px", borderRadius: "4px", background: "#F3F4F6", color: "#374151", fontWeight: 600 }}>
              {transactions.length} قيد
            </span>
          </div>
        </div>

        <div style={{ textAlign: "left", fontSize: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>رقم التقرير:</span>
            <span style={{ fontWeight: 700, color: "#1B3A5C", fontFamily: "monospace" }}>{reportNumber}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>تاريخ الإصدار:</span>
            <span style={{ fontWeight: 600 }}>{fmtDateSlash(today)}</span>
          </div>
          {dateRange && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>الفترة:</span>
              <span style={{ fontWeight: 600 }}>{dateRange}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
            <span style={{ color: "#6B7280" }}>العملة:</span>
            <span style={{ fontWeight: 600 }}>شيكل إسرائيلي (₪ ILS)</span>
          </div>
        </div>
      </div>

      {/* ━━━ SUMMARY CARDS ━━━ */}
      <div style={{ padding: "8px 28px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
        {[
          { label: "عدد القيود", value: transactions.length, isCount: true, bg: "#F8FAFC", border: "#E2E8F0", color: "#334155" },
          { label: "إجمالي المدين", value: totalDebit, bg: "#EFF6FF", border: "#BFDBFE", color: "#1E40AF" },
          { label: "إجمالي الدائن", value: totalCredit, bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A" },
          { label: "حالة التوازن", value: Math.abs(totalDebit - totalCredit), bg: isBalanced ? "#F0FDF4" : "#FEF2F2", border: isBalanced ? "#BBF7D0" : "#FECACA", color: isBalanced ? "#16A34A" : "#DC2626", suffix: isBalanced ? "✅ متطابق" : "⚠️ غير متطابق" },
        ].map((card, i) => (
          <div
            key={i}
            style={{
              background: card.bg,
              border: `1px solid ${card.border}`,
              borderRadius: "8px",
              padding: "6px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>{card.label}</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: card.color, fontFeatureSettings: "'tnum'" }}>
              {(card as any).isCount ? card.value : fmtAmount(card.value as number)}
            </div>
            {(card as any).suffix && (
              <div style={{ fontSize: "9px", color: card.color, marginTop: "2px", fontWeight: 600 }}>{(card as any).suffix}</div>
            )}
          </div>
        ))}
      </div>

      {/* ━━━ TABLE ━━━ */}
      <div style={{ padding: "0 28px 4px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "5%" }} />  {/* # */}
            <col style={{ width: "10%" }} /> {/* التاريخ */}
            <col style={{ width: "11%" }} /> {/* المرجع */}
            <col style={{ width: "24%" }} /> {/* الوصف */}
            <col style={{ width: "10%" }} /> {/* النوع */}
            <col style={{ width: "14%" }} /> {/* الحساب المدين */}
            <col style={{ width: "14%" }} /> {/* الحساب الدائن */}
            <col style={{ width: "6%" }} />  {/* مدين */}
            <col style={{ width: "6%" }} />  {/* دائن */}
          </colgroup>
          <thead>
            <tr style={{ background: "#1B3A5C", color: "white" }}>
              {["#", "التاريخ", "المرجع", "البيان", "النوع", "حساب مدين", "حساب دائن", "مدين ₪", "دائن ₪"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "5px 3px",
                    textAlign: i >= 7 ? "left" : "right",
                    fontWeight: 700,
                    fontSize: "8px",
                    borderBottom: "2px solid #4A9EE8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => (
              <tr
                key={tx.id}
                style={{
                  background: i % 2 === 0 ? "white" : "#FAFBFC",
                  borderBottom: "1px solid #F3F4F6",
                }}
              >
                <td style={{ padding: "3px 3px", color: "#9CA3AF", textAlign: "center", fontSize: "8px" }}>{i + 1}</td>
                <td style={{ padding: "3px 3px", fontFeatureSettings: "'tnum'", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtDate(tx.transaction_date)}
                </td>
                <td style={{ padding: "3px 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.reference ? (
                    <span style={{ color: "#1B3A5C", fontWeight: 600, fontFamily: "monospace", fontSize: "7px" }}>{tx.reference}</span>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "3px 3px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.description || "—"}
                </td>
                <td style={{ padding: "3px 2px", textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: "7px",
                      fontWeight: 600,
                      padding: "1px 3px",
                      borderRadius: "3px",
                      background: "#F3F4F6",
                      color: "#374151",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {typeLabels[tx.transaction_type] || tx.transaction_type || "—"}
                  </span>
                </td>
                <td style={{ padding: "3px 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "8px" }}>
                  <span style={{ fontFamily: "monospace", color: "#637381" }}>{tx.debit_account_code}</span>
                  <span style={{ color: "#374151", marginRight: "2px" }}> {tx.debit_account_name}</span>
                </td>
                <td style={{ padding: "3px 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "8px" }}>
                  <span style={{ fontFamily: "monospace", color: "#637381" }}>{tx.credit_account_code}</span>
                  <span style={{ color: "#374151", marginRight: "2px" }}> {tx.credit_account_name}</span>
                </td>
                <td style={{ padding: "3px 3px", textAlign: "left", fontWeight: 700, color: "#1E40AF", fontFeatureSettings: "'tnum'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtAmount(tx.amount)}
                </td>
                <td style={{ padding: "3px 3px", textAlign: "left", fontWeight: 700, color: "#16A34A", fontFeatureSettings: "'tnum'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtAmount(tx.amount)}
                </td>
              </tr>
            ))}

            {/* ━━ Totals Row ━━ */}
            <tr style={{ background: "#1B3A5C", color: "white", fontWeight: 700 }}>
              <td colSpan={7} style={{ padding: "5px 4px", fontWeight: 700, fontSize: "10px" }}>
                الإجمالي — {transactions.length} قيد
                {isBalanced && (
                  <span style={{ marginRight: "8px", color: "#BBF7D0", fontSize: "9px" }}>✅ متطابق</span>
                )}
                {!isBalanced && (
                  <span style={{ marginRight: "8px", color: "#FCA5A5", fontSize: "9px" }}>⚠️ فرق: {fmtAmount(Math.abs(totalDebit - totalCredit))}</span>
                )}
              </td>
              <td style={{ padding: "5px 3px", textAlign: "left", fontFeatureSettings: "'tnum'", fontSize: "10px" }}>
                <span style={{ color: "#93C5FD" }}>{fmtAmount(totalDebit)}</span>
              </td>
              <td style={{ padding: "5px 3px", textAlign: "left", fontFeatureSettings: "'tnum'", fontSize: "10px" }}>
                <span style={{ color: "#BBF7D0" }}>{fmtAmount(totalCredit)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ━━━ TYPE SUMMARY ━━━ */}
      {typeSummary.length > 0 && (
        <div style={{ padding: "8px 28px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "6px" }}>ملخص حسب النوع:</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {typeSummary.map(([label, count]) => (
              <span
                key={label}
                style={{
                  fontSize: "8px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "#F3F4F6",
                  color: "#374151",
                  fontWeight: 600,
                  border: "1px solid #E5E7EB",
                }}
              >
                {label}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ━━━ FOOTER - SIGNATURE ━━━ */}
      <div
        style={{
          margin: "0 28px",
          padding: "8px 0",
          borderTop: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "6px" }}>للمطابقة والاستفسار:</div>
          <div style={{ fontSize: "10px", color: "#4B5563", lineHeight: 1.8 }}>
            {company.phone && <div>📞 {company.phone}</div>}
            {company.email && <div>✉️ {company.email}</div>}
            {company.website && <div>🌐 {company.website}</div>}
          </div>
        </div>

        <div style={{ textAlign: "center", minWidth: "180px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>
            ختم الشركة وتوقيع المحاسب:
          </div>
          <div
            style={{
              width: "140px",
              height: "45px",
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
          padding: "6px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "9px",
        }}
      >
        <span>طُبع بتاريخ: {fmtDateSlash(today)}</span>
        <span style={{ color: "#4A9EE8", fontWeight: 600 }}>نظام عبدالله AI للمحاسبة</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default TransactionsPrintView;
