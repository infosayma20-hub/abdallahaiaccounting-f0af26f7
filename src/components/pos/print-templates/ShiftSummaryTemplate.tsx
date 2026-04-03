/**
 * Shift Summary Print Template — 80mm (576px) thermal printer.
 * Mirrors ShiftSummaryReceipt dialog layout exactly.
 */
import { forwardRef } from "react";

interface CurrencyBreakdown {
  [key: string]: { sales: number; count: number };
}

type PaymentMethodBreakdown = Record<string, Record<string, number>>;

export interface ShiftSummaryPrintData {
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
  currencyBreakdown?: CurrencyBreakdown;
  paymentMethodBreakdown?: PaymentMethodBreakdown;
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

const ShiftSummaryTemplate = forwardRef<HTMLDivElement, { data: ShiftSummaryPrintData }>(({ data }, ref) => {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });

  const varianceType = data.variance > 0 ? "فائض" : data.variance < 0 ? "عجز" : "مطابق";
  const pmb = data.paymentMethodBreakdown || {};
  const cb = data.currencyBreakdown || {};

  const nonCashMethods = ["card", "credit", "employee_account"].filter(m => {
    const amounts = pmb[m] || {};
    return Object.values(amounts).some(v => v > 0);
  });

  const S = {
    container: {
      width: '576px',
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: "'Arial', 'Tahoma', 'Cairo', sans-serif",
      fontSize: '13px',
      fontWeight: 600 as const,
      lineHeight: '1.4',
      padding: '20px 24px',
      position: 'absolute' as const,
      left: '-9999px',
      top: 0,
      direction: 'rtl' as const,
    },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '13px', color: '#000', fontWeight: 700 } as React.CSSProperties,
    amountStyle: { fontWeight: 800, fontVariantNumeric: 'tabular-nums' } as React.CSSProperties,
    sectionTitle: { fontSize: '12px', fontWeight: 900, letterSpacing: '0.5px', color: '#000', textAlign: 'center' as const, margin: '6px 0 4px', borderBottom: '1px solid #333', paddingBottom: '4px' },
    dashed: { border: 'none', borderTop: '1px dashed #333', margin: '6px 0' } as React.CSSProperties,
    hrBold: { border: 'none', borderTop: '2px solid #000', margin: '8px 0' } as React.CSSProperties,
  };

  return (
    <div ref={ref} style={S.container}>

      {/* ═══ HEADER ═══ */}
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <img src={data.logoUrl || '/images/malaky-logo.png'} alt="" style={{ maxWidth: '140px', maxHeight: '80px', margin: '0 auto 4px', display: 'block' }} />
        <div style={{ fontSize: '20px', fontWeight: 900, color: '#000' }}>{data.companyName}</div>
        <div style={{ fontSize: '12px', color: '#000', fontWeight: 700 }}>{data.terminalName}</div>
        <hr style={S.hrBold} />
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#000' }}>📋 ملخص تسليم العهدة</div>
      </div>

      {/* ═══ META ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#000', fontWeight: 700, marginBottom: '4px' }}>
        <span>الكاشير: {data.cashierName}</span>
        {data.cashBoxName && <span>الصندوق: {data.cashBoxName}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#000', fontWeight: 700, marginBottom: '8px' }}>
        <span>الفتح: {formatDate(data.openedAt)} {formatTime(data.openedAt)}</span>
        <span>الإغلاق: {formatDate(data.closedAt)} {formatTime(data.closedAt)}</span>
      </div>

      <hr style={S.dashed} />

      {/* ═══ SESSION DETAILS ═══ */}
      <div style={S.sectionTitle}>تفاصيل الوردية</div>
      <div style={S.row}>
        <span>النقدية الافتتاحية</span>
        <span style={S.amountStyle}>₪{data.openingCash.toFixed(2)}</span>
      </div>
      <div style={S.row}>
        <span>إجمالي المبيعات</span>
        <span style={S.amountStyle}>₪{data.totalSales.toFixed(2)}</span>
      </div>
      {(data.totalExpenses || 0) > 0 && (
        <div style={S.row}>
          <span>مصروفات من الصندوق</span>
          <span style={S.amountStyle}>-₪{(data.totalExpenses || 0).toFixed(2)}</span>
        </div>
      )}
      <div style={S.row}>
        <span>عدد الطلبات</span>
        <span style={{ fontWeight: 600 }}>{data.totalOrders}</span>
      </div>

      {/* ═══ CURRENCY BREAKDOWN ═══ */}
      {Object.keys(cb).length > 0 && (
        <>
          <hr style={S.dashed} />
          <div style={S.sectionTitle}>تفاصيل العملات المقبوضة</div>
          {Object.entries(cb).map(([cur, info]) => (
            <div key={cur} style={{ ...S.row, fontSize: '12px' }}>
              <span>{currencyLabel(cur)} ({info.count} طلب)</span>
              <span style={S.amountStyle}>{formatCur(info.sales, cur)}</span>
            </div>
          ))}
        </>
      )}

      {/* ═══ NON-CASH METHODS ═══ */}
      {nonCashMethods.length > 0 && (
        <>
          <hr style={S.dashed} />
          <div style={S.sectionTitle}>مبيعات غير نقدية</div>
          {nonCashMethods.map(method => {
            const amounts = pmb[method] || {};
            return CURRENCIES.filter(c => (amounts[c] || 0) > 0).map(c => (
              <div key={`${method}-${c}`} style={{ ...S.row, fontSize: '12px' }}>
                <span>{METHOD_LABELS[method] || method} ({currencyLabel(c)})</span>
                <span style={S.amountStyle}>{formatCur(amounts[c], c)}</span>
              </div>
            ));
          })}
        </>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '6px 0' }} />

      {/* ═══ CASH DELIVERY ═══ */}
      <div style={S.sectionTitle}>تسليم النقدية</div>

      {/* ILS */}
      <div style={{ ...S.row, fontSize: '14px', fontWeight: 900 }}>
        <span>المتوقع (شيكل)</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₪{data.expectedCash.toFixed(2)}</span>
      </div>
      <div style={{ ...S.row, fontSize: '14px', fontWeight: 900 }}>
        <span>المسلّم (شيكل)</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₪{data.closingCash.toFixed(2)}</span>
      </div>
      {data.varianceILS !== undefined && data.varianceILS !== 0 && (
        <div style={{ ...S.row, fontSize: '13px', fontWeight: 900 }}>
          <span>{(data.varianceILS || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (شيكل)</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>₪{Math.abs(data.varianceILS || 0).toFixed(2)}</span>
        </div>
      )}

      {/* USD */}
      {((data.expectedCashUSD || 0) > 0 || (data.closingCashUSD || 0) > 0) && (
        <>
          <hr style={{ border: 'none', borderTop: '1px dashed #333', margin: '4px 0' }} />
          <div style={{ ...S.row, fontSize: '13px', fontWeight: 800 }}>
            <span>المتوقع (دولار)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>${(data.expectedCashUSD || 0).toFixed(2)}</span>
          </div>
          <div style={S.row}>
            <span>المسلّم (دولار)</span>
            <span style={S.amountStyle}>${(data.closingCashUSD || 0).toFixed(2)}</span>
          </div>
          {data.varianceUSD !== undefined && data.varianceUSD !== 0 && (
            <div style={{ ...S.row, fontSize: '12px', fontWeight: 900 }}>
              <span>{(data.varianceUSD || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (دولار)</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>${Math.abs(data.varianceUSD || 0).toFixed(2)}</span>
            </div>
          )}
        </>
      )}

      {/* JOD */}
      {((data.expectedCashJOD || 0) > 0 || (data.closingCashJOD || 0) > 0) && (
        <>
          <hr style={{ border: 'none', borderTop: '1px dashed #333', margin: '4px 0' }} />
          <div style={{ ...S.row, fontSize: '13px', fontWeight: 800 }}>
            <span>المتوقع (دينار)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(data.expectedCashJOD || 0).toFixed(2)} د.أ</span>
          </div>
          <div style={S.row}>
            <span>المسلّم (دينار)</span>
            <span style={S.amountStyle}>{(data.closingCashJOD || 0).toFixed(2)} د.أ</span>
          </div>
          {data.varianceJOD !== undefined && data.varianceJOD !== 0 && (
            <div style={{ ...S.row, fontSize: '12px', fontWeight: 900 }}>
              <span>{(data.varianceJOD || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (دينار)</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.abs(data.varianceJOD || 0).toFixed(2)} د.أ</span>
            </div>
          )}
        </>
      )}

      <hr style={S.hrBold} />

      {/* ═══ TOTAL VARIANCE ═══ */}
      <div style={{
        textAlign: 'center',
        padding: '10px',
        borderRadius: '6px',
        margin: '8px 0',
        fontWeight: 900,
        fontSize: '18px',
        background: '#eee',
        color: '#000',
        border: '2px solid #000',
      }}>
        {varianceType}: ₪{Math.abs(data.variance).toFixed(2)}
      </div>

      <hr style={S.dashed} />

      {/* ═══ SIGNATURE ═══ */}
      <div style={{ marginTop: '12px', fontSize: '11px', color: '#000', fontWeight: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span>توقيع الكاشير: _____________</span>
          <span>توقيع المسؤول: _____________</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '10px', color: '#000', fontWeight: 600, lineHeight: 1.8 }}>
        هذا المستند صادر آلياً من النظام
        <br />
        Powered by AMWALI
      </div>

      <div style={{ height: '10px' }} />
    </div>
  );
});

ShiftSummaryTemplate.displayName = 'ShiftSummaryTemplate';

export default ShiftSummaryTemplate;
