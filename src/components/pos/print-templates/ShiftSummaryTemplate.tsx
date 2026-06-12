/**
 * Shift Summary Print Template — 80mm (576px) thermal printer.
 * Font: Tahoma for connected Arabic ligatures on thermal printers.
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
const FONT = "'Tahoma', 'Arial', sans-serif";

function currencySymbol(cur: string) {
  if (cur === "ILS") return "₪";
  if (cur === "USD") return "$";
  if (cur === "JOD") return "د.ا";
  if (cur === "EUR") return "€";
  return cur;
}

function formatCur(amount: number, cur: string) {
  if (cur === "JOD") return `${amount.toFixed(2)} د.ا`;
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
  credit: "اجل",
  employee_account: "حساب موظف",
};

const ShiftSummaryTemplate = forwardRef<HTMLDivElement, { data: ShiftSummaryPrintData }>(({ data }, ref) => {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const variancePrefix = data.variance > 0 ? "⚠️ فائض" : data.variance < 0 ? "⚠️ عجز" : "✅ مطابق";
  const pmb = data.paymentMethodBreakdown || {};
  const cb = data.currencyBreakdown || {};

  const nonCashMethods = ["card", "credit", "employee_account"].filter(m => {
    const amounts = pmb[m] || {};
    return Object.values(amounts).some(v => v > 0);
  });

  return (
    <div ref={ref} style={{
      width: '576px',
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: FONT,
      fontSize: '15px',
      fontWeight: 700,
      lineHeight: '1.5',
      padding: '24px 28px',
      position: 'absolute',
      left: '-9999px',
      top: 0,
      direction: 'rtl',
    }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        {data.logoUrl && (
          <img src={data.logoUrl} alt="" style={{ maxWidth: '160px', maxHeight: '90px', margin: '0 auto 6px', display: 'block' }} />
        )}
        <div style={{ fontSize: '14px', color: '#000', fontWeight: 800 }}>{data.terminalName}</div>
        <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />
        <div style={{ fontSize: '20px', fontWeight: 900, color: '#000' }}>📋 ملخص تسليم العهدة</div>
      </div>

      {/* ═══ META ═══ */}
      <div style={{ borderTop: '1px solid #333', margin: '14px 0 12px' }} />
      <Row label="الكاشير" value={data.cashierName} />
      {data.cashBoxName && <Row label="الصندوق" value={data.cashBoxName} />}
      <Row label="وقت الفتح" value={`${formatDate(data.openedAt)} ${formatTime(data.openedAt)}`} />
      <Row label="وقت الاغلاق" value={`${formatDate(data.closedAt)} ${formatTime(data.closedAt)}`} />

      <div style={{ borderTop: '1px dashed #333', margin: '16px 0 12px' }} />

      {/* ═══ SESSION DETAILS ═══ */}
      <SectionTitle text="تفاصيل الوردية" />
      <Row label="النقدية الافتتاحية" value={`₪${data.openingCash.toFixed(2)}`} bold />
      <Row label="اجمالي المبيعات" value={`₪${data.totalSales.toFixed(2)}`} bold />
      {(data.totalExpenses || 0) > 0 && (
        <Row label="مصروفات من الصندوق" value={`-₪${(data.totalExpenses || 0).toFixed(2)}`} />
      )}
      <Row label="عدد الطلبات" value={String(data.totalOrders)} />

      {/* ═══ CURRENCY BREAKDOWN ═══ */}
      {Object.keys(cb).length > 0 && (
        <>
          <div style={{ borderTop: '1px dashed #333', margin: '16px 0 12px' }} />
          <SectionTitle text="تفاصيل العملات المقبوضة" />
          {Object.entries(cb).map(([cur, info]) => (
            <Row key={cur} label={`${currencyLabel(cur)} (${info.count} طلب)`} value={formatCur(info.sales, cur)} />
          ))}
        </>
      )}

      {/* ═══ NON-CASH METHODS ═══ */}
      {nonCashMethods.length > 0 && (
        <>
          <div style={{ borderTop: '1px dashed #333', margin: '16px 0 12px' }} />
          <SectionTitle text="مبيعات غير نقدية" />
          {nonCashMethods.map(method => {
            const amounts = pmb[method] || {};
            return CURRENCIES.filter(c => (amounts[c] || 0) > 0).map(c => (
              <Row key={`${method}-${c}`} label={`${METHOD_LABELS[method] || method} (${currencyLabel(c)})`} value={formatCur(amounts[c], c)} />
            ));
          })}
        </>
      )}

      <div style={{ borderTop: '1px solid #000', margin: '18px 0 12px' }} />

      {/* ═══ CASH DELIVERY ═══ */}
      <SectionTitle text="تسليم النقدية" />

      {/* ILS */}
      <Row label="المتوقع (شيكل)" value={`₪${data.expectedCash.toFixed(2)}`} bold large />
      <Row label="المسلّم (شيكل)" value={`₪${data.closingCash.toFixed(2)}`} bold large />
      {data.varianceILS !== undefined && data.varianceILS !== 0 && (
        <Row label={`${(data.varianceILS || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (شيكل)`} value={`₪${Math.abs(data.varianceILS || 0).toFixed(2)}`} bold />
      )}

      {/* USD */}
      {((data.expectedCashUSD || 0) > 0 || (data.closingCashUSD || 0) > 0) && (
        <>
          <div style={{ borderTop: '1px dashed #333', margin: '6px 0' }} />
          <Row label="المتوقع (دولار)" value={`$${(data.expectedCashUSD || 0).toFixed(2)}`} bold />
          <Row label="المسلّم (دولار)" value={`$${(data.closingCashUSD || 0).toFixed(2)}`} />
          {data.varianceUSD !== undefined && data.varianceUSD !== 0 && (
            <Row label={`${(data.varianceUSD || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (دولار)`} value={`$${Math.abs(data.varianceUSD || 0).toFixed(2)}`} bold />
          )}
        </>
      )}

      {/* JOD */}
      {((data.expectedCashJOD || 0) > 0 || (data.closingCashJOD || 0) > 0) && (
        <>
          <div style={{ borderTop: '1px dashed #333', margin: '6px 0' }} />
          <Row label="المتوقع (دينار)" value={`${(data.expectedCashJOD || 0).toFixed(2)} د.ا`} bold />
          <Row label="المسلّم (دينار)" value={`${(data.closingCashJOD || 0).toFixed(2)} د.ا`} />
          {data.varianceJOD !== undefined && data.varianceJOD !== 0 && (
            <Row label={`${(data.varianceJOD || 0) > 0 ? '⬆ فائض' : '⬇ عجز'} (دينار)`} value={`${Math.abs(data.varianceJOD || 0).toFixed(2)} د.ا`} bold />
          )}
        </>
      )}

      {/* ═══ TOTAL VARIANCE — no border, no box, no background (per request) ═══ */}
      <div style={{
        textAlign: 'center',
        padding: '14px 4px 4px',
        margin: '12px 0 0',
        fontWeight: 900,
        fontSize: '22px',
        lineHeight: 1.4,
        color: '#000',
        wordBreak: 'break-word',
        border: 'none',
        background: 'transparent',
      }}>
        {variancePrefix}: ₪{Math.abs(data.variance).toFixed(2)}
      </div>

      {/* ═══ SIGNATURE ═══ */}
      <div style={{ marginTop: '16px', fontSize: '14px', color: '#000', fontWeight: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <span>توقيع الكاشير: _____________</span>
          <span>توقيع المسؤول: _____________</span>
        </div>
      </div>

      <div style={{ height: '16px' }} />
    </div>
  );
});

ShiftSummaryTemplate.displayName = 'ShiftSummaryTemplate';

function Row({ label, value, bold, large }: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '2px 0',
      fontSize: large ? '24px' : '20px',
      lineHeight: 1.2,
      color: '#000',
      fontWeight: bold ? 900 : 700,
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 900 : 800, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  // No underline — the section divider already lives above the title with
  // a comfortable margin so the rule never sits on top of the text.
  return (
    <div style={{
      fontSize: '24px', fontWeight: 900, color: '#000',
      textAlign: 'center', margin: '4px 0 8px',
      lineHeight: 1.2,
    }}>
      {text}
    </div>
  );
}

export default ShiftSummaryTemplate;
