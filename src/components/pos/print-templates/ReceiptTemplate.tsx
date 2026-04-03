/**
 * Receipt Template — renders as an off-screen HTML element for html2canvas capture.
 * Width: 576px (80mm thermal printer @ 203 DPI)
 * Design: improved Arabic receipt with clear layout.
 */
import { forwardRef } from "react";
import type { PrintOrder } from "@/hooks/usePrintBridge";

interface Props {
  order: PrintOrder;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  taxNumber?: string;
}

const ReceiptTemplate = forwardRef<HTMLDivElement, Props>(({ order, companyName, companyPhone, companyAddress, taxNumber }, ref) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB');
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const orderTypeLabel = order.orderType === 'takeaway' ? 'تيك اواي' 
    : order.orderType === 'delivery' ? 'توصيل' 
    : 'محل';

  const qNum = order.queueNumber || order.orderNumber || '---';

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: '576px',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: "'Cairo', 'Noto Sans Arabic', 'Arial', sans-serif",
        fontSize: '22px',
        lineHeight: '1.4',
        padding: '16px 20px',
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '28px', fontWeight: 700 }}>{companyName || 'مطاعم الدجاج الملكي'}</div>
        <div style={{ fontSize: '16px', color: '#555' }}>Malaki Broast Chicken</div>
        {companyAddress && <div style={{ fontSize: '16px', color: '#555' }}>{companyAddress}</div>}
        {companyPhone && <div style={{ fontSize: '16px', color: '#555' }}>{companyPhone}</div>}
        {taxNumber && <div style={{ fontSize: '14px', color: '#777' }}>الرقم الضريبي: {taxNumber}</div>}
      </div>

      <Separator />

      {/* Order Info */}
      <div style={{ fontSize: '28px', fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>
        # {qNum}
      </div>

      <InfoRow label="التاريخ" value={order.date || dateStr} />
      <InfoRow label="الوقت" value={order.time || timeStr} />
      <InfoRow label="النوع" value={orderTypeLabel} />
      {order.branchName && <InfoRow label="الفرع" value={order.branchName} />}
      {order.cashier && <InfoRow label="الكاشير" value={order.cashier} />}
      {order.tableNumber && <InfoRow label="طاولة" value={order.tableNumber} />}

      <DashLine />

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '20px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000' }}>
            <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 700 }}>الصنف</th>
            <th style={{ textAlign: 'center', padding: '4px 0', fontWeight: 700, width: '50px' }}>الكمية</th>
            <th style={{ textAlign: 'center', padding: '4px 0', fontWeight: 700, width: '70px' }}>السعر</th>
            <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 700, width: '80px' }}>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, i) => {
            const qty = item.quantity || 1;
            const lineTotal = (qty * (item.price || 0)).toFixed(2);
            return (
              <tr key={i} style={{ borderBottom: '1px dashed #ccc' }}>
                <td style={{ padding: '6px 0', textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  {item.note && <div style={{ fontSize: '16px', color: '#666' }}>* {item.note}</div>}
                  {item.modifiers?.map((m, j) => (
                    <div key={j} style={{ fontSize: '16px', color: '#666' }}>+ {m.option_name}</div>
                  ))}
                </td>
                <td style={{ textAlign: 'center' }}>{qty}</td>
                <td style={{ textAlign: 'center' }}>{(item.price || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'left' }}>{lineTotal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Separator />

      {/* Totals */}
      {order.subtotal != null && order.discount != null && Number(order.discount) > 0 && (
        <>
          <InfoRow label="المجموع الفرعي" value={`${Number(order.subtotal).toFixed(2)} شيكل`} />
          <InfoRow label="الخصم" value={`-${Number(order.discount).toFixed(2)} شيكل`} />
        </>
      )}

      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        textAlign: 'center',
        margin: '10px 0',
        padding: '8px',
        border: '2px solid #000',
      }}>
        المبلغ للدفع {Number(order.total || 0).toFixed(2)} شيكل
      </div>

      {order.paymentMethod && <InfoRow label="طريقة الدفع" value={order.paymentMethod} />}
      
      {order.tenderedAmount != null && Number(order.tenderedAmount) > 0 && (
        <>
          <InfoRow label="المبلغ المدفوع" value={`${Number(order.tenderedAmount).toFixed(2)} شيكل`} />
          {order.change != null && <InfoRow label="الباقي" value={`${Number(order.change).toFixed(2)} شيكل`} />}
        </>
      )}

      {order.foreignAmount != null && Number(order.foreignAmount) > 0 && (
        <InfoRow label="المبلغ بالعملة الأجنبية" value={`${Number(order.foreignAmount).toFixed(2)}`} />
      )}

      {order.orderNote && (
        <>
          <DashLine />
          <div style={{ fontSize: '18px' }}>
            <span style={{ fontWeight: 700 }}>ملاحظات: </span>{order.orderNote}
          </div>
        </>
      )}

      <Separator />

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 600, marginTop: '8px' }}>
        شكراً لزيارتكم
      </div>
      <div style={{ textAlign: 'center', fontSize: '16px', color: '#666' }}>
        Thank You!
      </div>
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '20px' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Separator() {
  return <div style={{ borderTop: '2px solid #000', margin: '8px 0' }} />;
}

function DashLine() {
  return <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />;
}

export default ReceiptTemplate;
