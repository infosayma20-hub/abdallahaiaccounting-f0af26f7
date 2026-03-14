import { useMemo } from "react";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  subtotal: number;
}

interface InvoiceData {
  type: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  contactName: string;
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
  is_credit_note?: boolean;
}

interface Props {
  invoice: InvoiceData;
  settings: CompanySettings;
}

const paymentLabels: Record<string, string> = {
  cash: "نقداً", transfer: "تحويل بنكي", cheque: "شيك", credit: "آجل",
  "نقدي": "نقداً", "بنك": "تحويل بنكي", "شيك": "شيك", "آجل": "آجل",
};

const statusLabels: Record<string, string> = {
  draft: "مسودة", sent: "مُرسلة", paid: "مدفوعة",
};

const fmtDate = (d: string) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const fmtAmount = (n: number, currency = "₪") =>
  `${currency}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const numberToArabicWords = (num: number): string => {
  if (num === 0) return "صفر";
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
    "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const n = Math.floor(Math.abs(num));
  if (n < 20) return ones[n];
  if (n < 100) return (n % 10 ? ones[n % 10] + " و" : "") + tens[Math.floor(n / 10)];
  if (n < 1000) return hundreds[Math.floor(n / 100)] + (n % 100 ? " و" + numberToArabicWords(n % 100) : "");
  if (n < 1000000) return numberToArabicWords(Math.floor(n / 1000)) + " ألف" + (n % 1000 ? " و" + numberToArabicWords(n % 1000) : "");
  return String(n);
};

const InvoiceDocumentPreview = ({ invoice, settings }: Props) => {
  const color = settings.invoice_primary_color || "#1B3A5C";
  const gold = "#C9A84C";
  const isSales = invoice.type === "sales";
  const isCN = invoice.is_credit_note;
  const currencySymbol = invoice.currency === "دولار" ? "$" : invoice.currency === "دينار" ? "د.أ" : "₪";

  const calcItem = (item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    const afterDiscount = base - (item.discount || 0);
    const tax = afterDiscount * ((item.taxRate || 0) / 100);
    return { base, afterDiscount, tax, total: afterDiscount + tax };
  };

  const totals = useMemo(() => {
    const subtotal = invoice.items.reduce((s, i) => s + calcItem(i).afterDiscount, 0);
    const totalTax = invoice.items.reduce((s, i) => s + calcItem(i).tax, 0);
    const totalDiscount = invoice.items.reduce((s, i) => s + (i.discount || 0), 0);
    return { subtotal: Math.abs(subtotal), totalTax: Math.abs(totalTax), totalDiscount: Math.abs(totalDiscount), grand: Math.abs(subtotal + totalTax) };
  }, [invoice.items]);

  const invoiceTitle = isCN ? "إشعار دائن" : isSales ? "فاتورة مبيعات" : "فاتورة مشتريات";
  const invoiceTitleEn = isCN ? "CREDIT NOTE" : isSales ? "SALES INVOICE" : "PURCHASE INVOICE";
  const copyLabel = invoice.status === "sent" ? "نسخة أصلية" : invoice.status === "draft" ? "مسودة" : "نسخة أصلية";

  return (
    <div
      id="invoice-document"
      dir="rtl"
      style={{
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        width: "100%",
        background: "white",
        color: "#1a1a1a",
        fontSize: "11px",
        lineHeight: 1.6,
      }}
    >
      {/* ━━ Header ━━ */}
      <div style={{ background: color, padding: "20px 25px", position: "relative" }}>
        <div style={{ position: "absolute", bottom: 0, right: 0, left: 0, height: "3px", background: gold }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Company Info */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {settings.logo_url && (
              <img
                src={settings.logo_url}
                alt="logo"
                style={{ width: "55px", height: "55px", objectFit: "contain", background: "white", borderRadius: "8px", padding: "4px" }}
              />
            )}
            <div>
              <div style={{ color: "white", fontSize: "15px", fontWeight: 700 }}>{settings.company_name || "اسم الشركة"}</div>
              {settings.company_name_en && <div style={{ color: gold, fontSize: "10px" }}>{settings.company_name_en}</div>}
              <div style={{ color: "#94a3b8", fontSize: "8.5px", marginTop: "3px" }}>
                {[settings.phone, settings.email, settings.address].filter(Boolean).join(" | ")}
              </div>
              {settings.show_tax_on_invoice && settings.tax_number && (
                <div style={{ color: "#94a3b8", fontSize: "8px" }}>الرقم الضريبي: {settings.tax_number}</div>
              )}
            </div>
          </div>

          {/* Invoice Title */}
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "white", fontSize: "20px", fontWeight: 800 }}>{invoiceTitle}</div>
            <div style={{ color: gold, fontSize: "11px" }}>{invoiceTitleEn}</div>
            <div style={{
              background: "rgba(201,168,76,0.2)", border: `1px solid ${gold}`, borderRadius: "6px",
              padding: "4px 12px", marginTop: "6px", color: gold, fontWeight: 700, fontSize: "12px",
            }}>
              {invoice.invoiceNumber}
            </div>
            {invoice.status !== "draft" && (
              <div style={{
                background: isCN ? "#FEE2E2" : "#DCFCE7",
                color: isCN ? "#DC2626" : "#15803D",
                padding: "2px 10px", borderRadius: "10px", fontSize: "9px", fontWeight: 700, marginTop: "4px", textAlign: "center",
              }}>
                {isCN ? "⚠ إشعار دائن" : `✓ ${copyLabel}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━ Client & Invoice Details ━━ */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0",
        margin: "16px 20px", border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 16px", borderLeft: "1px solid #E2E8F0" }}>
          <div style={{ color: "#94a3b8", fontSize: "9px", marginBottom: "6px", fontWeight: 600 }}>
            {isSales ? "صادرة إلى" : "واردة من"}
          </div>
          <div style={{ fontWeight: 700, fontSize: "14px", color }}>
            {invoice.contactName || "—"}
          </div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ color: "#94a3b8", fontSize: "9px", marginBottom: "6px", fontWeight: 600 }}>تفاصيل الفاتورة</div>
          {[
            ["رقم الفاتورة:", invoice.invoiceNumber],
            ["تاريخ الإصدار:", fmtDate(invoice.date)],
            invoice.dueDate ? ["تاريخ الاستحقاق:", fmtDate(invoice.dueDate)] : null,
            ["طريقة الدفع:", paymentLabels[invoice.paymentMethod] || invoice.paymentMethod],
            ["العملة:", invoice.currency || "شيكل"],
            ["الحالة:", statusLabels[invoice.status] || invoice.status],
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", padding: "3px 0",
              borderBottom: "1px solid #F1F5F9", fontSize: "10px",
            }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>{row![0]}</span>
              <span style={{ color: "#1a1a1a" }}>{row![1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━ Items Table ━━ */}
      <div style={{ margin: "0 20px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ background: color, color: "white" }}>
              {["#", "الصنف/الوصف", "الكمية", "الوحدة", "سعر الوحدة", "الخصم", "ض%", "الإجمالي"].map((h, i) => (
                <th key={i} style={{
                  padding: "9px 8px", textAlign: i === 1 ? "right" : "center",
                  fontWeight: 600, fontSize: "9.5px",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.items.filter(i => i.description?.trim()).map((item, i) => {
              const calc = calcItem(item);
              return (
                <tr key={i} style={{
                  background: i % 2 === 0 ? "white" : "#F8FAFC",
                  borderBottom: "1px solid #E2E8F0",
                }}>
                  <td style={{ padding: "8px", textAlign: "center", color: "#64748b", fontSize: "9px" }}>{i + 1}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{item.description}</td>
                  <td style={{ padding: "8px", textAlign: "center" }}>{Math.abs(item.quantity)}</td>
                  <td style={{ padding: "8px", textAlign: "center", color: "#64748b", fontSize: "9px" }}>قطعة</td>
                  <td style={{ padding: "8px", textAlign: "center" }}>{fmtAmount(item.unitPrice, currencySymbol)}</td>
                  <td style={{ padding: "8px", textAlign: "center", color: item.discount ? "#DC2626" : "#64748b" }}>
                    {item.discount ? fmtAmount(item.discount, currencySymbol) : "—"}
                  </td>
                  <td style={{ padding: "8px", textAlign: "center", color: item.taxRate ? "#1D4ED8" : "#64748b" }}>
                    {item.taxRate ? `${item.taxRate}%` : "—"}
                  </td>
                  <td style={{ padding: "8px", textAlign: "center", fontWeight: 700, color }}>
                    {fmtAmount(Math.abs(calc.total), currencySymbol)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ━━ Totals ━━ */}
      <div style={{ display: "flex", justifyContent: "flex-start", margin: "12px 20px" }}>
        <div style={{ minWidth: "260px", border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden" }}>
          {[
            { label: "المجموع قبل الضريبة", value: totals.subtotal, textColor: "#374151" },
            totals.totalDiscount > 0 ? { label: "إجمالي الخصم", value: totals.totalDiscount, textColor: "#DC2626", prefix: "-" } : null,
            totals.totalTax > 0 ? { label: "ضريبة القيمة المضافة", value: totals.totalTax, textColor: "#1D4ED8" } : null,
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", padding: "8px 14px",
              background: i % 2 === 0 ? "white" : "#F8FAFC",
              borderBottom: "1px solid #E2E8F0", fontSize: "10px",
            }}>
              <span style={{ color: "#64748b" }}>{row!.label}</span>
              <span style={{ fontWeight: 600, color: row!.textColor }}>
                {row!.prefix || ""}{fmtAmount(row!.value, currencySymbol)}
              </span>
            </div>
          ))}
          {/* Grand Total */}
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "12px 14px",
            background: color, color: "white",
          }}>
            <span style={{ fontWeight: 700 }}>الإجمالي النهائي</span>
            <span style={{ fontWeight: 800, fontSize: "14px", color: gold }}>
              {fmtAmount(totals.grand, currencySymbol)}
            </span>
          </div>
          {/* Amount in words */}
          {settings.invoice_show_amount_words && (
            <div style={{
              padding: "8px 14px", background: "#F8FAFC", fontSize: "9px",
              color: "#374151", fontStyle: "italic", borderTop: "1px solid #E2E8F0",
            }}>
              فقط: {numberToArabicWords(totals.grand)} {invoice.currency === "دولار" ? "دولار" : invoice.currency === "دينار" ? "دينار" : "شيكل"} لا غير
            </div>
          )}
        </div>
      </div>

      {/* ━━ Payment Status ━━ */}
      {invoice.remainingAmount > 0 && (
        <div style={{ margin: "0 20px 12px", padding: "8px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", fontSize: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#991B1B", fontWeight: 600 }}>المبلغ المتبقي</span>
            <span style={{ color: "#DC2626", fontWeight: 700 }}>{fmtAmount(invoice.remainingAmount, currencySymbol)}</span>
          </div>
        </div>
      )}

      {/* ━━ Bank Details ━━ */}
      {settings.show_bank_on_invoice && (
        <div style={{ margin: "0 20px 8px", padding: "8px 14px", fontSize: "9px", color: "#64748b", border: "1px solid #E2E8F0", borderRadius: "6px" }}>
          🏦 {settings.bank_name || "البنك"} — {settings.bank_branch || "الفرع"} — حساب {settings.bank_account || "—"}
        </div>
      )}

      {/* ━━ Signatures ━━ */}
      {settings.invoice_show_signature && (
        <div style={{
          margin: "12px 20px", padding: "16px", display: "flex", justifyContent: "space-between",
          borderTop: "1px solid #E2E8F0",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: "120px", borderBottom: "1px dashed #CBD5E1", marginBottom: "6px" }} />
            <p style={{ fontSize: "9px", color: "#94a3b8" }}>توقيع المستلم</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: "120px", borderBottom: "1px dashed #CBD5E1", marginBottom: "6px" }} />
            <p style={{ fontSize: "9px", color: "#94a3b8" }}>التوقيع والختم</p>
          </div>
        </div>
      )}

      {/* ━━ Footer ━━ */}
      {(settings.invoice_footer_message || settings.invoice_footer) && (
        <div style={{
          padding: "10px 20px", textAlign: "center", fontSize: "8px", color: "#94a3b8",
          borderTop: "1px solid #E2E8F0", background: `${color}08`,
        }}>
          {settings.invoice_footer_message || settings.invoice_footer}
        </div>
      )}

      {/* ━━ Notes ━━ */}
      {invoice.notes && (
        <div style={{
          margin: "8px 20px 16px", padding: "10px 14px", background: "#F8FAFC",
          borderRadius: "6px", fontSize: "9px", color: "#374151", border: "1px solid #E2E8F0",
        }}>
          <strong>ملاحظات:</strong> {invoice.notes}
        </div>
      )}
    </div>
  );
};

export default InvoiceDocumentPreview;
