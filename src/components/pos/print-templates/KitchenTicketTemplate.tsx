/**
 * Kitchen Ticket Template — for Kitchen, Grill (Sakhaan), Pizza printers.
 * Width: 384px (58mm thermal printer @ 203 DPI).
 * Compact: station name, order #, TIME (prominent), order type, items.
 *
 * Optimized:
 * - Order # and TIME are the most prominent elements (kitchen-first design).
 * - line-height 1.2 + minimal padding to keep raster height down.
 * - Notes slightly smaller but still readable.
 */
import { forwardRef } from "react";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";

interface Props {
  order: PrintOrder;
  items: PrintItem[];
  stationName?: string;
}

const FONT = "'Tahoma', 'Arial', sans-serif";

const KitchenTicketTemplate = forwardRef<HTMLDivElement, Props>(({ order, items, stationName }, ref) => {
  // Order number WITHOUT leading zeros — e.g. "000007" → "7"
  const rawCounter = order.queueNumber ?? order.orderNumber ?? '---';
  const rawStr = String(rawCounter);
  const parsed = parseInt(rawStr, 10);
  const dailyCounter = Number.isFinite(parsed) ? String(parsed) : rawStr;

  // Time string — HH:MM (24h, large for kitchen visibility)
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB');

  // Normalize orderType
  const rawType = (order.orderType || '').toString().trim().toLowerCase();
  const isDelivery = rawType === 'delivery' || rawType === 'توصيل' || rawType === 'دليفري';
  const isTakeaway = rawType === 'takeaway' || rawType === 'تيك اواي' || rawType === 'تيك أواي' || rawType === 'استلام' || rawType === 'سفري';
  const isDineIn = !isDelivery && !isTakeaway && (
    rawType === 'dine_in' || rawType === 'dine-in' || rawType === 'محلي' || rawType === 'صالة' || !!order.tableNumber
  );

  const orderTypeLabel = isDelivery
    ? 'توصيل'
    : isDineIn
      ? (() => {
          const raw = (order.tableNumber || '').toString().trim();
          if (!raw) return 'طاولة';
          return /^طاولة\b/.test(raw) ? raw : `طاولة رقم ${raw}`;
        })()
      : 'استلام';

  // Compact meta — NO duplication of order # or order type (those are shown above as headers).
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const infoRows: { label: string; value: string; ltr?: boolean }[] = [
    { label: 'التاريخ', value: `${dateStr} - ${timeStr}` },
  ];
  if (order.customerName) infoRows.push({ label: 'الزبون', value: order.customerName });
  if (order.customerPhone) infoRows.push({ label: 'الجوال', value: order.customerPhone, ltr: true });
  if (order.pickupBy) infoRows.push({ label: 'ملاحظة', value: `استلام من ${order.pickupBy}` });
  infoRows.push({ label: 'مجموع الكميات', value: String(totalQty) });

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: '384px',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: FONT,
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: 1.2,
        padding: '40px 12px 12px',
        border: '3px solid #000',
        borderRadius: '4px',
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
      {/* Station Name — clean border, no black bar */}
      {stationName && (
        <div style={{
          textAlign: 'center',
          fontSize: '26px',
          fontWeight: 900,
          padding: '4px 0',
          borderBottom: '2px solid #000',
          marginBottom: '6px',
          letterSpacing: '1px',
          lineHeight: 1.1,
        }}>
          {stationName}
        </div>
      )}

      {/* Order Number — BIGGEST element for kitchen-first visibility */}
      <div style={{
        textAlign: 'center',
        fontSize: '46px',
        fontWeight: 900,
        margin: '4px 0 2px',
        lineHeight: 1.0,
      }}>
        # {dailyCounter}
      </div>

      {/* Order Type */}
      <div style={{
        textAlign: 'center',
        fontSize: '22px',
        fontWeight: 900,
        padding: '3px',
        margin: '4px 0',
        lineHeight: 1.1,
      }}>
        {orderTypeLabel}
      </div>

      {/* Table number is now part of orderTypeLabel above (e.g. "طاولة رقم T10"). */}

      {/* ORDER INFO — two-column table */}
      <div style={{ borderTop: '2px solid #000', margin: '6px 0 0' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0', tableLayout: 'fixed' }}>
        <tbody>
          {infoRows.map((row, i) => (
            <tr key={i}>
              <td style={{ fontSize: '15px', fontWeight: 700, padding: '3px 6px', borderLeft: '1px solid #000', width: '35%', verticalAlign: 'top', textAlign: 'right', wordBreak: 'break-word' }}>
                {row.label}
              </td>
              <td style={{ fontSize: '15px', fontWeight: 700, padding: '3px 6px', verticalAlign: 'top', textAlign: 'right', wordBreak: 'break-word', direction: row.ltr ? 'ltr' as const : undefined }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ margin: '0 0 4px' }} />

      {/* Items table header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', marginBottom: '2px' }}>
        <span style={{ fontSize: '15px', fontWeight: 900, width: '50px', textAlign: 'center' }}>الكمية</span>
        <span style={{ fontSize: '15px', fontWeight: 900, flex: 1, textAlign: 'right' }}>الاسم</span>
      </div>

      {/* Items — receipt-sized font for compactness */}
      {items.map((item, i) => {
        const qty = item.quantity || 1;
        return (
          <div key={i} style={{
            padding: '3px 0',
            borderBottom: i < items.length - 1 ? '1.5px solid #000' : 'none',
            lineHeight: 1.2,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 900, width: '40px', textAlign: 'center', lineHeight: 1.15, flexShrink: 0 }}>{qty}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, textAlign: 'right', flex: 1, lineHeight: 1.25, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{item.name}</span>
            </div>
            {item.modifiers?.map((m, j) => (
              <div key={j} style={{
                fontSize: '12px', color: '#000', fontWeight: 600,
                textAlign: 'right', paddingRight: '48px', marginTop: '2px',
                lineHeight: 1.2, wordBreak: 'break-word',
              }}>
                + {m.option_name}
              </div>
            ))}
            {item.note && (
              <div style={{
                fontSize: '12px', fontWeight: 700, color: '#000',
                textAlign: 'right', marginTop: '2px', paddingRight: '48px',
                lineHeight: 1.2, wordBreak: 'break-word',
              }}>
                ملاحظة: {item.note}
              </div>
            )}
          </div>
        );
      })}

      {order.orderNote && (
        <>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#000',
            textAlign: 'right',
            padding: '5px 7px',
            marginTop: '8px',
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}>
            ملاحظة الفاتورة: {order.orderNote}
          </div>
        </>
      )}

      <div style={{ height: '10px' }} />
    </div>
  );
});

KitchenTicketTemplate.displayName = 'KitchenTicketTemplate';

export default KitchenTicketTemplate;
