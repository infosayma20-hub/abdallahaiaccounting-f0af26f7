/**
 * Receipt Template — Customer invoice for 80mm thermal printer.
 * Width: 320px for 80mm thermal. Uses Noto Sans Arabic for connected Arabic.
 * Compact design — minimal spacing, no decorative elements.
 *
 * Font sizes increased by ~40% per management request for better readability.
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
  /**
   * Footer mode — temporary mitigation for raster buffer-overflow on the printer.
   * - 'full'    : QR + thanks + extra spacing (legacy behavior)
   * - 'compact' : skip QR, keep tiny single-line thanks (default — safe)
   * - 'off'     : no footer at all (cuts immediately after payment block)
   */
  footerMode?: 'full' | 'compact' | 'off';
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

const hr = { border: 'none', borderTop: '1px solid #999', margin: '4px 0', ...box } as React.CSSProperties;
const hrBold = { border: 'none', borderTop: '2px solid #000', margin: '4px 0', ...box } as React.CSSProperties;
const hrDash = { border: 'none', borderTop: '1px dashed #666', margin: '4px 0', ...box } as React.CSSProperties;

const ReceiptTemplate = forwardRef<HTMLDivElement, Props>(({
  order,
  companyName,
  companyPhone,
  companyAddress,
  taxNumber,
  terminalName,
  logoUrl,
  footerMode = 'compact',
}, ref) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB');
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Strip leading zeros so "000005" → "5", "POS-20260602-0005" → "5".
  const qNumRaw = order.queueNumber || order.orderNumber || '---';
  const qNum = (() => {
    const s = String(qNumRaw).trim();
    if (!s) return '---';
    if (/[-_/\s]/.test(s)) {
      const parts = s.split(/[-_/\s]+/);
      const last = parts[parts.length - 1] || '';
      return /^\d+$/.test(last) ? (last.replace(/^0+(?=\d)/, '') || last) : s;
    }
    return /^\d+$/.test(s) ? (s.replace(/^0+(?=\d)/, '') || s) : s;
  })();

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

  // ── Delivery fee handling (customer receipt ONLY) ────────────────────
  // External courier fee is NOT restaurant revenue. We strip it from the
  // printed total/subtotal and append it as a note line. DB total and
  // accounting are untouched.
  const deliveryFee = Math.max(0, Number((order as any).deliveryFee || 0));
  const printedTotal = Math.max(0, Number(order.total || 0) - deliveryFee);
  // order.subtotal already excludes delivery fee in POSPage — keep as-is.
  const printedSubtotal = order.subtotal != null ? Number(order.subtotal) : undefined;
  const deliveryNoteLine = deliveryFee > 0
    ? `سعر التوصيل: ₪${deliveryFee.toFixed(2)} يخص شركة التوصيل وليس ضمن إجمالي الفاتورة`
    : '';
  const mergedOrderNote = [order.orderNote, deliveryNoteLine].filter(Boolean).join(' — ');

  // Build QR: if order has ID, use URL for online receipt; otherwise fallback to text
  const baseUrl = window.location.origin;
  const qrContent = order.id
    ? `${baseUrl}/receipt/${order.id}`
    : [
        companyName || '',
        `طلب: ${qNum}`,
        `المبلغ: ₪${printedTotal.toFixed(2)}`,
        `التاريخ: ${dateStr} ${timeStr}`,
      ].join('\n');

  return (
    <div ref={ref} dir="rtl" lang="ar" style={{
      // Aligned with ShiftSummaryTemplate (closure report) which prints perfectly.
      // Width 576px (80mm @ 203 DPI), larger fonts, Tahoma for connected Arabic.
      width: '576px',
      minWidth: '576px',
      maxWidth: '576px',
      overflow: 'visible',
      boxSizing: 'border-box',
      direction: 'rtl',
      padding: '20px 24px',
      backgroundColor: '#ffffff',
      color: '#000000',
      fontFamily: FONT,
      fontSize: '20px',
      fontWeight: 700,
      lineHeight: 1.5,
    }}>

      {/* ═══ 1. LOGO ═══ */}
      <div style={{ textAlign: 'center', ...box }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            style={{ height: '90px', margin: '0 auto 6px', display: 'block' }}
          />
        )}
      </div>

      <hr style={hr} />

      {/* ═══ 2. HEADER INFO ═══ */}
      <div style={{ textAlign: 'center', ...box }}>
        {terminalName && (
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#000' }}>{terminalName}</div>
        )}
        <div style={{ fontSize: '18px', fontWeight: 600, color: '#333' }}>
          {dateStr} • {timeStr}
        </div>
      </div>

      <hr style={hrBold} />

      {/* ═══ 3. ORDER INFO ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '3px 0', fontSize: '30px', fontWeight: 900, textAlign: 'right' }}>رقم الطلب</td>
            <td style={{ padding: '3px 0', fontSize: '30px', fontWeight: 900, textAlign: 'left' }}>{qNum}</td>
          </tr>
          {order.cashier && (
            <tr>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>الكاشير</td>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'left' }}>{order.cashier}</td>
            </tr>
          )}
          <tr>
            <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>نوع الطلب</td>
            <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 800, textAlign: 'left' }}>{orderTypeLabel}</td>
          </tr>
          {order.tableNumber && (
            <tr>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>الطاولة</td>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 800, textAlign: 'left' }}>{order.tableNumber}</td>
            </tr>
          )}
          {order.branchName && (
            <tr>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>الفرع</td>
              <td style={{ padding: '2px 0', fontSize: '20px', fontWeight: 700, textAlign: 'left' }}>{order.branchName}</td>
            </tr>
          )}
        </tbody>
      </table>

      <hr style={hrBold} />

      {/* ═══ 4. ITEMS TABLE — name slightly smaller + wraps to avoid overlapping qty/price ═══ */}
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ padding: '4px 3px', fontSize: '17px', fontWeight: 800, textAlign: 'right', width: '46%' }}>الصنف</th>
            <th style={{ padding: '4px 3px', fontSize: '17px', fontWeight: 800, textAlign: 'center', width: '12%' }}>الكمية</th>
            <th style={{ padding: '4px 3px', fontSize: '17px', fontWeight: 800, textAlign: 'center', width: '20%' }}>السعر</th>
            <th style={{ padding: '4px 3px', fontSize: '17px', fontWeight: 800, textAlign: 'left', width: '22%' }}>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, i) => {
            const qty = item.quantity || 1;
            const lineTotal = (qty * (item.price || 0)).toFixed(2);
            return (
              <tr key={i}>
                <td style={{ padding: '8px 4px 10px', fontSize: '19px', fontWeight: 900, textAlign: 'right', verticalAlign: 'top', lineHeight: 1.3, borderBottom: '1px solid #ddd', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {item.name}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div>
                      {item.modifiers.map((mod, mi) => (
                        <div key={mi} style={{ fontSize: '15px', color: '#333', marginTop: '3px', fontWeight: 600, lineHeight: 1.25, wordBreak: 'break-word' }}>
                          + {mod.option_name}
                          {mod.extra_price && mod.extra_price > 0 && ` (+₪${mod.extra_price.toFixed(2)})`}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <div style={{ fontSize: '15px', color: '#222', marginTop: '3px', fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-word' }}>
                      📝 {item.note}
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 4px 10px', fontSize: '18px', fontWeight: 900, textAlign: 'center', verticalAlign: 'top', borderBottom: '1px solid #ddd' }}>{qty}</td>
                <td style={{ padding: '8px 4px 10px', fontSize: '18px', fontWeight: 700, textAlign: 'center', verticalAlign: 'top', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }}>₪{(item.price || 0).toFixed(2)}</td>
                <td style={{ padding: '8px 4px 10px', fontSize: '18px', fontWeight: 800, textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }}>₪{lineTotal}</td>
              </tr>
            );
          })}
          {printedSubtotal != null && (
            <tr style={{ borderTop: '1px solid #999' }}>
              <td colSpan={3} style={{ padding: '4px 3px', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>المجموع الفرعي</td>
              <td style={{ padding: '4px 3px', fontSize: '20px', fontWeight: 800, textAlign: 'left' }}>₪{printedSubtotal.toFixed(2)}</td>
            </tr>
          )}
          {order.discount != null && Number(order.discount) > 0 && (
            <tr>
              <td colSpan={3} style={{ padding: '4px 3px', fontSize: '20px', fontWeight: 700, textAlign: 'right' }}>الخصم</td>
              <td style={{ padding: '4px 3px', fontSize: '20px', fontWeight: 800, textAlign: 'left' }}>-₪{Number(order.discount).toFixed(2)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ═══ 5. TOTAL — most prominent (36px bold, boxed) ═══ */}
      <hr style={hrBold} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '10px 6px', fontSize: '36px', fontWeight: 900, textAlign: 'right', lineHeight: 1.1, border: '3px solid #000' }}>الإجمالي</td>
            <td style={{ padding: '10px 6px', fontSize: '36px', fontWeight: 900, textAlign: 'left', lineHeight: 1.1, border: '3px solid #000' }}>₪{printedTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <hr style={hrDash} />

      {/* ═══ 6. PAYMENT ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', fontSize: '22px', fontWeight: 700, textAlign: 'right' }}>طريقة الدفع</td>
            <td style={{ padding: '4px 0', fontSize: '22px', fontWeight: 800, textAlign: 'left' }}>{payLabel}</td>
          </tr>
          {isCash && order.tenderedAmount != null && Number(order.tenderedAmount) > 0 && (
            <>
              <tr>
                <td style={{ padding: '4px 0', fontSize: '22px', fontWeight: 700, textAlign: 'right' }}>المبلغ المستلم</td>
                <td style={{ padding: '4px 0', fontSize: '22px', fontWeight: 800, textAlign: 'left' }}>{tenderedCurrSym}{Number(order.tenderedAmount).toFixed(2)}</td>
              </tr>
              {order.change != null && Number(order.change) > 0 && (
                <tr>
                  <td style={{ padding: '4px 0', fontSize: '24px', fontWeight: 900, textAlign: 'right' }}>الباقي</td>
                  <td style={{ padding: '4px 0', fontSize: '24px', fontWeight: 900, textAlign: 'left' }}>{changeSym}{Number(order.change).toFixed(2)}</td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>

      {/* ═══ ORDER NOTE — always visible, white background, bold frame ═══ */}
      {mergedOrderNote && (
        <div style={{
          border: '2px solid #000',
          background: '#fff',
          padding: '8px 10px',
          margin: '8px 0',
          fontSize: '20px',
          fontWeight: 700,
          borderRadius: '4px',
          ...box,
        }}>
          <span style={{ fontWeight: 900 }}>📝 ملاحظة:</span> {mergedOrderNote}
        </div>
      )}

      {/* ═══ 7. QR CODE — only in 'full' mode (heavy raster, may overflow printer buffer) ═══ */}
      {footerMode === 'full' && (
        <>
          <hr style={hrDash} />
          <div style={{ textAlign: 'center', margin: '4px 0', ...box }}>
            <QRCodeSVG
              value={qrContent}
              size={90}
              level="M"
              style={{ margin: '0 auto', display: 'block' }}
            />
            <div style={{ fontSize: '14px', color: '#555', marginTop: '2px' }}>
              امسح للتحقق من الإيصال
            </div>
          </div>
        </>
      )}

      {/* ═══ 8. FOOTER — hidden entirely when 'off' ═══ */}
      {footerMode !== 'off' && (
        <>
          <hr style={hr} />
          <div style={{ textAlign: 'center', ...box }}>
            <div style={{ fontSize: footerMode === 'compact' ? '20px' : '22px', fontWeight: 800 }}>
              ❤️ شكراً لتعاملكم معنا
            </div>
            {footerMode === 'full' && (
              <div style={{ fontSize: '17px', color: '#333' }}>Thank you for your visit</div>
            )}
          </div>
        </>
      )}

      <div style={{ height: footerMode === 'off' ? '8px' : '14px' }} />
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';

export default ReceiptTemplate;
