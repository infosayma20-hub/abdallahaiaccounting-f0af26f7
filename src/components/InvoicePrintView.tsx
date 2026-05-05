import type { CompanySettings } from "@/hooks/useCompanySettings";

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxCategory?: "taxable" | "zero" | "exempt";
  subtotal: number;
}

interface InvoiceData {
  type: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  contactName: string;
  contactTaxNumber?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  items: InvoiceItem[];
  notes: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  terms?: string;
  chequeDetails?: { number: string; bank: string; dueDate: string };
  taxInclusive?: boolean;
}

interface InvoicePrintViewProps {
  invoice: InvoiceData;
  settings: CompanySettings;
  copyLabel?: string;
}

const fmtDate = (d: string) => {
  if (!d) return "—";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

const CURRENCY_SYMBOLS: Record<string, string> = { "شيكل": "₪", "دولار": "$", "دينار": "د.ا", "يورو": "€" };
const CURRENCY_LABELS: Record<string, string> = { "شيكل": "شيكل (₪ ILS)", "دولار": "دولار أمريكي ($ USD)", "دينار": "دينار أردني (د.ا JOD)", "يورو": "يورو (€ EUR)" };

const fmtAmountWithSymbol = (n: number, symbol: string) =>
  `${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const paymentLabels: Record<string, string> = {
  cash: "نقداً",
  transfer: "تحويل بنكي",
  cheque: "شيك",
  credit: "آجل",
};

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  sent: "مُرسلة",
  paid: "مدفوعة",
};

const LARGE_WIDE_LOGO_OWNER_ID = "6e3d46e2-4b58-4e80-a71e-05661aa8adaf";

const InvoicePrintView = ({ invoice, settings, copyLabel = "أصلية" }: InvoicePrintViewProps) => {
  const isSales = invoice.type === "sales";
  const today = new Date();
  const fmtToday = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  const currSymbol = CURRENCY_SYMBOLS[invoice.currency] || "₪";
  const currLabel = CURRENCY_LABELS[invoice.currency] || CURRENCY_LABELS["شيكل"];
  const fmtAmount = (n: number) => fmtAmountWithSymbol(n, currSymbol);

  const taxEnabled = settings.vat_enabled ?? true;
  const hasExtraWideLogo = settings.user_id === LARGE_WIDE_LOGO_OWNER_ID;

  const centeredLogoWrapperStyle = hasExtraWideLogo
    ? { display: "inline-block", background: "white", borderRadius: "10px", padding: "6px 12px", boxShadow: "none", lineHeight: 0 }
    : { display: "inline-block", background: "white", borderRadius: "6px", padding: "2px 4px", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" };
  const centeredLogoImageStyle = hasExtraWideLogo
    ? { width: "320px", height: "auto", objectFit: "contain" as const, display: "block" }
    : { height: "52px", objectFit: "contain" as const, display: "block" };
  const sideLogoImageStyle = hasExtraWideLogo
    ? { width: "320px", height: "auto", objectFit: "contain" as const, display: "block" }
    : { width: "56px", height: "56px", borderRadius: "8px", objectFit: "contain" as const, background: "white", padding: "3px" };

  // Calculate item-level tax
  const calcItemTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    const afterDiscount = base - (item.discount || 0);
    if (!taxEnabled) return { base, afterDiscount, tax: 0, total: afterDiscount, category: "none" as const };
    const cat = item.taxCategory || (item.taxRate > 0 ? "taxable" : "exempt");
    if (invoice.taxInclusive) {
      // Price already includes tax — extract tax, don't add
      const rate = cat === "taxable" ? 16 : 0;
      const tax = cat === "exempt" ? 0 : afterDiscount - (afterDiscount / (1 + rate / 100));
      return { base, afterDiscount, tax, total: afterDiscount, category: cat };
    }
    const rate = cat === "taxable" ? 16 : 0;
    const tax = cat === "exempt" ? 0 : afterDiscount * (rate / 100);
    return { base, afterDiscount, tax, total: afterDiscount + tax, category: cat };
  };

  let taxableNetTotal = 0, zeroNetTotal = 0, exemptNetTotal = 0;
  invoice.items.forEach(item => {
    const calc = calcItemTotal(item);
    const netAmount = invoice.taxInclusive && calc.category === "taxable" 
      ? calc.afterDiscount / 1.16 
      : calc.afterDiscount;
    if (calc.category === "taxable") taxableNetTotal += netAmount;
    else if (calc.category === "zero") zeroNetTotal += calc.afterDiscount;
    else exemptNetTotal += calc.afterDiscount;
  });

  const subtotalBeforeTax = invoice.taxInclusive
    ? invoice.items.reduce((s, item) => {
        const calc = calcItemTotal(item);
        return s + (calc.category === "taxable" ? calc.afterDiscount / 1.16 : calc.afterDiscount);
      }, 0)
    : invoice.items.reduce((s, item) => s + calcItemTotal(item).afterDiscount, 0);
  const totalTax = taxEnabled ? invoice.items.reduce((s, item) => s + calcItemTotal(item).tax, 0) : 0;
  const grandTotal = subtotalBeforeTax + totalTax;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "794px",
        margin: "0 auto",
        padding: "0",
        fontFamily: "'Cairo', sans-serif",
        direction: "rtl",
        fontSize: "11px",
        lineHeight: 1.5,
        color: "#1a1a2e",
        background: "white",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ━━━ DECORATIVE ORNAMENTS (optional) ━━━ */}
      {settings.print_decorative_ornaments && (
        <>
          {/* Top-right ornament */}
          <div style={{
            position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px",
            borderRadius: "50%", border: "1px solid rgba(74,158,232,0.08)",
            zIndex: 0, pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: "0px", right: "0px", width: "80px", height: "80px",
            borderRadius: "50%", border: "1px solid rgba(74,158,232,0.06)",
            zIndex: 0, pointerEvents: "none",
          }} />
          {/* Bottom-left ornament */}
          <div style={{
            position: "absolute", bottom: "-15px", left: "-15px", width: "100px", height: "100px",
            borderRadius: "50%", border: "1px solid rgba(27,58,92,0.06)",
            zIndex: 0, pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: "5px", left: "5px", width: "60px", height: "60px",
            borderRadius: "50%", border: "1px solid rgba(27,58,92,0.04)",
            zIndex: 0, pointerEvents: "none",
          }} />
          {/* Subtle diamond pattern - top */}
          <div style={{
            position: "absolute", top: "68px", left: "0", right: "0", height: "1px",
            background: "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(74,158,232,0.08) 18px, rgba(74,158,232,0.08) 20px)",
            zIndex: 0, pointerEvents: "none",
          }} />
          {/* Subtle diamond pattern - bottom */}
          <div style={{
            position: "absolute", bottom: "32px", left: "0", right: "0", height: "1px",
            background: "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(27,58,92,0.06) 18px, rgba(27,58,92,0.06) 20px)",
            zIndex: 0, pointerEvents: "none",
          }} />
        </>
      )}

      {/* ━━━ HEADER (clean white) ━━━ */}
      {settings.invoice_header_layout === "logo_center" ? (
        <div style={{ background: "white", color: "#1a1a2e", padding: "18px 28px 10px", position: "relative", zIndex: 1 }}>
          {/* Big centered logo */}
          <div style={{ textAlign: "center", marginBottom: "10px" }}>
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt="Logo"
                style={hasExtraWideLogo
                  ? { width: "360px", height: "auto", objectFit: "contain" as const, display: "inline-block" }
                  : { height: "110px", maxWidth: "320px", objectFit: "contain" as const, display: "inline-block" }
                }
              />
            ) : (
              <div style={{ fontSize: "44px", fontWeight: 800, color: "#1B3A5C" }}>
                {(settings.company_name || "Q").charAt(0)}
              </div>
            )}
          </div>
          {/* Row: title (right RTL) — company info (left RTL) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#1B3A5C" }}>
                {isSales ? "فاتورة مبيعات" : "فاتورة مشتريات"}
              </div>
              <div style={{ fontSize: "9px", color: "#6B7280", fontFamily: "'Segoe UI', sans-serif", letterSpacing: "1px" }}>
                {isSales ? "SALES INVOICE" : "PURCHASE INVOICE"}
              </div>
            </div>
            <div style={{ textAlign: "left", fontSize: "9px", color: "#4B5563", flex: "0 0 auto", maxWidth: "260px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a1a2e", marginBottom: "2px" }}>{settings.company_name || "اسم الشركة"}</div>
              {settings.address && <div>📍 {settings.address}{settings.city ? ` - ${settings.city}` : ""}</div>}
              {!settings.address && settings.city && <div>📍 {settings.city}</div>}
              {settings.phone && <div>📞 {settings.phone}{settings.phone2 ? ` / ${settings.phone2}` : ""}</div>}
              {!settings.phone && settings.phone2 && <div>📞 {settings.phone2}</div>}
              {settings.email && <div>✉️ {settings.email}</div>}
              {taxEnabled && settings.tax_number && <div>🔢 الرقم الضريبي: {settings.tax_number}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "white",
            color: "#1a1a2e",
            padding: "16px 28px 12px",
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Right: company info */}
          <div style={{ textAlign: "right", fontSize: "9px", color: "#4B5563", flex: "0 0 auto", maxWidth: "240px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a1a2e", marginBottom: "2px" }}>{settings.company_name || "اسم الشركة"}</div>
            {settings.address && <div>📍 {settings.address}{settings.city ? ` - ${settings.city}` : ""}</div>}
            {!settings.address && settings.city && <div>📍 {settings.city}</div>}
            {settings.phone && <div>📞 {settings.phone}{settings.phone2 ? ` / ${settings.phone2}` : ""}</div>}
            {!settings.phone && settings.phone2 && <div>📞 {settings.phone2}</div>}
            {settings.email && <div>✉️ {settings.email}</div>}
            {taxEnabled && settings.tax_number && <div>🔢 الرقم الضريبي: {settings.tax_number}</div>}
          </div>

          {/* Center: logo */}
          <div style={{ flex: "1 1 auto", textAlign: "center", padding: "0 12px" }}>
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt="Logo"
                style={hasExtraWideLogo
                  ? { width: "260px", height: "auto", objectFit: "contain" as const, display: "inline-block" }
                  : { height: "56px", objectFit: "contain" as const, display: "inline-block" }
                }
              />
            ) : (
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#1B3A5C" }}>
                {(settings.company_name || "Q").charAt(0)}
              </div>
            )}
          </div>

          {/* Left: invoice title */}
          <div style={{ textAlign: "left", flex: "0 0 auto" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B3A5C" }}>
              {isSales ? "فاتورة مبيعات" : "فاتورة مشتريات"}
            </div>
            <div style={{ fontSize: "9px", color: "#6B7280", fontFamily: "'Segoe UI', sans-serif" }}>
              {isSales ? "SALES INVOICE" : "PURCHASE INVOICE"}
            </div>
          </div>
        </div>
      )}

      {/* ━━━ COPY LABEL (centered badge) ━━━ */}
      {copyLabel && (
        <div style={{ textAlign: "center", padding: "6px 0 2px", position: "relative", zIndex: 1 }}>
          <span
            style={{
              display: "inline-block",
              background: copyLabel === "أصلية" ? "#EEF2FF" : "#F3F4F6",
              color: copyLabel === "أصلية" ? "#1B3A5C" : "#6B7280",
              padding: "3px 20px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "1px",
              border: `1px solid ${copyLabel === "أصلية" ? "#C7D2FE" : "#D1D5DB"}`,
            }}
          >
            {copyLabel === "أصلية" ? "نسخة أصلية" : `نسخة ${copyLabel}`}
          </span>
        </div>
      )}

      {/* ━━━ THIN SEPARATOR ━━━ */}
      <div style={{ height: "1px", background: "#D1D5DB", margin: "0 28px" }} />

      {/* ━━━ LEGAL & REGISTRATION STRIP ━━━ */}
      <div
        style={{
          padding: "6px 28px",
          background: "#F8FAFC",
          borderBottom: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "9px",
          color: "#4B5563",
        }}
      >
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {settings.licensed_dealer_number && (
            <span><strong style={{ color: "#1B3A5C" }}>مشتغل مرخص:</strong> {settings.licensed_dealer_number}</span>
          )}
          {settings.commercial_register && (
            <span><strong style={{ color: "#1B3A5C" }}>سجل تجاري:</strong> {settings.commercial_register}</span>
          )}
        </div>
        <div style={{ fontWeight: 600, color: "#1B3A5C" }}>
          العملة: {currLabel}
        </div>
      </div>

      {/* ━━━ INVOICE META & CUSTOMER ━━━ */}
      <div style={{ padding: "12px 28px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
        {/* Customer Info */}
        <div>
          <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            {isSales ? "العميل" : "المورد"}
          </div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#1B3A5C" }}>{invoice.contactName}</div>
          {invoice.contactTaxNumber && (
            <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "2px" }}>
              <strong style={{ color: "#1B3A5C" }}>الرقم الضريبي:</strong> {invoice.contactTaxNumber}
            </div>
          )}
          {invoice.contactPhone && (
            <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "1px" }}>
              📞 {invoice.contactPhone}
            </div>
          )}
          {invoice.contactEmail && (
            <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "1px" }}>
              ✉️ {invoice.contactEmail}
            </div>
          )}
          {invoice.contactAddress && (
            <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "1px" }}>
              📍 {invoice.contactAddress}
            </div>
          )}
        </div>

        <div style={{ textAlign: "left", fontSize: "10px" }}>
          {[
            { label: "رقم الفاتورة", value: invoice.invoiceNumber, mono: true },
            { label: "تاريخ الإصدار", value: fmtDate(invoice.date) },
            ...(invoice.dueDate && settings.invoice_show_due_date !== false ? [{ label: "تاريخ الاستحقاق", value: fmtDate(invoice.dueDate) }] : []),
            { label: "طريقة الدفع", value: paymentLabels[invoice.paymentMethod] || invoice.paymentMethod },
            { label: "الحالة", value: statusLabels[invoice.status] || invoice.status },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>{row.label}:</span>
              <span style={{ fontWeight: 600, color: "#1B3A5C", ...(row.mono ? { fontFamily: "monospace" } : {}) }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ ITEMS TABLE ━━━ */}
      <div style={{ padding: "10px 28px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#1B3A5C", color: "white" }}>
              {(taxEnabled ? ["#", "الصنف / الوصف", "الكمية", "سعر الوحدة", "الخصم", "المبلغ", "ضريبة 16%", "الإجمالي"] : ["#", "الصنف / الوصف", "الكمية", "سعر الوحدة", "الخصم", "الإجمالي"]).map((h, i) => {
                const isLast = i === (taxEnabled ? 7 : 5);
                return (
                <th
                  key={i}
                  style={{
                    padding: "12px 6px",
                    textAlign: i >= 2 ? "center" : "right",
                    fontWeight: 700,
                    fontSize: "12px",
                    borderBottom: "2px solid #4A9EE8",
                    whiteSpace: "nowrap",
                    background: isLast ? "#152F4A" : undefined,
                  }}
                >
                  {h}
                </th>
              );})}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => {
              const calc = calcItemTotal(item);
              const rowMinHeight = invoice.items.length === 1 ? 56 : 40;
              return (
                <tr
                  key={idx}
                  style={{
                    background: idx % 2 === 0 ? "white" : "#F7F9FC",
                    borderBottom: "1px solid #E5E7EB",
                    height: `${rowMinHeight}px`,
                  }}
                >
                  <td style={{ padding: "12px 6px", textAlign: "center", color: "#6B7280", fontWeight: 700, fontSize: "13px" }}>{idx + 1}</td>
                  <td style={{ padding: "12px 8px", fontWeight: 700, color: "#111827", fontSize: "14px", lineHeight: 1.4, wordWrap: "break-word", whiteSpace: "normal" }}>
                    {item.description}
                  </td>
                  <td style={{ padding: "12px 6px", textAlign: "center", fontFeatureSettings: "'tnum'", fontWeight: 700, fontSize: "14px" }}>{item.quantity}</td>
                  <td style={{ padding: "12px 6px", textAlign: "center", fontFeatureSettings: "'tnum'", fontWeight: 700, fontSize: "14px" }}>{fmtAmount(item.unitPrice)}</td>
                  <td style={{ padding: "12px 6px", textAlign: "center", color: item.discount > 0 ? "#DC2626" : "#9CA3AF", fontFeatureSettings: "'tnum'", fontWeight: 600, fontSize: "13px" }}>
                    {item.discount > 0 ? fmtAmount(item.discount) : "—"}
                  </td>
                  <td style={{ padding: "12px 6px", textAlign: "center", fontFeatureSettings: "'tnum'", fontWeight: 600, fontSize: "13px" }}>{fmtAmount(calc.afterDiscount)}</td>
                  {taxEnabled && (
                  <td style={{ padding: "12px 6px", textAlign: "center", fontSize: "11px", color: "#6B7280", fontFeatureSettings: "'tnum'" }}>
                    {calc.category === "taxable" ? fmtAmount(calc.tax) : calc.category === "zero" ? "0%" : "معفى"}
                  </td>
                  )}
                  <td style={{ padding: "12px 6px", textAlign: "center", fontWeight: 800, color: "#1B3A5C", fontFeatureSettings: "'tnum'", fontSize: "15px", background: "#EEF4FB" }}>
                    {fmtAmount(calc.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ━━━ TOTALS SECTION (Ledger Style) ━━━ */}
      <div style={{ padding: "6px 28px 10px", display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: "360px", fontFeatureSettings: "'tnum'" }}>
          {/* Subtotal */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 4px", fontSize: "13px" }}>
            <span style={{ color: "#4B5563" }}>{taxEnabled ? "المجموع قبل الضريبة" : "الإجمالي الفرعي"}</span>
            <span style={{ fontWeight: 600, color: "#1B3A5C" }}>{fmtAmount(subtotalBeforeTax)}</span>
          </div>
          {/* Discount */}
          {invoice.totalDiscount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 4px", fontSize: "13px" }}>
              <span style={{ color: "#DC2626" }}>إجمالي الخصم</span>
              <span style={{ fontWeight: 600, color: "#DC2626" }}>-{fmtAmount(invoice.totalDiscount)}</span>
            </div>
          )}
          {/* Tax */}
          {taxEnabled && totalTax > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 4px", fontSize: "13px" }}>
              <span style={{ color: "#4B5563" }}>{invoice.taxInclusive ? "ضريبة القيمة المضافة 16% (مستخرجة)" : "ضريبة القيمة المضافة 16%"}</span>
              <span style={{ fontWeight: 600, color: "#1B3A5C" }}>{invoice.taxInclusive ? "" : "+"}{fmtAmount(totalTax)}</span>
            </div>
          )}
          {/* Exempt breakdown */}
          {taxEnabled && exemptNetTotal > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", fontSize: "10px" }}>
              <span style={{ color: "#9CA3AF" }}>مبيعات معفاة من الضريبة</span>
              <span style={{ color: "#9CA3AF" }}>{fmtAmount(exemptNetTotal)}</span>
            </div>
          )}
          {taxEnabled && zeroNetTotal > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", fontSize: "10px" }}>
              <span style={{ color: "#9CA3AF" }}>مبيعات بنسبة صفر</span>
              <span style={{ color: "#9CA3AF" }}>{fmtAmount(zeroNetTotal)}</span>
            </div>
          )}
          {/* Grand Total — accounting ledger lines */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "10px 4px 8px",
              marginTop: "4px",
              borderTop: "1px solid #1B3A5C",
              borderBottom: "3px double #1B3A5C",
              fontSize: "16px",
              fontWeight: 800,
              color: "#0D1B2E",
            }}
          >
            <span>الإجمالي النهائي</span>
            <span style={{ fontSize: "21px", fontWeight: 800, letterSpacing: "0.3px" }}>{fmtAmount(grandTotal)}</span>
          </div>
          {/* Paid / Remaining */}
          {invoice.paidAmount > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px", fontSize: "13px" }}>
                <span style={{ color: "#16A34A" }}>المبلغ المدفوع</span>
                <span style={{ fontWeight: 600, color: "#16A34A" }}>{fmtAmount(invoice.paidAmount)}</span>
              </div>
              {invoice.remainingAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px", fontSize: "14px", borderTop: "1px solid #F3F4F6" }}>
                  <span style={{ color: "#DC2626", fontWeight: 700 }}>المبلغ المتبقي</span>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>{fmtAmount(invoice.remainingAmount)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ━━━ CHEQUE DETAILS ━━━ */}
      {invoice.paymentMethod === "cheque" && invoice.chequeDetails && (
        <div style={{ margin: "0 28px 8px", padding: "8px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "10px" }}>
          <div style={{ fontWeight: 700, color: "#92400E", marginBottom: "4px" }}>تفاصيل الشيك:</div>
          <div style={{ display: "flex", gap: "20px", color: "#78350F" }}>
            <span>رقم: <strong>{invoice.chequeDetails.number}</strong></span>
            <span>البنك: <strong>{invoice.chequeDetails.bank}</strong></span>
            <span>تاريخ الاستحقاق: <strong>{fmtDate(invoice.chequeDetails.dueDate)}</strong></span>
          </div>
        </div>
      )}

      {/* ━━━ NOTES ━━━ */}
      {invoice.notes && (
        <div style={{ margin: "0 28px 8px", padding: "8px 14px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "10px" }}>
          <span style={{ fontWeight: 700, color: "#1B3A5C" }}>ملاحظات: </span>
          <span style={{ color: "#4B5563" }}>{invoice.notes}</span>
        </div>
      )}

      {/* ━━━ TERMS & CONDITIONS ━━━ */}
      {invoice.terms && (
        <div style={{ margin: "0 28px 8px", padding: "8px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "10px" }}>
          <div style={{ fontWeight: 700, color: "#1B3A5C", marginBottom: "4px" }}>الشروط والأحكام:</div>
          <div style={{ color: "#4B5563", whiteSpace: "pre-line", lineHeight: 1.6 }}>{invoice.terms}</div>
        </div>
      )}

      {taxEnabled && (
      <div style={{ margin: "0 28px 8px", padding: "6px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "6px", fontSize: "8px", color: "#1E40AF", textAlign: "center" }}>
        هذه الفاتورة صادرة وفقاً لأحكام قانون ضريبة الدخل الفلسطيني وقانون ضريبة القيمة المضافة — رقم القرار بقانون: (26) لسنة 2024م • يرجى الاحتفاظ بها لأغراض المراجعة والتدقيق
      </div>
      )}

      {/* ━━━ FOOTER - SIGNATURES ━━━ */}
      <div
        style={{
          margin: "0 28px",
          padding: "10px 0",
          borderTop: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {/* Seller Signature */}
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>توقيع البائع / المسؤول</div>
          <div style={{ width: "130px", height: "40px", border: "1px dashed #D1D5DB", borderRadius: "6px", margin: "0 auto 4px" }} />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>الاسم والتوقيع</div>
        </div>

        {/* Buyer Signature */}
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>توقيع {isSales ? "المشتري" : "المستلم"}</div>
          <div style={{ width: "130px", height: "40px", border: "1px dashed #D1D5DB", borderRadius: "6px", margin: "0 auto 4px" }} />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>الاسم والتوقيع</div>
        </div>

        {/* Stamp */}
        <div style={{ textAlign: "center", minWidth: "120px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>الختم</div>
          <div style={{ width: "60px", height: "60px", border: "1px dashed #D1D5DB", borderRadius: "50%", margin: "0 auto" }} />
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
        <span>طُبع بتاريخ: {fmtToday}</span>
        <span style={{ color: "#4A9EE8", fontWeight: 600 }}>AMWALI أموالي</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default InvoicePrintView;
