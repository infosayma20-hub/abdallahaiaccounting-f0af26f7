/**
 * Kitchen Ticket Template — for Kitchen, Grill (Sakhaan), Pizza printers.
 * Width: 384px (58mm thermal printer @ 203 DPI).
 * Compact: station name, order #, order type, items only.
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

  // Normalize orderType — handles both English keys and legacy Arabic values
  const rawType = (order.orderType || '').toString().trim().toLowerCase();
  const isDelivery = rawType === 'delivery' || rawType === 'توصيل' || rawType === 'دليفري';
  const isTakeaway = rawType === 'takeaway' || rawType === 'تيك اواي' || rawType === 'تيك أواي' || rawType === 'استلام' || rawType === 'سفري';
  // If table number exists or type is dine_in/محلي → it's dine-in
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
        fontSize: '32px',
        fontWeight: 700,
        lineHeight: '1.4',
        padding: '16px 18px',
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
      {/* Station Name */}
      {stationName && (
        <div style={{
          textAlign: 'center',
          fontSize: '40px',
          fontWeight: 900,
          padding: '10px 0',
          borderBottom: '4px solid #000',
          marginBottom: '12px',
          letterSpacing: '1px',
        }}>
          {stationName}
        </div>
      )}

      {/* Order Number — BIG */}
      <div style={{
        textAlign: 'center',
        fontSize: '62px',
        fontWeight: 900,
        margin: '10px 0',
      }}>
        # {qNum}
      </div>

      {/* Order Type */}
      <div style={{
        textAlign: 'center',
        fontSize: '36px',
        fontWeight: 900,
        padding: '10px',
        border: '4px solid #000',
        margin: '10px 0',
      }}>
        {orderTypeLabel}
      </div>

      {/* Table number only */}
      {order.tableNumber && (
        <div style={{ fontSize: '28px', fontWeight: 900, textAlign: 'center', margin: '6px 0' }}>
          طاولة: {order.tableNumber}
        </div>
      )}

      <div style={{ borderTop: '4px solid #000', margin: '12px 0' }} />

      {/* Items — no header row */}
      {items.map((item, i) => {
        const qty = item.quantity || 1;
        return (
          <div key={i} style={{ padding: '12px 0', borderBottom: '2px dashed #666' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '44px', fontWeight: 900, minWidth: '60px' }}>{qty}</span>
              <span style={{ fontSize: '40px', fontWeight: 900, textAlign: 'right', flex: 1 }}>{item.name}</span>
            </div>
            {item.modifiers?.map((m, j) => (
              <div key={j} style={{
                fontSize: '28px', color: '#000', fontWeight: 700,
                textAlign: 'right', paddingRight: '60px', marginTop: '3px',
              }}>
                + {m.option_name}
              </div>
            ))}
            {item.note && (
              <div style={{
                fontSize: '28px', fontWeight: 900, color: '#000',
                textAlign: 'right', paddingRight: '60px', marginTop: '5px',
                background: '#eee', padding: '6px 10px', borderRadius: '4px',
              }}>
                ملاحظة: {item.note}
              </div>
            )}
          </div>
        );
      })}

      {/* Order Note */}
      {order.orderNote && (
        <>
          <div style={{ borderTop: '4px solid #000', margin: '12px 0' }} />
          <div style={{
            fontSize: '32px', fontWeight: 900,
            background: '#eee', padding: '10px 12px', borderRadius: '4px',
            border: '3px solid #000',
          }}>
            ملاحظات: {order.orderNote}
          </div>
        </>
      )}

      <div style={{ height: '24px' }} />
    </div>
  );
});

KitchenTicketTemplate.displayName = 'KitchenTicketTemplate';

export default KitchenTicketTemplate;
