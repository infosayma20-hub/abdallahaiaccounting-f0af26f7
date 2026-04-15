import { useCompanySettings } from "@/hooks/useCompanySettings";

interface PrintOrderProps {
  order: any;
  items: any[];
  type: "order" | "invoice";
}

export function generateWhatsAppText(order: any, items: any[]) {
  const lines = items.map(i => `• ${i.item_name} — ${i.quantity} ${i.unit}`).join("\n");
  const total = items.reduce((s: number, i: any) => s + (i.quantity * i.unit_price), 0);
  return encodeURIComponent(
    `📦 طلبية مشتريات\n━━━━━━━━━━━━━━━━━\nرقم الطلبية: ${order.order_number}\nالمورد: ${order.supplier?.name || "—"}\nالفرع: ${order.branch?.name || "—"}\nالتاريخ: ${new Date(order.order_date).toLocaleDateString("en-GB")}\n━━━━━━━━━━━━━━━━━\nالأصناف:\n${lines}\n━━━━━━━━━━━━━━━━━\nالقيمة التقديرية: ₪ ${total.toFixed(2)}\n${order.notes ? `ملاحظات: ${order.notes}` : ""}`
  );
}

export function ProcurementPrintView({ order, items, type }: PrintOrderProps) {
  const { settings } = useCompanySettings();
  const total = items.reduce((s: number, i: any) => s + (i.quantity * (i.unit_price || 0)), 0);

  return (
    <div id="procurement-print" className="print-only bg-white text-black p-8 max-w-[210mm] mx-auto text-sm" dir="rtl" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-black">
        <div>
          {settings.logo_url && <img src={settings.logo_url} alt="Logo" className="h-14 object-contain" />}
        </div>
        <div className="text-center flex-1">
          <h1 className="text-xl font-bold">{type === "order" ? "طلبية مشتريات" : "فاتورة مشتريات"}</h1>
        </div>
        <div className="text-left">
          <p className="font-bold">{settings.company_name || "الشركة"}</p>
          {settings.phone && <p className="text-xs">{settings.phone}</p>}
          {settings.phone2 && <p className="text-xs">{settings.phone2}</p>}
        </div>
      </div>

      {/* Order Info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 text-xs">
        <p><strong>رقم {type === "order" ? "الطلبية" : "الفاتورة"}:</strong> {order.order_number || order.invoice_number}</p>
        <p><strong>التاريخ:</strong> {new Date(order.order_date || order.invoice_date).toLocaleDateString("en-GB")}</p>
        <p><strong>المورد:</strong> {order.supplier?.name || order.supplier_name || "—"}</p>
        <p><strong>الهاتف:</strong> {order.supplier?.phone || "—"}</p>
        <p><strong>الفرع:</strong> {order.branch?.name || "—"}</p>
        {order.expected_delivery_date && <p><strong>تاريخ التسليم:</strong> {new Date(order.expected_delivery_date).toLocaleDateString("en-GB")}</p>}
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">#</th>
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">الصنف</th>
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">الوحدة</th>
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">الكمية</th>
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">السعر</th>
            <th className="border border-gray-400 px-2 py-1 text-right text-xs">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="border border-gray-300 px-2 py-1 text-xs">{idx + 1}</td>
              <td className="border border-gray-300 px-2 py-1 text-xs">{item.item_name || item.product_name}</td>
              <td className="border border-gray-300 px-2 py-1 text-xs">{item.unit}</td>
              <td className="border border-gray-300 px-2 py-1 text-xs">{item.quantity || item.received_quantity}</td>
              <td className="border border-gray-300 px-2 py-1 text-xs">{Number(item.unit_price || 0).toFixed(2)}</td>
              <td className="border border-gray-300 px-2 py-1 text-xs">{((item.quantity || item.received_quantity || 0) * (item.unit_price || 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end mb-6">
        <div className="border border-gray-400 px-4 py-2">
          <p className="font-bold text-sm">{type === "order" ? "الإجمالي التقديري" : "الإجمالي"}: {total.toFixed(2)} ₪</p>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="mb-6">
          <p className="text-xs"><strong>ملاحظات:</strong> {order.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="flex justify-between mt-12 pt-4">
        <div className="text-center">
          <div className="border-b border-black w-40 mb-1" />
          <p className="text-xs">توقيع مسؤول المشتريات</p>
        </div>
        <div className="text-center">
          <div className="border-b border-black w-40 mb-1" />
          <p className="text-xs">توقيع المورد</p>
        </div>
      </div>
    </div>
  );
}

export default ProcurementPrintView;
