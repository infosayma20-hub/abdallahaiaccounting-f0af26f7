/**
 * Receipt Template — Customer invoice for 80mm thermal printer.
 * Width: 320px for 80mm thermal. Uses Noto Sans Arabic for connected Arabic.
 * Uses <table> for items (not flex) to preserve RTL on thermal printers.
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

const FONT = "'Noto Sans Arabic', 'Cairo', sans-serif";

const box = {
  width: '100%' as const,
  boxSizing: 'border-box' as const,
  overflow: 'hidden' as const,
  wordBreak: 'break-word' as const,
};

const hr = { border: 'none', borderTop: '1px solid #999', margin: '8px 0', ...box } as React.CSSProperties;
const hrBold = { border: 'none', borderTop: '2px solid #000', margin: '10px 0', ...box } as React.CSSProperties;
const hrDash = { border: 'none', borderTop: '1px dashed #666', margin: '8px 0', ...box } as React.CSSProperties;

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
  const dateStr = now.toLocaleDateString('en-GB');
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const qNum = order.queueNumber || order.orderNumber || '---';

  const orderTypeLabel = order.orderType === 'takeaway' ? '🛍️ استلام'
    : order.orderType === 'delivery' ? '🚚 توصيل'
    : '🍽️ محلي';

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

  const qrContent = [
    companyName || 'مطعم الملكي',
    `طلب: ${qNum}`,
    `المبلغ: ₪${Number(order.total || 0).toFixed(2)}`,
    `التاريخ: ${dateStr} ${timeStr}`,
    taxNumber ? `الرقم الضريبي: ${taxNumber}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div ref={ref} style={{
      width: '320px',
      minWidth: '320px',
      maxWidth: '320px',
      overflow: 'visible',
      boxSizing: 'border-box',
      direction: 'rtl',
      padding: '14px 16px',
      backgroundColor: '#ffffff',
      color: '#000000',
      fontFamily: FONT,
      fontSize: '13px',
      fontWeight: 400,
      lineHeight: '1.4',
    }}>

      {/* ═══ 1. LOGO ═══ */}
      <div style={{ textAlign: 'center', ...box }}>
        <img
          src={logoUrl || '/images/malaky-logo.png'}
          alt=""
          style={{ width: '90px', margin: '0 auto 4px', display: 'block' }}
        />
        <div style={{ fontSize: '11px', fontWeight: 400, color: '#333', letterSpacing: '2px' }}>
          MALAKY RESTAURANT
        </div>
      </div>

      <hr style={hr} />

      {/* ═══ 2. HEADER INFO ═══ */}
      <div style={{ textAlign: 'center', ...box }}>
        {terminalName && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#000' }}>{terminalName}</div>
        )}
        <div style={{ fontSize: '12px', fontWeight: 400, color: '#333', marginTop: '2px' }}>
          {dateStr} • {timeStr}
        </div>
      </div>

      <hr style={hr} />

      <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, ...box }}>
        فاتورة ضريبية / Tax Invoice
      </div>

      <hr style={hrBold} />

      {/* ═══ 3. ORDER INFO ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>رقم الطلب</td>
            <td style={{ padding: '3px 0', fontSize: '15px', fontWeight: 700, textAlign: 'left' }}>{qNum}</td>
          </tr>
          {order.cashier && (
            <tr>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>الكاشير</td>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'left' }}>{order.cashier}</td>
            </tr>
          )}
          <tr>
            <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>نوع الطلب</td>
            <td style={{ padding: '3px 0', textAlign: 'left' }}>
              <span style={{
                border: '1px solid #000',
                borderRadius: '4px',
                padding: '2px 8px',
                display: 'inline-block',
                fontSize: '13px',
                fontWeight: 700,
              }}>
                {orderTypeLabel}
              </span>
            </td>
          </tr>
          {order.tableNumber && (
            <tr>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>الطاولة</td>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 700, textAlign: 'left' }}>{order.tableNumber}</td>
            </tr>
          )}
          {order.branchName && (
            <tr>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>الفرع</td>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'left' }}>{order.branchName}</td>
            </tr>
          )}
        </tbody>
      </table>

      <hr style={hrBold} />

      {/* ═══ 4. ITEMS TABLE ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000' }}>
            <th style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'right', width: '45%' }}>الصنف</th>
            <th style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'center', width: '10%' }}>الكمية</th>
            <th style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'center', width: '22%' }}>السعر</th>
            <th style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'left', width: '23%' }}>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, i) => {
            const qty = item.quantity || 1;
            const lineTotal = (qty * (item.price || 0)).toFixed(2);
            return (
              <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 400, textAlign: 'right', verticalAlign: 'top' }}>
                  {item.name}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div>
                      {item.modifiers.map((mod, mi) => (
                        <div key={mi} style={{ fontSize: '11px', color: '#444', marginTop: '1px' }}>
                          + {mod.option_name}
                          {mod.extra_price && mod.extra_price > 0 && ` (+₪${mod.extra_price.toFixed(2)})`}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <div style={{ fontSize: '11px', color: '#333', marginTop: '1px' }}>
                      📝 {item.note}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 400, textAlign: 'center', verticalAlign: 'top' }}>{qty}</td>
                <td style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 400, textAlign: 'center', verticalAlign: 'top' }}>₪{(item.price || 0).toFixed(2)}</td>
                <td style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'left', verticalAlign: 'top' }}>₪{lineTotal}</td>
              </tr>
            );
          })}
          {/* Subtotal row */}
          {order.subtotal != null && (
            <tr style={{ borderTop: '1px solid #999' }}>
              <td colSpan={3} style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>المجموع الفرعي</td>
              <td style={{ padding: '6px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'left' }}>₪{Number(order.subtotal).toFixed(2)}</td>
            </tr>
          )}
          {order.discount != null && Number(order.discount) > 0 && (
            <tr>
              <td colSpan={3} style={{ padding: '4px 4px', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>الخصم</td>
              <td style={{ padding: '4px 4px', fontSize: '13px', fontWeight: 700, textAlign: 'left' }}>-₪{Number(order.discount).toFixed(2)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ═══ 5. TOTAL ═══ */}
      <hr style={hrBold} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', fontSize: '26px', fontWeight: 700, textAlign: 'right' }}>الإجمالي</td>
            <td style={{ padding: '4px 0', fontSize: '26px', fontWeight: 700, textAlign: 'left' }}>₪{Number(order.total || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <hr style={hrDash} />

      {/* ═══ 6. PAYMENT BOX ═══ */}
      <div style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '10px 12px',
        margin: '8px 0',
        ...box,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>طريقة الدفع</td>
              <td style={{ padding: '3px 0', textAlign: 'left' }}>
                <span style={{
                  border: '1px solid #999',
                  borderRadius: '4px',
                  padding: '1px 8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'inline-block',
                }}>
                  {payLabel}
                </span>
              </td>
            </tr>
            {isCash && order.tenderedAmount != null && Number(order.tenderedAmount) > 0 && (
              <>
                <tr>
                  <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 400, textAlign: 'right' }}>المبلغ المستلم</td>
                  <td style={{ padding: '3px 0', fontSize: '13px', fontWeight: 700, textAlign: 'left' }}>{tenderedCurrSym}{Number(order.tenderedAmount).toFixed(2)}</td>
                </tr>
                {order.change != null && Number(order.change) > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>الباقي</td>
                    <td style={{ padding: '3px 0', fontSize: '14px', fontWeight: 700, textAlign: 'left' }}>{changeSym}{Number(order.change).toFixed(2)}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ ORDER NOTE ═══ */}
      {order.orderNote && (
        <div style={{
          border: '1px solid #ccc',
          borderRadius: '6px',
          padding: '6px 8px',
          margin: '6px 0',
          fontSize: '12px',
          fontWeight: 400,
          ...box,
        }}>
          <span style={{ fontWeight: 700 }}>ملاحظة:</span> {order.orderNote}
        </div>
      )}

      <hr style={hrDash} />

      {/* ═══ 7. QR CODE ═══ */}
      <div style={{ textAlign: 'center', margin: '8px 0', ...box }}>
        <QRCodeSVG
          value={qrContent}
          size={110}
          level="M"
          style={{ margin: '0 auto', display: 'block' }}
        />
        <div style={{ fontSize: '11px', color: '#555', fontWeight: 400, marginTop: '4px' }}>
          امسح للتحقق من الإيصال
        </div>
      </div>

      {/* ═══ 8. BARCODE ═══ */}
      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '12px', letterSpacing: '3px', color: '#000', fontWeight: 400, margin: '4px 0' }}>
        ║║║ {qNum} ║║║
      </div>

      <hr style={hr} />

      {/* ═══ 9. FOOTER ═══ */}
      <div style={{ textAlign: 'center', ...box }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>❤️ شكراً لتعاملكم معنا</div>
        <div style={{ fontSize: '12px', fontWeight: 400, color: '#333' }}>Thank you for your visit</div>
        {showReturnPolicy && (
          <>
            <hr style={hrDash} />
            <div style={{ fontSize: '11px', color: '#555', fontWeight: 400, marginTop: '2px' }}>
              الإرجاعات خلال {returnPolicyDays} أيام مع الإيصال الأصلي
            </div>
            <div style={{ fontSize: '11px', color: '#555', fontWeight: 400 }}>
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
