/**
 * Receipt Template — mirrors POSReceiptDialog layout for thermal printing.
 * Width: 576px (80mm thermal printer @ 203 DPI)
 */
import { forwardRef } from "react";
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
  const dateStr = now.toLocaleDateString('ar-PS', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = now.toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const qNum = order.queueNumber || order.orderNumber || '---';

  const orderTypeLabel = order.orderType === 'takeaway' ? '🛍️ استلام'
    : order.orderType === 'delivery' ? '🚚 توصيل'
    : '🍽️ محلي';

  const paymentLabels: Record<string, string> = {
    'نقد': 'نقد', 'cash': 'نقد', 'نقدي': 'نقد',
    'بطاقة': 'بطاقة', 'card': 'بطاقة',
    'آجل': 'آجل', 'credit': 'آجل',
    'تحويل': 'تحويل', 'transfer': 'تحويل',
  };
  const payLabel = paymentLabels[order.paymentMethod || ''] || order.paymentMethod || 'نقد';

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
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' } as React.CSSProperties,
    hr: { border: 'none', borderTop: '1px solid #999', margin: '6px 0' } as React.CSSProperties,
    hrBold: { border: 'none', borderTop: '2px solid #000', margin: '8px 0' } as React.CSSProperties,
    hrDash: { border: 'none', borderTop: '1px dashed #333', margin: '8px 0' } as React.CSSProperties,
  };

  return (
    <div ref={ref} style={S.container}>

      {/* ═══ LOGO & COMPANY ═══ */}
      <div style={{ textAlign: 'center', paddingBottom: '2px' }}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ maxWidth: '120px', maxHeight: '60px', margin: '0 auto 4px', display: 'block', filter: 'grayscale(100%) contrast(1.2)' }} />
        )}
        <div style={{ fontSize: '28px', fontWeight: 900, color: '#000', letterSpacing: '1px', lineHeight: 1.2 }}>
          {companyName || 'مطعم الملكي'}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#333', letterSpacing: '2px', marginTop: '1px' }}>
          MALAKY RESTAURANT
        </div>
      </div>

      <hr style={S.hr} />

      {/* ═══ TERMINAL & DATE ═══ */}
      <div style={{ textAlign: 'center', paddingBottom: '4px' }}>
        {terminalName && (
          <div style={{ fontSize: '12px', color: '#000', fontWeight: 700 }}>{terminalName}</div>
        )}
        <div style={{ fontSize: '11px', color: '#333', fontWeight: 600, marginTop: '4px' }}>
          {dateStr} • {timeStr}
        </div>
      </div>

      <hr style={S.hrBold} />

      {/* ═══ ORDER META ═══ */}
      <div style={{ ...S.row, fontSize: '14px' }}>
        <span style={{ color: '#000', fontWeight: 800 }}>رقم الطلب</span>
        <span style={{ fontWeight: 900, color: '#000', fontSize: '16px' }}>{qNum}</span>
      </div>

      {order.cashier && (
        <div style={{ ...S.row, fontSize: '12px' }}>
          <span style={{ color: '#000', fontWeight: 700 }}>الكاشير</span>
          <span style={{ fontWeight: 700, color: '#000' }}>{order.cashier}</span>
        </div>
      )}

      <div style={{ ...S.row, fontSize: '12px' }}>
        <span style={{ color: '#000', fontWeight: 700 }}>نوع الطلب</span>
        <span style={{
          fontWeight: 800, color: '#000', background: '#eee',
          border: '1px solid #999', borderRadius: '4px',
          padding: '1px 8px', fontSize: '11px',
        }}>
          {orderTypeLabel}
        </span>
      </div>

      {order.tableNumber && (
        <div style={{ ...S.row, fontSize: '12px' }}>
          <span style={{ color: '#000', fontWeight: 700 }}>الطاولة</span>
          <span style={{ fontWeight: 900, color: '#000' }}>{order.tableNumber}</span>
        </div>
      )}

      {order.branchName && (
        <div style={{ ...S.row, fontSize: '12px' }}>
          <span style={{ color: '#000', fontWeight: 700 }}>الفرع</span>
          <span style={{ fontWeight: 700, color: '#000' }}>{order.branchName}</span>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0' }} />

      {/* ═══ TABLE HEADER ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '4px 0',
        fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px', color: '#000',
        borderBottom: '1px solid #333',
      }}>
        <span style={{ flex: 2 }}>الصنف</span>
        <span style={{ flex: 1, textAlign: 'center' }}>الكمية</span>
        <span style={{ flex: 1, textAlign: 'center' }}>السعر</span>
        <span style={{ flex: 1, textAlign: 'left' }}>المجموع</span>
      </div>

      {/* ═══ ITEMS ═══ */}
      {(order.items || []).map((item, i) => {
        const qty = item.quantity || 1;
        const lineTotal = (qty * (item.price || 0)).toFixed(2);
        return (
          <div key={i} style={{ padding: '6px 0', borderBottom: i < (order.items || []).length - 1 ? '1px solid #ccc' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ flex: 2, fontSize: '13px', fontWeight: 800, color: '#000', lineHeight: 1.3 }}>{item.name}</span>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#000', fontWeight: 700 }}>{qty}</span>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: '#000', fontWeight: 700 }}>₪{(item.price || 0).toFixed(2)}</span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 800, color: '#000' }}>₪{lineTotal}</span>
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ paddingRight: '8px', marginTop: '3px' }}>
                {item.modifiers.map((mod, mi) => (
                  <div key={mi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#000', fontWeight: 600, lineHeight: 1.6 }}>
                    <span>↳ {mod.option_name}</span>
                    {mod.extra_price && mod.extra_price > 0 && (
                      <span style={{ fontWeight: 700 }}>+₪{mod.extra_price.toFixed(2)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {item.note && (
              <div style={{ fontSize: '11px', color: '#000', fontWeight: 600, fontStyle: 'italic', paddingRight: '4px', marginTop: '1px' }}>
                📝 {item.note}
              </div>
            )}
          </div>
        );
      })}

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0' }} />

      {/* ═══ SUMMARY ═══ */}
      {order.subtotal != null && (
        <div style={{ ...S.row, fontSize: '12px', fontWeight: 700 }}>
          <span>المجموع الفرعي</span>
          <span>₪{Number(order.subtotal).toFixed(2)}</span>
        </div>
      )}
      {order.discount != null && Number(order.discount) > 0 && (
        <div style={{ ...S.row, fontSize: '12px', fontWeight: 800 }}>
          <span>الخصم</span>
          <span>-₪{Number(order.discount).toFixed(2)}</span>
        </div>
      )}

      <hr style={S.hrBold} />

      {/* ═══ TOTAL ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
        <span style={{ fontSize: '16px', fontWeight: 900, color: '#000' }}>الإجمالي</span>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#000' }}>₪{Number(order.total || 0).toFixed(2)}</span>
      </div>

      <hr style={S.hrDash} />

      {/* ═══ PAYMENT ═══ */}
      <div style={{ background: '#f0f0f0', borderRadius: '6px', padding: '8px 10px', margin: '4px 0', border: '1px solid #ccc' }}>
        <div style={{ ...S.row, fontSize: '12px' }}>
          <span style={{ color: '#000', fontWeight: 700 }}>طريقة الدفع</span>
          <span style={{
            background: '#ddd', border: '1px solid #999', borderRadius: '4px',
            padding: '1px 8px', fontSize: '11px', fontWeight: 900, color: '#000',
          }}>
            {payLabel}
          </span>
        </div>
        {order.tenderedAmount != null && Number(order.tenderedAmount) > 0 && (
          <div style={{ ...S.row, fontSize: '12px' }}>
            <span style={{ color: '#000', fontWeight: 700 }}>المبلغ المستلم</span>
            <span style={{ fontWeight: 800, color: '#000' }}>₪{Number(order.tenderedAmount).toFixed(2)}</span>
          </div>
        )}
        {order.change != null && Number(order.change) > 0 && (
          <div style={{ ...S.row, fontSize: '13px', fontWeight: 900 }}>
            <span style={{ color: '#000' }}>الباقي</span>
            <span style={{ color: '#000' }}>₪{Number(order.change).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ═══ ORDER NOTE ═══ */}
      {order.orderNote && (
        <div style={{
          background: '#f0f0f0', borderRadius: '6px', padding: '6px 8px',
          margin: '6px 0', fontSize: '11px', color: '#000', fontWeight: 700,
          border: '1px solid #999',
        }}>
          <span style={{ fontWeight: 900 }}>ملاحظة:</span> {order.orderNote}
        </div>
      )}

      <hr style={S.hrDash} />

      {/* ═══ BARCODE ═══ */}
      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '12px', letterSpacing: '3px', color: '#000', fontWeight: 700, margin: '4px 0' }}>
        ║║║ {qNum} ║║║
      </div>

      {/* ═══ FOOTER ═══ */}
      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#000', marginBottom: '2px' }}>شكراً لتعاملكم معنا ❤️</div>
        <div style={{ fontSize: '11px', color: '#333', fontWeight: 600 }}>Thank you for your visit</div>
        {showReturnPolicy && (
          <>
            <div style={{ fontSize: '10px', color: '#333', fontWeight: 600, marginTop: '4px' }}>
              المرتجعات خلال {returnPolicyDays} أيام مع الإيصال الأصلي
            </div>
            <div style={{ fontSize: '10px', color: '#333', fontWeight: 600 }}>
              Returns within {returnPolicyDays} days with original receipt
            </div>
          </>
        )}
      </div>

      <div style={{ height: '10px' }} />
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';

export default ReceiptTemplate;
