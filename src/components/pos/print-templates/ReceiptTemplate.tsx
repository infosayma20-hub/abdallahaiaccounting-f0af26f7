/**
 * Receipt Template — Full-size customer invoice for 80mm thermal printer.
 * Width: 576px (80mm @ 203 DPI). Uses Tahoma for guaranteed connected Arabic on thermal printers.
 */
import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PrintOrder } from "@/hooks/usePrintBridge";

interface Props {
  order: PrintOrder;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  taxNumber?: string;
  terminalName?: string;
  logoUrl?: string;
  showReturnPolicy?: boolean;
  returnPolicyDays?: number;
}

const currencySymbols: Record<string, string> = {
  ILS: "₪", USD: "$", EUR: "€", JOD: "د.ا", EGP: "ج.م", GBP: "£", TRY: "₺",
  شيكل: "₪", دولار: "$", يورو: "€", دينار: "د.ا", جنيه: "ج.م",
};

/** Base font stack — Tahoma is a system font on Windows with perfect Arabic ligatures */
const FONT = "'Tahoma', 'Arial', sans-serif";

const ReceiptTemplate = forwardRef<HTMLDivElement, Props>(({
  order,
  companyName,
  companyPhone,
  companyAddress,
  taxNumber,
  terminalName,
  logoUrl,
  showReturnPolicy = true,
  returnPolicyDays = 7,
}, ref) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB'); // dd/mm/yyyy
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const qNum = order.queueNumber || order.orderNumber || '---';

  const orderTypeLabel = order.orderType === 'takeaway' ? 'استلام'
    : order.orderType === 'delivery' ? 'توصيل'
    : 'محلي';

  const orderTypeIcon = order.orderType === 'takeaway' ? '🛍️'
    : order.orderType === 'delivery' ? '🚚'
    : '🍽️';

  const paymentLabels: Record<string, string> = {
    'نقد': 'نقد', 'cash': 'نقد', 'نقدي': 'نقد',
    'بطاقة': 'بطاقة', 'card': 'بطاقة',
    'آجل': 'آجل', 'credit': 'آجل',
    'تحويل': 'تحويل', 'transfer': 'تحويل',
    'employee_account': 'حساب موظف',
  };
  const payLabel = paymentLabels[order.paymentMethod || ''] || order.paymentMethod || 'نقد';

  const tenderedCurrSym = currencySymbols[order.currency || 'ILS'] || order.currency || '₪';
  const changeSym = '₪';
  const isCash = !order.paymentMethod || order.paymentMethod === 'cash' || order.paymentMethod === 'نقد' || order.paymentMethod === 'نقدي';

  // QR code content
  const qrContent = [
    companyName || 'مطعم الملكي',
    `طلب: ${qNum}`,
    `المبلغ: ₪${Number(order.total || 0).toFixed(2)}`,
    `التاريخ: ${dateStr} ${timeStr}`,
    taxNumber ? `الرقم الضريبي: ${taxNumber}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div ref={ref} style={{
      width: '576px',
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: FONT,
      fontSize: '16px',
      fontWeight: 700,
      lineHeight: '1.5',
      padding: '24px 28px',
      position: 'absolute',
      left: '-9999px',
      top: 0,
      direction: 'rtl',
    }}>

      {/* ═══ LOGO & COMPANY ═══ */}
      <div style={{ textAlign: 'center', paddingBottom: '8px' }}>
        <img src={logoUrl || '/images/malaky-logo.png'} alt="" style={{ maxWidth: '160px', maxHeight: '90px', margin: '0 auto 6px', display: 'block' }} />
        <div style={{ fontSize: '32px', fontWeight: 900, color: '#000', letterSpacing: '1px', lineHeight: 1.2 }}>
          {companyName || 'مطعم الملكي'}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#333', letterSpacing: '2px', marginTop: '2px' }}>
          MALAKY RESTAURANT
        </div>
        {companyPhone && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#333', marginTop: '2px' }}>
            {companyPhone}
          </div>
        )}
        {companyAddress && (
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#444', marginTop: '1px' }}>
            {companyAddress}
          </div>
        )}
        {taxNumber && (
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#333', marginTop: '2px' }}>
            الرقم الضريبي: {taxNumber}
          </div>
        )}
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '10px 0' }} />

      {/* ═══ INVOICE TITLE ═══ */}
      <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 900, margin: '6px 0' }}>
        فاتورة ضريبية / Tax Invoice
      </div>

      <div style={{ borderTop: '1px solid #333', margin: '8px 0' }} />

      {/* ═══ ORDER META ═══ */}
      <Row label="رقم الطلب" value={String(qNum)} bold large />
      {order.cashier && <Row label="الكاشير" value={order.cashier} />}
      <Row label="نوع الطلب" value={`${orderTypeIcon} ${orderTypeLabel}`} />
      {order.tableNumber && <Row label="الطاولة" value={order.tableNumber} bold />}
      {order.branchName && <Row label="الفرع" value={order.branchName} />}
      <Row label="التاريخ" value={dateStr} />
      <Row label="الوقت" value={timeStr} />
      {terminalName && <Row label="الكاشير" value={terminalName} />}

      <div style={{ borderTop: '2px solid #000', margin: '10px 0' }} />

      {/* ═══ TABLE HEADER ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '6px 0',
        fontSize: '14px', fontWeight: 900, color: '#000',
        borderBottom: '2px solid #000',
      }}>
        <span style={{ flex: 2 }}>الصنف</span>
        <span style={{ flex: 0.8, textAlign: 'center' }}>الكمية</span>
        <span style={{ flex: 1, textAlign: 'center' }}>السعر</span>
        <span style={{ flex: 1, textAlign: 'left' }}>المجموع</span>
      </div>

      {/* ═══ ITEMS ═══ */}
      {(order.items || []).map((item, i) => {
        const qty = item.quantity || 1;
        const lineTotal = (qty * (item.price || 0)).toFixed(2);
        return (
          <div key={i} style={{ padding: '8px 0', borderBottom: i < (order.items || []).length - 1 ? '1px solid #ccc' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ flex: 2, fontSize: '16px', fontWeight: 800, color: '#000', lineHeight: 1.4 }}>{item.name}</span>
              <span style={{ flex: 0.8, textAlign: 'center', fontSize: '16px', color: '#000', fontWeight: 800 }}>{qty}</span>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '15px', color: '#000', fontWeight: 700 }}>₪{(item.price || 0).toFixed(2)}</span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '16px', fontWeight: 900, color: '#000' }}>₪{lineTotal}</span>
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ paddingRight: '10px', marginTop: '4px' }}>
                {item.modifiers.map((mod, mi) => (
                  <div key={mi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#000', fontWeight: 700, lineHeight: 1.6 }}>
                    <span>+ {mod.option_name}</span>
                    {mod.extra_price && mod.extra_price > 0 && (
                      <span style={{ fontWeight: 800 }}>+₪{mod.extra_price.toFixed(2)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {item.note && (
              <div style={{ fontSize: '13px', color: '#000', fontWeight: 700, paddingRight: '6px', marginTop: '2px' }}>
                ملاحظة: {item.note}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ borderTop: '2px solid #000', margin: '10px 0' }} />

      {/* ═══ SUMMARY ═══ */}
      {order.subtotal != null && (
        <Row label="المجموع الفرعي" value={`₪${Number(order.subtotal).toFixed(2)}`} />
      )}
      {order.discount != null && Number(order.discount) > 0 && (
        <Row label="الخصم" value={`-₪${Number(order.discount).toFixed(2)}`} />
      )}

      <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />

      {/* ═══ TOTAL ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
        <span style={{ fontSize: '22px', fontWeight: 900, color: '#000' }}>الإجمالي</span>
        <span style={{ fontSize: '30px', fontWeight: 900, color: '#000' }}>₪{Number(order.total || 0).toFixed(2)}</span>
      </div>

      <div style={{ borderTop: '1px dashed #333', margin: '8px 0' }} />

      {/* ═══ PAYMENT ═══ */}
      <div style={{ background: '#f0f0f0', borderRadius: '6px', padding: '10px 12px', margin: '6px 0', border: '1px solid #ccc' }}>
        <Row label="طريقة الدفع" value={payLabel} bold />

        {isCash && order.tenderedAmount != null && Number(order.tenderedAmount) > 0 && (
          <>
            <Row label="المبلغ المستلم" value={`${tenderedCurrSym}${Number(order.tenderedAmount).toFixed(2)}`} />
            {order.change != null && Number(order.change) > 0 && (
              <Row label="الباقي" value={`${changeSym}${Number(order.change).toFixed(2)}`} bold large />
            )}
          </>
        )}
      </div>

      {/* ═══ ORDER NOTE ═══ */}
      {order.orderNote && (
        <div style={{
          background: '#f0f0f0', borderRadius: '6px', padding: '8px 10px',
          margin: '6px 0', fontSize: '14px', color: '#000', fontWeight: 800,
          border: '1px solid #999',
        }}>
          ملاحظة: {order.orderNote}
        </div>
      )}

      <div style={{ borderTop: '1px dashed #333', margin: '10px 0' }} />

      {/* ═══ QR CODE ═══ */}
      <div style={{ textAlign: 'center', margin: '10px 0' }}>
        <QRCodeSVG
          value={qrContent}
          size={140}
          level="M"
          style={{ margin: '0 auto', display: 'block' }}
        />
        <div style={{ fontSize: '11px', color: '#555', fontWeight: 600, marginTop: '4px' }}>
          امسح الكود للتحقق
        </div>
      </div>

      <div style={{ borderTop: '1px solid #333', margin: '8px 0' }} />

      {/* ═══ FOOTER ═══ */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: 900, color: '#000', marginBottom: '4px' }}>
          شكرا لتعاملكم معنا
        </div>
        <div style={{ fontSize: '13px', color: '#333', fontWeight: 700 }}>Thank you for your visit</div>
        {showReturnPolicy && (
          <>
            <div style={{ fontSize: '12px', color: '#333', fontWeight: 700, marginTop: '6px' }}>
              المرتجعات خلال {returnPolicyDays} ايام مع الايصال الاصلي
            </div>
            <div style={{ fontSize: '11px', color: '#333', fontWeight: 600 }}>
              Returns within {returnPolicyDays} days with original receipt
            </div>
          </>
        )}
      </div>

      <div style={{ height: '16px' }} />
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';

function Row({ label, value, bold, large }: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0',
      fontSize: large ? '18px' : '15px',
      color: '#000',
      fontWeight: bold ? 900 : 700,
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 900 : 800 }}>{value}</span>
    </div>
  );
}

export default ReceiptTemplate;
