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

  const orderTypeLabel = order.orderType === 'takeaway' ? 'تيك اواي'
    : order.orderType === 'delivery' ? 'توصيل'
    : 'محلي';

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
        lineHeight: '1.4',
        padding: '14px 16px',
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
      {/* Station Name */}
      {stationName && (
        <div style={{
          textAlign: 'center',
          fontSize: '28px',
          fontWeight: 900,
          padding: '8px 0',
          borderBottom: '3px solid #000',
          marginBottom: '10px',
          letterSpacing: '1px',
        }}>
          {stationName}
        </div>
      )}

      {/* Order Number — BIG */}
      <div style={{
        textAlign: 'center',
        fontSize: '44px',
        fontWeight: 900,
        margin: '8px 0',
      }}>
        # {qNum}
      </div>

      {/* Order Type */}
      <div style={{
        textAlign: 'center',
        fontSize: '26px',
        fontWeight: 900,
        padding: '8px',
        border: '3px solid #000',
        margin: '8px 0',
      }}>
        {orderTypeLabel}
      </div>

      {/* Table number only */}
      {order.tableNumber && (
        <div style={{ fontSize: '20px', fontWeight: 900, textAlign: 'center', margin: '4px 0' }}>
          طاولة: {order.tableNumber}
        </div>
      )}

      <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />

      {/* Items — no header row */}
      {items.map((item, i) => {
        const qty = item.quantity || 1;
        return (
          <div key={i} style={{ padding: '10px 0', borderBottom: '2px dashed #666' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '32px', fontWeight: 900, minWidth: '50px' }}>{qty}</span>
              <span style={{ fontSize: '28px', fontWeight: 900, textAlign: 'right', flex: 1 }}>{item.name}</span>
            </div>
            {item.modifiers?.map((m, j) => (
              <div key={j} style={{
                fontSize: '20px', color: '#000', fontWeight: 700,
                textAlign: 'right', paddingRight: '50px', marginTop: '2px',
              }}>
                + {m.option_name}
              </div>
            ))}
            {item.note && (
              <div style={{
                fontSize: '20px', fontWeight: 900, color: '#000',
                textAlign: 'right', paddingRight: '50px', marginTop: '4px',
                background: '#eee', padding: '4px 8px', borderRadius: '4px',
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
          <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />
          <div style={{
            fontSize: '22px', fontWeight: 900,
            background: '#eee', padding: '8px 10px', borderRadius: '4px',
            border: '2px solid #000',
          }}>
            ملاحظات: {order.orderNote}
          </div>
        </>
      )}

      <div style={{ height: '20px' }} />
    </div>
  );
});

KitchenTicketTemplate.displayName = 'KitchenTicketTemplate';

export default KitchenTicketTemplate;
