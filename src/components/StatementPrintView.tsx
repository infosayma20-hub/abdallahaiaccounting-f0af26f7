import { useMemo } from "react";

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

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
}

interface PDCCheque {
  cheque_number: string | null;
  cheque_date: string;
  bank_name: string | null;
  amount: number;
  status: string;
}

interface BouncedChequeRow {
  date: string;
  reference: string;
  description: string;
  amount: number;
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
  columns?: ColumnConfig[];
  contactCode?: string;
  detailLevel?: string;
  pdcCheques?: PDCCheque[];
  pdcTotal?: number;
  bouncedCheques?: BouncedChequeRow[];
  bouncedTotal?: number;
  includeBounced?: boolean;
  includePDC?: boolean;
}

const PAYMENT_METHOD_AR: Record<string, string> = {
  cash: "نقدي", نقدي: "نقدي",
  credit: "آجل", آجل: "آجل",
  bank: "بنك", بنك: "بنك",
  cheque: "شيك", شيك: "شيك",
  check: "شيك",
  transfer: "تحويل", تحويل: "تحويل",
  card: "بطاقة", بطاقة: "بطاقة",
  employee_account: "حساب موظف",
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

const getTypeBadgeLabel = (txType: string) => {
  if (txType.includes("pos")) return "مبيعات POS";
  if (txType.includes("sale") || txType.includes("فاتورة")) return "فاتورة مبيعات";
  if (txType.includes("receipt") || txType.includes("قبض")) return "سند قبض";
  if (txType.includes("payment") || txType.includes("صرف")) return "سند صرف";
  if (txType.includes("purchase") || txType.includes("مشتريات")) return "فاتورة مشتريات";
  if (txType.includes("journal") || txType.includes("قيد") || txType.includes("salary")) return "قيد محاسبي";
  if (txType.includes("cheque")) return "شيك";
  if (txType.includes("bounced")) return "شيك مرتجع";
  if (txType.includes("opening_balance")) return "رصيد افتتاحي";
  return "حركة";
};

const getTypeBadgeStyle = (txType: string): { bg: string; color: string; border: string } => {
  if (txType.includes("payment") || txType.includes("صرف"))
    return { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" };
  if (txType.includes("sale") || txType.includes("فاتورة"))
    return { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" };
  if (txType.includes("receipt") || txType.includes("قبض"))
    return { bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0" };
  if (txType.includes("purchase") || txType.includes("مشتريات"))
    return { bg: "#FFF7ED", color: "#9A3412", border: "#FED7AA" };
  if (txType.includes("journal") || txType.includes("قيد") || txType.includes("salary"))
    return { bg: "#EDE9FE", color: "#5B21B6", border: "#DDD6FE" };
  if (txType.includes("cheque") || txType.includes("bounced"))
    return { bg: "#E0E7FF", color: "#3730A3", border: "#C7D2FE" };
  if (txType.includes("pos"))
    return { bg: "#FCE7F3", color: "#9D174D", border: "#FBCFE8" };
  return { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB" };
};

// Smart column definitions
interface SmartColumn {
  key: string;
  label: string;
  width: string;
}

const getSmartColumns = (detailMode: boolean, userColumns?: ColumnConfig[]): SmartColumn[] => {
  const base: SmartColumn[] = [
    { key: "date", label: "التاريخ", width: "10%" },
    { key: "reference", label: "المرجع", width: "13%" },
    { key: "description", label: "البيان", width: detailMode ? "28%" : "22%" },
  ];

  const conditional: (SmartColumn & { hidden: boolean })[] = [
    { key: "dueDate", label: "الاستحقاق", width: "10%", hidden: detailMode },
    { key: "currency", label: "العملة", width: "7%", hidden: detailMode },
    { key: "paymentMethod", label: "طريقة الدفع", width: "9%", hidden: detailMode },
  ];

  const fixed: SmartColumn[] = [
    { key: "type", label: "النوع", width: "8%" },
    { key: "debit", label: "مدين (عليه)", width: "12%" },
    { key: "credit", label: "دائن (له)", width: "12%" },
    { key: "balance", label: "الرصيد", width: "13%" },
  ];

  const extraCols: SmartColumn[] = [];
  if (userColumns) {
    const contactCodeCol = userColumns.find(c => c.key === "contactCode" && c.visible);
    if (contactCodeCol && !detailMode) {
      extraCols.push({ key: "contactCode", label: "كود الجهة", width: "8%" });
    }
  }

  const visibleConditional = conditional.filter(c => !c.hidden);
  const allCols = [...base, ...visibleConditional, ...extraCols, ...fixed];

  if (userColumns) {
    return allCols.filter(col => {
      const userCol = userColumns.find(c => c.key === col.key);
      if (userCol) return userCol.visible;
      return true;
    });
  }

  return allCols;
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
  columns,
  contactCode,
  detailLevel,
  pdcCheques = [],
  pdcTotal = 0,
  bouncedCheques = [],
  bouncedTotal = 0,
  includeBounced = false,
  includePDC = false,
  isPreview = false,
}: StatementPrintViewProps & { isPreview?: boolean }) => {
  const isDebit = closingBalance >= 0;
  const today = new Date();
  const soaNumber = statementNumber || `SOA-${today.getFullYear()}-${String(Date.now()).slice(-4).padStart(4, "0")}`;
  const isDetailMode = detailLevel === "lineItems";

  const smartColumns = useMemo(() => {
    return getSmartColumns(isDetailMode, columns);
  }, [isDetailMode, columns]);

  const isAmountCol = (key: string) => ["debit", "credit", "balance"].includes(key);
  const isCenterCol = (key: string) => ["type", "paymentMethod", "currency", "contactCode"].includes(key);

  const renderCellValue = (col: string, row: StatementRow) => {
    const isSubRow = !!row.isLineItem;

    switch (col) {
      case "date":
        return isSubRow
          ? <span style={{ color: "#9CA3AF", fontWeight: 600 }}>↳</span>
          : <span style={{ color: "#374151", fontVariantNumeric: "tabular-nums" }}>{fmtDate(row.date)}</span>;
      case "reference":
        if (isSubRow) return <span style={{ color: "#D1D5DB" }}>—</span>;
        return row.reference
          ? <span style={{ color: "#1B3A5C", fontWeight: 600, fontFamily: "'Courier New', monospace", fontSize: "8.5px" }}>{row.reference}</span>
          : <span style={{ color: "#9CA3AF" }}>—</span>;
      case "description":
        if (isSubRow && row.lineItemDetail) {
          return (
            <span style={{ color: "#4B5563", fontWeight: 600 }}>
              <span style={{ color: "#6366F1", marginLeft: "4px" }}>↳</span>
              {" "}{row.description.replace(/^\s*↳\s*/, "")}
            </span>
          );
        }
        return (
          <span style={{ color: isSubRow ? "#4B5563" : "#111827", fontWeight: isSubRow ? 600 : 500 }}>
            {row.description}
          </span>
        );
      case "dueDate":
        return isSubRow
          ? <span style={{ color: "#D1D5DB" }}>—</span>
          : <span style={{ color: "#6B7280", fontVariantNumeric: "tabular-nums" }}>{row.dueDate ? fmtDate(row.dueDate) : "—"}</span>;
      case "type": {
        if (isSubRow) {
          return (
            <span style={{
              fontSize: "7.5px", fontWeight: 700, padding: "1px 5px", borderRadius: "4px",
              background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE",
              whiteSpace: "nowrap",
            }}>
              بند فاتورة
            </span>
          );
        }
        const label = getTypeBadgeLabel(row.transaction_type);
        const badgeStyle = getTypeBadgeStyle(row.transaction_type);
        return (
          <span style={{
            fontSize: "7.5px", fontWeight: 700, padding: "1px 5px", borderRadius: "4px",
            background: badgeStyle.bg, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}`,
            whiteSpace: "nowrap",
          }}>
            {label}
          </span>
        );
      }
      case "paymentMethod":
        return isSubRow
          ? <span style={{ color: "#D1D5DB" }}>—</span>
          : <span style={{ color: "#6B7280", fontSize: "9px" }}>{PAYMENT_METHOD_AR[row.payment_method || ""] || row.payment_method || "—"}</span>;
      case "currency":
        return isSubRow
          ? <span style={{ color: "#D1D5DB" }}>—</span>
          : <span style={{ color: "#6B7280", fontSize: "9px" }}>{row.currency || "—"}</span>;
      case "contactCode":
        return isSubRow
          ? <span style={{ color: "#D1D5DB" }}>—</span>
          : <span style={{ color: "#6B7280", fontFamily: "'Courier New', monospace", fontSize: "8.5px" }}>{contactCode || "—"}</span>;
      case "debit":
        return (
          <span style={{
            fontWeight: row.debit > 0 ? 700 : 400,
            color: row.debit > 0 ? "#DC2626" : "#D1D5DB",
            opacity: isSubRow ? 0.85 : 1,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}>
            {row.debit > 0 ? fmtAmount(row.debit) : "—"}
          </span>
        );
      case "credit":
        return (
          <span style={{
            fontWeight: row.credit > 0 ? 700 : 400,
            color: row.credit > 0 ? "#15803D" : "#D1D5DB",
            opacity: isSubRow ? 0.85 : 1,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}>
            {row.credit > 0 ? fmtAmount(row.credit) : "—"}
          </span>
        );
      case "balance":
        if (isSubRow) return <span style={{ color: "#D1D5DB" }}>—</span>;
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{
              fontWeight: 700,
              color: "#0D1B2E",
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtAmount(row.balance)}
            </span>
            <span style={{ fontSize: "7px", marginRight: "2px", color: row.balance >= 0 ? "#DC2626" : "#15803D", fontWeight: 600 }}>
              {row.balance >= 0 ? "م" : "د"}
            </span>
          </span>
        );
      default:
        return "—";
    }
  };

  return (
    <div
      id="statement-print-wrapper"
      className={`statement-print-page statement-page bg-white text-black ${isPreview ? '' : 'print-only'}`}
      style={{
        width: "100%", maxWidth: "794px", margin: "0 auto", padding: "0",
        fontFamily: "'Cairo', 'Segoe UI', sans-serif", direction: "rtl",
        fontSize: "11px", lineHeight: 1.5, position: "relative", overflow: "hidden", boxSizing: "border-box",
      }}
    >
      {/* ━━━ HEADER BAR ━━━ */}
      <div
        style={{
          background: "#0D1B2E",
          color: "white", padding: "14px 28px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt="Logo"
              crossOrigin="anonymous"
              style={{ width: "52px", height: "52px", borderRadius: "8px", objectFit: "contain", background: "white", padding: "3px" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              style={{
                width: "52px", height: "52px", borderRadius: "8px",
                background: "rgba(255,255,255,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px", fontWeight: 800, color: "#60A5FA",
              }}
            >
              {company.name?.charAt(0) || "C"}
            </div>
          )}
          <div>
            <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "0.3px" }}>{company.name}</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)", marginTop: "3px" }}>
              {company.address && <span>{company.address}</span>}
              {company.phone && <span style={{ marginRight: "14px" }}>📞 {company.phone}</span>}
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "1px" }}>
              {company.email && <span>✉️ {company.email}</span>}
              {company.tax_number && <span style={{ marginRight: "14px" }}>رقم ضريبي: {company.tax_number}</span>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#CBD5E1" }}>كشف حساب</div>
          <div style={{ fontSize: "10px", color: "#94A3B8", fontFamily: "'Segoe UI', sans-serif", marginTop: "2px" }}>STATEMENT OF ACCOUNT</div>
          <div style={{ fontSize: "11px", color: "#F59E0B", fontWeight: 600, fontFamily: "'Courier New', monospace", marginTop: "4px" }}>{soaNumber}</div>
        </div>
      </div>

      {/* ━━━ ACCENT LINE ━━━ */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #60A5FA, #3B82F6, #60A5FA)" }} />

      {/* ━━━ INFO SECTION ━━━ */}
      <div style={{
        margin: "10px 28px", padding: "12px 16px",
        background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px",
        display: "flex", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 400, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            صادر إلى
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D1B2E" }}>{contact.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <span style={{
              fontSize: "9px", padding: "2px 8px", borderRadius: "4px",
              background: contact.type === "عميل" ? "#EBF5FF" : "#FEF3E2",
              color: contact.type === "عميل" ? "#1B3A5C" : "#92400E", fontWeight: 600,
            }}>
              {contact.type}
            </span>
            {contact.contactClass && (
              <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "#F3F4F6", color: "#374151", fontWeight: 600 }}>
                فئة: {contact.contactClass}
              </span>
            )}
          </div>
          {contact.phone && <div style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>📞 {contact.phone}</div>}
          {contact.address && <div style={{ fontSize: "10px", color: "#374151", marginTop: "2px" }}>📍 {contact.address}</div>}
        </div>

        <div style={{ textAlign: "left", fontSize: "11px" }}>
          {[
            { label: "رقم الكشف:", value: soaNumber, mono: true },
            { label: "تاريخ الإصدار:", value: fmtDateSlash(today) },
            { label: "من:", value: fmtDate(dateFrom) },
            { label: "إلى:", value: fmtDate(dateTo) },
            { label: "العملة:", value: "شيكل إسرائيلي (₪ ILS)" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280", fontWeight: 400 }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: "#0D1B2E", fontFamily: item.mono ? "'Courier New', monospace" : undefined }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ KPI SUMMARY CARDS ━━━ */}
      <div style={{ padding: "4px 28px 8px", display: "grid", gridTemplateColumns: `repeat(${includeBounced && bouncedTotal > 0 ? 5 : 4}, 1fr)`, gap: "8px" }}>
        {/* Opening Balance */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>رصيد افتتاحي</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D1B2E", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(openingBalance)}</div>
        </div>

        {/* Total Debit */}
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>إجمالي المدين</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803D", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(totalDebit)}</div>
        </div>

        {/* Total Credit */}
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>إجمالي الدائن</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#C2410C", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(totalCredit)}</div>
        </div>

        {/* Closing Balance */}
        <div style={{
          background: closingBalance === 0 ? "#F0FDF4" : isDebit ? "#FEF2F2" : "#F0FDF4",
          border: `1px solid ${closingBalance === 0 ? "#BBF7D0" : isDebit ? "#FECACA" : "#BBF7D0"}`,
          borderRadius: "8px", padding: "8px 10px", textAlign: "center",
        }}>
          <div style={{ fontSize: "10px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>الرصيد المستحق</div>
          <div style={{
            fontSize: "16px", fontWeight: 700,
            color: closingBalance === 0 ? "#15803D" : isDebit ? "#DC2626" : "#15803D",
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmtAmount(closingBalance)}
          </div>
          {closingBalance !== 0 && (
            <div style={{ fontSize: "9px", color: isDebit ? "#DC2626" : "#15803D", marginTop: "2px", fontWeight: 600 }}>
              {isDebit ? "(مدين - عليه)" : "(دائن - له)"}
            </div>
          )}
        </div>

        {/* Bounced Cheques */}
        {includeBounced && bouncedTotal > 0 && (
          <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>شيكات مرتجعة</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#EA580C", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(bouncedTotal)}</div>
            <div style={{ fontSize: "9px", color: "#EA580C", marginTop: "2px", fontWeight: 600 }}>{bouncedCheques.length} شيك</div>
          </div>
        )}
      </div>

      {/* ━━━ TABLE ━━━ */}
      <div style={{ padding: "0 28px 4px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px", tableLayout: "fixed" }}>
          <colgroup>
            {smartColumns.map(col => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: "#0D1B2E", color: "#FFFFFF" }}>
              {smartColumns.map(col => (
                <th
                  key={col.key}
                  style={{
                    padding: "8px 6px",
                    textAlign: isAmountCol(col.key) ? "left" : isCenterCol(col.key) ? "center" : "right",
                    fontWeight: 600, fontSize: "10.5px",
                    borderBottom: "2px solid #3B82F6",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            <tr style={{ background: "#F1F5F9", borderBottom: "1px solid #E2E8F0" }}>
              {smartColumns.map(col => {
                if (col.key === "date") return <td key={col.key} style={{ padding: "5px 6px", color: "#374151", fontWeight: 700, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(dateFrom)}</td>;
                if (col.key === "reference") return <td key={col.key} style={{ padding: "5px 6px", color: "#9CA3AF" }}>—</td>;
                if (col.key === "description") return <td key={col.key} style={{ padding: "5px 6px", fontWeight: 700, fontStyle: "italic", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>رصيد أول المدة</td>;
                if (col.key === "debit") return <td key={col.key} style={{ padding: "5px 6px", textAlign: "left", color: openingBalance > 0 ? "#DC2626" : "#9CA3AF", fontWeight: openingBalance > 0 ? 700 : 400, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{openingBalance > 0 ? fmtAmount(openingBalance) : "—"}</td>;
                if (col.key === "credit") return <td key={col.key} style={{ padding: "5px 6px", textAlign: "left", color: openingBalance < 0 ? "#15803D" : "#9CA3AF", fontWeight: openingBalance < 0 ? 700 : 400, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{openingBalance < 0 ? fmtAmount(openingBalance) : "—"}</td>;
                if (col.key === "balance") return (
                  <td key={col.key} style={{ padding: "5px 6px", textAlign: "left", fontWeight: 700, color: "#0D1B2E", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtAmount(openingBalance)}
                  </td>
                );
                return <td key={col.key} style={{ padding: "5px 6px" }}></td>;
              })}
            </tr>

            {/* Data rows */}
            {rows.map((row, i) => {
              const isSubRow = !!row.isLineItem;
              return (
                <tr
                  key={`${row.transaction_id}-${i}-${isSubRow ? "item" : "row"}`}
                  style={{
                    background: isSubRow ? "#FFFBEB" : (i % 2 === 0 ? "#FFFFFF" : "#F8FAFC"),
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  {smartColumns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding: isSubRow ? "3px 6px" : "5px 6px",
                        textAlign: isAmountCol(col.key) ? "left" : isCenterCol(col.key) ? "center" : "right",
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: col.key === "description" ? "normal" : "nowrap",
                        verticalAlign: "top",
                        fontSize: isSubRow ? "9px" : "10.5px",
                      }}
                    >
                      {renderCellValue(col.key, row)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Closing balance / Totals row */}
            <tr style={{ background: "#0D1B2E", color: "#FFFFFF", fontWeight: 700, borderTop: "3px solid #3B82F6" }}>
              {smartColumns.map(col => {
                if (col.key === "date") return <td key={col.key} style={{ padding: "10px 6px", fontSize: "11px" }}>—</td>;
                if (col.key === "reference") return <td key={col.key} style={{ padding: "10px 6px", fontSize: "11px" }}>—</td>;
                if (col.key === "description") return <td key={col.key} style={{ padding: "10px 6px", fontWeight: 700, fontSize: "11px" }}>رصيد ختامي</td>;
                if (col.key === "debit") return <td key={col.key} style={{ padding: "10px 6px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontSize: "11px", whiteSpace: "nowrap" }}>{fmtAmount(totalDebit)}</td>;
                if (col.key === "credit") return <td key={col.key} style={{ padding: "10px 6px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontSize: "11px", whiteSpace: "nowrap" }}>{fmtAmount(totalCredit)}</td>;
                if (col.key === "balance") return (
                  <td key={col.key} style={{ padding: "10px 6px", textAlign: "left", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    <span style={{ color: "#60A5FA", fontWeight: 800, fontSize: "12px" }}>
                      {fmtAmount(closingBalance)}
                    </span>
                    <span style={{ fontSize: "8px", marginRight: "3px", color: "#93C5FD" }}>
                      {isDebit ? "مدين (عليه)" : "دائن (له)"}
                    </span>
                  </td>
                );
                return <td key={col.key} style={{ padding: "10px 6px" }}></td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ━━━ OVERDUE ALERT ━━━ */}
      {closingBalance > 0 && (
        <div
          style={{
            margin: "8px 28px", padding: "10px 14px",
            background: "#FEF3C7", border: "1px solid #F59E0B", borderRight: "4px solid #F59E0B",
            borderRadius: "6px",
            display: "flex", alignItems: "center", gap: "10px",
          }}
        >
          <span style={{ fontSize: "18px" }}>⚠️</span>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400E" }}>
              يوجد رصيد مستحق بقيمة <span style={{ color: "#B45309" }}>{fmtAmount(closingBalance)}</span>
            </div>
            <div style={{ fontSize: "9px", color: "#92400E", marginTop: "2px" }}>
              يرجى التواصل لترتيب السداد
            </div>
          </div>
        </div>
      )}

      {/* ━━━ PDC SECTION ━━━ */}
      {includePDC && pdcCheques.length > 0 && (
        <div style={{ margin: "0 28px 8px" }}>
          <div style={{ border: "1px solid #DBEAFE", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{
              background: "#EFF6FF", padding: "6px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#1E40AF" }}>
                📅 الشيكات الواردة برسم التحصيل (PDC)
              </span>
              <span style={{ fontSize: "9px", color: "#3B82F6", fontWeight: 600 }}>
                {pdcCheques.length} شيك — {fmtAmount(pdcTotal)}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
              <thead>
                <tr style={{ background: "#F0F9FF" }}>
                  {["رقم الشيك", "تاريخ الاستحقاق", "البنك", "المبلغ", "الحالة"].map((h, i) => (
                    <th key={i} style={{
                      padding: "4px 8px", textAlign: i === 3 ? "left" : "center",
                      fontWeight: 700, color: "#1E40AF", borderBottom: "1px solid #BFDBFE",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pdcCheques.map((chk, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #EFF6FF" }}>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontFamily: "'Courier New', monospace", fontWeight: 600 }}>{chk.cheque_number || "—"}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{fmtDate(chk.cheque_date)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>{chk.bank_name || "—"}</td>
                    <td style={{ padding: "3px 8px", textAlign: "left", fontWeight: 700, color: "#15803D", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(chk.amount)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <span style={{
                        fontSize: "8px", padding: "1px 6px", borderRadius: "4px",
                        background: "#DBEAFE", color: "#1D4ED8", fontWeight: 600,
                      }}>آجل</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#EFF6FF", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "4px 8px", textAlign: "right", color: "#1E40AF", fontSize: "9px" }}>
                    الرصيد مع الشيكات الآجلة
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "left", color: "#1E40AF", fontVariantNumeric: "tabular-nums", fontSize: "10px" }}>
                    {fmtAmount(closingBalance + pdcTotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ━━━ FOOTER - CONTACT & SIGNATURE ━━━ */}
      <div
        style={{
          margin: "0 28px", padding: "10px 0",
          borderTop: "1px solid #E2E8F0",
          display: "flex", justifyContent: "space-between", gap: "20px",
        }}
      >
        {/* للمطابقة والاستفسار */}
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#0D1B2E", marginBottom: "6px" }}>للمطابقة والاستفسار:</div>
          <div style={{ fontSize: "10px", color: "#374151", lineHeight: 1.8 }}>
            {company.phone && <div>📞 {company.phone}</div>}
            {company.email && <div>✉️ {company.email}</div>}
          </div>
          <div style={{ fontSize: "8px", color: "#9CA3AF", marginTop: "8px", fontStyle: "italic" }}>
            يرجى الإشارة إلى رقم الكشف عند التواصل
          </div>
        </div>

        {/* Signature lines */}
        <div style={{ display: "flex", gap: "24px" }}>
          {["ختم الشركة وتوقيع المحاسب", "اعتماد العميل"].map((label, i) => (
            <div key={i} style={{ textAlign: "center", minWidth: "140px" }}>
              <div style={{ marginTop: "40px", borderTop: "1.5px solid #CBD5E1", paddingTop: "8px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ BOTTOM BAR ━━━ */}
      <div
        style={{
          background: "#0D1B2E", color: "#94A3B8",
          padding: "6px 28px",
          display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px",
        }}
      >
        <span>طُبع بتاريخ: {fmtDateSlash(today)}</span>
        <span style={{ color: "white", fontWeight: 600 }}>{company.name || "AMWALI أموالي"}</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default StatementPrintView;
