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
  const qNum = order.queueNumber || order.orderNumber || '---';

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

  const orderTypeLabel = isDelivery ? 'توصيل'
    : isDineIn ? 'محلي'
    : 'استلام';

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: '384px',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: FONT,
        fontSize: '22px',
        fontWeight: 700,
        lineHeight: 1.2,
        // Extra top padding so the physical clip does NOT cover the order number.
        padding: '48px 14px 14px',
        // Outer black border (replacing the old black top bar per management request).
        border: '4px solid #000',
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
          fontSize: '30px',
          fontWeight: 900,
          padding: '6px 0',
          borderBottom: '2px solid #000',
          marginBottom: '8px',
          letterSpacing: '1px',
          lineHeight: 1.1,
        }}>
          {stationName}
        </div>
      )}

      {/* Order Number — BIGGEST element for kitchen-first visibility */}
      <div style={{
        textAlign: 'center',
        fontSize: '52px',
        fontWeight: 900,
        margin: '6px 0 2px',
        lineHeight: 1.0,
      }}>
        # {qNum}
      </div>

      {/* TIME — moved directly BELOW order number, larger font (per Al-Malaky April 2026) */}
      <div style={{
        textAlign: 'center',
        fontSize: '28px',
        fontWeight: 900,
        color: '#000',
        padding: '5px 8px',
        margin: '4px 0 8px',
        lineHeight: 1.05,
        letterSpacing: '0.5px',
        border: '2px solid #000',
        borderRadius: '4px',
      }}>
        🕐 {timeStr} • {dateStr}
      </div>

      {/* Order Type */}
      <div style={{
        textAlign: 'center',
        fontSize: '28px',
        fontWeight: 900,
        padding: '4px',
        border: '3px solid #000',
        margin: '4px 0',
        lineHeight: 1.1,
      }}>
        {orderTypeLabel}
      </div>

      {/* Table number */}
      {order.tableNumber && (
        <div style={{ fontSize: '22px', fontWeight: 900, textAlign: 'center', margin: '2px 0', lineHeight: 1.1 }}>
          طاولة: {order.tableNumber}
        </div>
      )}

      <div style={{ borderTop: '3px solid #000', margin: '6px 0' }} />

      {/* Items */}
      {items.map((item, i) => {
        const qty = item.quantity || 1;
        return (
          <div key={i} style={{ padding: '4px 0', borderBottom: '1px dashed #666', lineHeight: 1.2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, minWidth: '38px', lineHeight: 1.15, flexShrink: 0 }}>{qty}×</span>
              <span style={{ fontSize: '21px', fontWeight: 900, textAlign: 'right', flex: 1, lineHeight: 1.25, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{item.name}</span>
            </div>
            {item.modifiers?.map((m, j) => (
              <div key={j} style={{
                fontSize: '17px', color: '#000', fontWeight: 700,
                textAlign: 'right', paddingRight: '42px', marginTop: '2px',
                lineHeight: 1.2, wordBreak: 'break-word',
              }}>
                + {m.option_name}
              </div>
            ))}
            {item.note && (
              <div style={{
                fontSize: '17px', fontWeight: 900, color: '#000',
                textAlign: 'right', paddingRight: '42px', marginTop: '2px',
                background: '#eee', padding: '3px 6px', borderRadius: '3px',
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
          <div style={{ borderTop: '3px solid #000', margin: '8px 0 6px' }} />
          <div style={{
            fontSize: '20px',
            fontWeight: 900,
            color: '#000',
            textAlign: 'right',
            background: '#eee',
            padding: '6px 8px',
            borderRadius: '3px',
            lineHeight: 1.25,
            border: '2px solid #000',
            wordBreak: 'break-word',
          }}>
            ملاحظة الفاتورة: {order.orderNote}
          </div>
        </>
      )}

      <div style={{ height: '12px' }} />
    </div>
  );
});

KitchenTicketTemplate.displayName = 'KitchenTicketTemplate';

export default KitchenTicketTemplate;
