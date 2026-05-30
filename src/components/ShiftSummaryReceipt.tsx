import { useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, CheckCircle } from "lucide-react";
import { sendToBridge } from "@/lib/print-bridge-client";
import { printShiftSummaryImage } from "@/lib/image-print-service";
import type { PrintOrder } from "@/hooks/usePrintBridge";

interface CurrencyBreakdown {
  [key: string]: { sales: number; count: number };
}

// payment method -> currency -> amount
 type PaymentMethodBreakdown = Record<string, Record<string, number>>;

interface ShiftSummaryData {
  companyName: string;
  logoUrl?: string;
  terminalName: string;
  cashierName: string;
  cashBoxName?: string;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  totalSales: number;
  totalExpenses?: number;
  totalOrders: number;
  closingCash: number;
  closingCashUSD?: number;
  closingCashJOD?: number;
  expectedCash: number;
  expectedCashUSD?: number;
  expectedCashJOD?: number;
  variance: number;
  varianceILS?: number;
  varianceUSD?: number;
  varianceJOD?: number;
  sessionId: string;
  currencyBreakdown?: CurrencyBreakdown;
  paymentMethodBreakdown?: PaymentMethodBreakdown;
  exchangeRates?: Record<string, number>;
}

interface ShiftSummaryReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShiftSummaryData | null;
  /**
   * When true (default false), hides expected-cash rows, currency breakdown,
   * and non-cash payment-method breakdown. The total variance box stays visible
   * read-only so the cashier sees only the final difference.
   */
  cashierMode?: boolean;
}

const CURRENCIES = ["ILS", "USD", "JOD"] as const;

function currencySymbol(cur: string) {
  if (cur === "ILS") return "₪";
  if (cur === "USD") return "$";
  if (cur === "JOD") return "د.أ";
  if (cur === "EUR") return "€";
  return cur;
}

function formatCur(amount: number, cur: string) {
  if (cur === "JOD") return `${amount.toFixed(2)} د.أ`;
  return `${currencySymbol(cur)}${amount.toFixed(2)}`;
}

function currencyLabel(cur: string) {
  if (cur === "ILS") return "شيكل";
  if (cur === "USD") return "دولار";
  if (cur === "JOD") return "دينار";
  if (cur === "EUR") return "يورو";
  return cur;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة / فيزا",
  credit: "آجل",
  employee_account: "حساب موظف",
};

const shiftSummaryPrintStyles = `
  body { font-size: 11px; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .divider { border: none; border-top: 1px solid #e0e0e0; margin: 6px 0; }
  .divider-bold { border: none; border-top: 2px solid #1a1a1a; margin: 8px 0; }
  .divider-dashed { border: none; border-top: 1px dashed #ccc; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; }
  .company-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
  .terminal-name { font-size: 10px; color: #64748b; font-weight: 500; }
  .meta-text { font-size: 9px; color: #94a3b8; }
  .section-title { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #94a3b8; text-align: center; margin: 6px 0 4px; }
  .total-label { font-size: 13px; font-weight: 700; color: #0f172a; }
  .total-amount { font-size: 18px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
  .summary-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; color: #475569; }
  .summary-row .amount { font-variant-numeric: tabular-nums; font-weight: 600; }
  .variance-box { text-align: center; padding: 8px; border-radius: 6px; margin: 8px 0; font-weight: 700; font-size: 14px; }
  .footer-text { font-size: 9px; color: #94a3b8; text-align: center; line-height: 1.6; }
`;

export default function ShiftSummaryReceipt({ open, onOpenChange, data, cashierMode = false }: ShiftSummaryReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const autoPrintDone = useRef(false);

  const printSummary = () => {
    if (!data) return;
    const payload: any = {
      companyName: data.companyName,
      logoUrl: data.logoUrl,
      terminalName: data.terminalName,
      cashierName: data.cashierName,
      cashBoxName: data.cashBoxName,
      openedAt: data.openedAt,
      closedAt: data.closedAt,
      openingCash: data.openingCash,
      totalSales: data.totalSales,
      totalExpenses: data.totalExpenses,
      totalOrders: data.totalOrders,
      closingCash: data.closingCash,
      closingCashUSD: data.closingCashUSD,
      closingCashJOD: data.closingCashJOD,
      // Cashier mode: hide expected/breakdowns, keep only total variance
      expectedCash: cashierMode ? data.closingCash : data.expectedCash,
      expectedCashUSD: cashierMode ? (data.closingCashUSD || 0) : data.expectedCashUSD,
      expectedCashJOD: cashierMode ? (data.closingCashJOD || 0) : data.expectedCashJOD,
      variance: data.variance,
      varianceILS: cashierMode ? undefined : data.varianceILS,
      varianceUSD: cashierMode ? undefined : data.varianceUSD,
      varianceJOD: cashierMode ? undefined : data.varianceJOD,
      currencyBreakdown: cashierMode ? undefined : data.currencyBreakdown,
      paymentMethodBreakdown: cashierMode ? undefined : data.paymentMethodBreakdown,
    };
    printShiftSummaryImage(payload).catch(() => {
      console.warn("Print bridge unavailable");
    });
  };

  useEffect(() => {
    if (open && data && !autoPrintDone.current) {
      autoPrintDone.current = true;
      const timer = setTimeout(() => {
        printSummary();
      }, 600);
      return () => clearTimeout(timer);
    }
    if (!open) autoPrintDone.current = false;
  }, [open, data]);

  if (!data) return null;

  const varianceType = data.variance > 0 ? "فائض" : data.variance < 0 ? "عجز" : "مطابق";
  const varianceColor = data.variance > 0 ? "#16a34a" : data.variance < 0 ? "#dc2626" : "#475569";
  const pmb = data.paymentMethodBreakdown || {};
  const cb = data.currencyBreakdown || {};

  // Helper: get amounts for a payment method across currencies, only show if > 0
  const getMethodCurrencies = (method: string) => {
    const amounts = pmb[method] || {};
    return CURRENCIES.filter(c => (amounts[c] || 0) > 0).map(c => ({ cur: c, amount: amounts[c] }));
  };

  // Expected per currency: cash sales per currency
  const cashMethodAmounts = pmb["cash"] || {};

  const handlePrint = () => {
    printSummary();
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });

  const rowStyle = { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, color: "#000", fontWeight: 700 } as const;
  const amountStyle = { fontWeight: 800 as const, fontVariantNumeric: "tabular-nums" as const };
  const sectionTitle = { fontSize: 12, fontWeight: 900, letterSpacing: 0.5, color: "#000", textAlign: "center" as const, margin: "6px 0 4px", borderBottom: "1px solid #333", paddingBottom: 4 };
  const dashed = { border: "none", borderTop: "1px dashed #333", margin: "6px 0" };

  // Non-cash methods to display
  const nonCashMethods = ["card", "credit", "employee_account"].filter(m => {
    const amounts = pmb[m] || {};
    return Object.values(amounts).some(v => v > 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
        <div className="bg-primary p-4 text-center">
          <CheckCircle className="h-8 w-8 text-primary-foreground mx-auto mb-1" />
          <DialogHeader>
            <DialogTitle className="text-primary-foreground text-lg">تم إغلاق الوردية بنجاح</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
           <div
            ref={receiptRef}
            className="bg-white text-black rounded-xl border p-5 text-sm"
            style={{ fontFamily: "'Arial', 'Tahoma', sans-serif", direction: "rtl", color: "#000", fontWeight: 600 }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              {data.logoUrl && (
                <img src={data.logoUrl} alt={data.companyName} style={{ maxWidth: "120px", maxHeight: "60px", margin: "0 auto 4px", display: "block" }} />
              )}
              <div style={{ fontSize: 20, fontWeight: 900, color: "#000" }}>{data.companyName}</div>
              <div style={{ fontSize: 12, color: "#000", fontWeight: 700 }}>{data.terminalName}</div>
              <hr style={{ border: "none", borderTop: "2px solid #000", margin: "8px 0" }} />
              <div style={{ fontSize: 14, fontWeight: 900, color: "#000" }}>📋 ملخص تسليم العهدة</div>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#000", fontWeight: 700, marginBottom: 4 }}>
              <span>الكاشير: {data.cashierName}</span>
              {data.cashBoxName && <span>الصندوق: {data.cashBoxName}</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#000", fontWeight: 700, marginBottom: 8 }}>
              <span>الفتح: {formatDate(data.openedAt)} {formatTime(data.openedAt)}</span>
              <span>الإغلاق: {formatDate(data.closedAt)} {formatTime(data.closedAt)}</span>
            </div>

            <hr style={dashed} />

            {/* Session Details */}
            <div style={sectionTitle}>تفاصيل الوردية</div>
            <div style={rowStyle}>
              <span>النقدية الافتتاحية</span>
              <span style={amountStyle}>₪{data.openingCash.toFixed(2)}</span>
            </div>
            <div style={rowStyle}>
              <span>إجمالي المبيعات</span>
              <span style={{ ...amountStyle, color: "#000" }}>₪{data.totalSales.toFixed(2)}</span>
            </div>
            {(data.totalExpenses || 0) > 0 && (
              <div style={rowStyle}>
                <span>مصروفات من الصندوق</span>
                <span style={{ ...amountStyle, color: "#000" }}>-₪{(data.totalExpenses || 0).toFixed(2)}</span>
              </div>
            )}
            <div style={rowStyle}>
              <span>عدد الطلبات</span>
              <span style={{ fontWeight: 600 }}>{data.totalOrders}</span>
            </div>

            {/* Currency Breakdown */}
            {Object.keys(cb).length > 0 && (
              <>
                <hr style={dashed} />
                <div style={sectionTitle}>تفاصيل العملات المقبوضة</div>
                {Object.entries(cb).map(([cur, info]) => (
                  <div key={cur} style={{ ...rowStyle, fontSize: 12 }}>
                    <span>{currencyLabel(cur)} ({info.count} طلب)</span>
                    <span style={amountStyle}>{formatCur(info.sales, cur)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Non-cash payment methods */}
            {nonCashMethods.length > 0 && (
              <>
                <hr style={dashed} />
                <div style={sectionTitle}>مبيعات غير نقدية</div>
                {nonCashMethods.map(method => {
                  const currencies = getMethodCurrencies(method);
                  return currencies.map(({ cur, amount }) => (
                    <div key={`${method}-${cur}`} style={{ ...rowStyle, fontSize: 12 }}>
                      <span>{METHOD_LABELS[method] || method} ({currencyLabel(cur)})</span>
                      <span style={amountStyle}>{formatCur(amount, cur)}</span>
                    </div>
                  ));
                })}
              </>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #333", margin: "6px 0" }} />

            {/* Expected Cash (3 currencies) */}
            <div style={sectionTitle}>تسليم النقدية</div>

            {/* ILS row: expected / delivered / variance */}
            <div style={{ ...rowStyle, fontSize: 14, fontWeight: 900, color: "#000" }}>
              <span>المتوقع (شيكل)</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{data.expectedCash.toFixed(2)}</span>
            </div>
            <div style={{ ...rowStyle, fontSize: 14, fontWeight: 900, color: "#000" }}>
              <span>المسلّم (شيكل)</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{data.closingCash.toFixed(2)}</span>
            </div>
            {(data.varianceILS !== undefined && data.varianceILS !== 0) && (
              <div style={{ ...rowStyle, fontSize: 13, fontWeight: 900, color: "#000" }}>
                <span>{(data.varianceILS || 0) > 0 ? "⬆ فائض" : "⬇ عجز"} (شيكل)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{Math.abs(data.varianceILS || 0).toFixed(2)}</span>
              </div>
            )}

            {/* USD row: expected / delivered / variance */}
            {((data.expectedCashUSD || 0) > 0 || (data.closingCashUSD || 0) > 0) && (
              <>
                <hr style={{ border: "none", borderTop: "1px dashed #333", margin: "4px 0" }} />
                <div style={{ ...rowStyle, fontSize: 13, fontWeight: 800, color: "#000" }}>
                  <span>المتوقع (دولار)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>${(data.expectedCashUSD || 0).toFixed(2)}</span>
                </div>
                <div style={rowStyle}>
                  <span>المسلّم (دولار)</span>
                  <span style={amountStyle}>${(data.closingCashUSD || 0).toFixed(2)}</span>
                </div>
                {(data.varianceUSD !== undefined && data.varianceUSD !== 0) && (
                  <div style={{ ...rowStyle, fontSize: 12, fontWeight: 900, color: "#000" }}>
                    <span>{(data.varianceUSD || 0) > 0 ? "⬆ فائض" : "⬇ عجز"} (دولار)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>${Math.abs(data.varianceUSD || 0).toFixed(2)}</span>
                  </div>
                )}
              </>
            )}

            {/* JOD row: expected / delivered / variance */}
            {((data.expectedCashJOD || 0) > 0 || (data.closingCashJOD || 0) > 0) && (
              <>
                <hr style={{ border: "none", borderTop: "1px dashed #333", margin: "4px 0" }} />
                <div style={{ ...rowStyle, fontSize: 13, fontWeight: 800, color: "#000" }}>
                  <span>المتوقع (دينار)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{(data.expectedCashJOD || 0).toFixed(2)} د.أ</span>
                </div>
                <div style={rowStyle}>
                  <span>المسلّم (دينار)</span>
                  <span style={amountStyle}>{(data.closingCashJOD || 0).toFixed(2)} د.أ</span>
                </div>
                {(data.varianceJOD !== undefined && data.varianceJOD !== 0) && (
                  <div style={{ ...rowStyle, fontSize: 12, fontWeight: 900, color: "#000" }}>
                    <span>{(data.varianceJOD || 0) > 0 ? "⬆ فائض" : "⬇ عجز"} (دينار)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.abs(data.varianceJOD || 0).toFixed(2)} د.أ</span>
                  </div>
                )}
              </>
            )}

            <hr style={{ border: "none", borderTop: "2px solid #000", margin: "8px 0" }} />

            {/* Total Variance */}
            <div style={{
              textAlign: "center",
              padding: 10,
              borderRadius: 6,
              margin: "8px 0",
              fontWeight: 900,
              fontSize: 18,
              background: "#eee",
              color: "#000",
              border: "2px solid #000",
            }}>
              {varianceType}: ₪{Math.abs(data.variance).toFixed(2)}
            </div>

            <hr style={dashed} />

            {/* Signature */}
            <div style={{ marginTop: 12, fontSize: 11, color: "#000", fontWeight: 700 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <span>توقيع الكاشير: _____________</span>
                <span>توقيع المسؤول: _____________</span>
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: 10, color: "#000", fontWeight: 600, lineHeight: 1.8 }}>
              هذا المستند صادر آلياً من النظام
              <br />
              Powered by AMWALI
            </div>
          </div>
        </div>

        {/* Actions - always visible */}
        <div className="flex gap-2 p-4 border-t bg-background shrink-0">
          <Button onClick={handlePrint} className="flex-1 gap-2" variant="outline">
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1 gap-2">
            <CheckCircle className="h-4 w-4" />
            تم
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
