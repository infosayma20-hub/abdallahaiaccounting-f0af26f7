/**
 * Kitchen Ticket Template — renders as off-screen HTML for html2canvas capture.
 * Width: 384px (58mm thermal printer @ 203 DPI)
 * Used for: Kitchen, Grill (Sakhaan), Pizza printers
 */
import { forwardRef } from "react";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";

interface Props {
  order: PrintOrder;
  items: PrintItem[];
  stationName?: string;
}

const KitchenTicketTemplate = forwardRef<HTMLDivElement, Props>(({ order, items, stationName }, ref) => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB');

  const qNum = order.queueNumber || order.orderNumber || '---';

  const orderTypeLabel = order.orderType === 'takeaway' ? 'تيك اواي - Take Away' 
    : order.orderType === 'delivery' ? 'توصيل - Delivery' 
    : 'محل - Dine In';

  const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: '384px',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: "'Cairo', 'Noto Sans Arabic', 'Arial', sans-serif",
        fontSize: '22px',
        lineHeight: '1.3',
        padding: '12px 14px',
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
      {/* Station Name */}
      {stationName && (
        <div style={{
          textAlign: 'center',
          fontSize: '26px',
          fontWeight: 700,
          padding: '6px 0',
          borderBottom: '3px solid #000',
          marginBottom: '8px',
        }}>
          [ {stationName} ]
        </div>
      )}

      {/* Order Number — BIG */}
      <div style={{
        textAlign: 'center',
        fontSize: '40px',
        fontWeight: 700,
        margin: '6px 0',
      }}>
        # {qNum}
      </div>

      {/* Order Type */}
      <div style={{
        textAlign: 'center',
        fontSize: '24px',
        fontWeight: 700,
        padding: '6px',
        border: '2px solid #000',
        margin: '6px 0',
      }}>
        {orderTypeLabel}
      </div>

      {/* Info */}
      <div style={{ fontSize: '18px', margin: '6px 0' }}>
        <InfoRow label="التاريخ" value={dateStr} />
        <InfoRow label="الوقت" value={timeStr} />
        {order.tableNumber && <InfoRow label="طاولة" value={order.tableNumber} />}
        <InfoRow label="مجموع الكميات" value={String(totalQty)} />
      </div>

      <Separator />

      {/* Items Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '20px', borderBottom: '2px solid #000', paddingBottom: '4px' }}>
        <span>الكمية</span>
        <span>الاسم</span>
      </div>

      {/* Items */}
      {items.map((item, i) => {
        const qty = item.quantity || 1;
        return (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px dashed #999' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '26px', fontWeight: 700, minWidth: '40px' }}>{qty}</span>
              <span style={{ fontSize: '22px', fontWeight: 600, textAlign: 'right', flex: 1 }}>{item.name}</span>
            </div>
            {/* Modifiers */}
            {item.modifiers?.map((m, j) => (
              <div key={j} style={{ fontSize: '18px', color: '#444', textAlign: 'right', paddingRight: '40px' }}>
                + {m.option_name}
              </div>
            ))}
            {/* Note */}
            {item.note && (
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#333', textAlign: 'right', paddingRight: '40px' }}>
                &gt;&gt;&gt; {item.note}
              </div>
            )}
          </div>
        );
      })}

      {/* Order Note */}
      {order.orderNote && (
        <>
          <Separator />
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            ملاحظات الطلبية: {order.orderNote}
          </div>
        </>
      )}

      <div style={{ height: '16px' }} />
    </div>
  );
});

KitchenTicketTemplate.displayName = 'KitchenTicketTemplate';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Separator() {
  return <div style={{ borderTop: '2px solid #000', margin: '8px 0' }} />;
}

export default KitchenTicketTemplate;
