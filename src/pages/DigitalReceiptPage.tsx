import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const DigitalReceiptPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [cashierName, setCashierName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    loadReceipt();
  }, [orderId]);

  const loadReceipt = async () => {
    try {
      const { data: orderData, error: oErr } = await supabase
        .from("pos_orders")
        .select("*")
        .eq("id", orderId)
        .single();
      if (oErr || !orderData) { setError("الفاتورة غير موجودة"); setLoading(false); return; }
      setOrder(orderData);

      const [linesRes, companyRes, sessionRes] = await Promise.all([
        supabase.from("pos_order_lines").select("*").eq("order_id", orderId),
        supabase.from("companies").select("name, logo_url, phone, address").eq("id", (orderData as any).company_id).single(),
        supabase.from("pos_sessions").select("cashier_name").eq("id", (orderData as any).session_id).single(),
      ]);

      setLines(linesRes.data || []);
      setCompany(companyRes.data);
      setCashierName((sessionRes.data as any)?.cashier_name || "");
    } catch { setError("خطأ في تحميل الفاتورة"); }
    setLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
      <div className="text-center p-8">
        <p className="text-2xl mb-2">😔</p>
        <p className="text-gray-600">{error || "الفاتورة غير موجودة"}</p>
      </div>
    </div>
  );

  const orderDate = new Date(order.created_at);
  const discountPct = (order as any).customer_discount_pct || 0;
  const surveyToken = (order as any).survey_token;

  return (
    <div className="min-h-screen bg-[#faf9f6] py-4 px-3" dir="rtl">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a1a2e] text-white text-center py-6 px-4">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company?.name} className="h-12 mx-auto mb-2 object-contain" />
          ) : (
            <h1 className="text-2xl font-bold">{company?.name || "شركتي"}</h1>
          )}
          {company?.phone && <p className="text-xs text-white/60 mt-1">{company.phone}</p>}
        </div>

        {/* Order info */}
        <div className="bg-[#f8f8ff] px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">نسخة العميل | Customer Copy</span>
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-[13px]">
            <span className="text-gray-500">تاريخ | Date</span>
            <span className="text-left font-mono" dir="ltr">
              {orderDate.toLocaleDateString("ar-PS")} {orderDate.toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-gray-500">البائع | Sales Person</span>
            <span className="text-left">{cashierName}</span>
            <span className="text-gray-500">رقم الفاتورة | Receipt#</span>
            <span className="text-left font-bold font-mono">{order.order_number}</span>
          </div>
        </div>

        {/* Items */}
        <div className="px-5 py-4">
          <h3 className="text-center text-red-600 font-bold text-sm mb-3">
            تفاصيل الفاتورة | Invoice Detail
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-right py-2 font-semibold text-gray-600">ITEMS</th>
                <th className="text-center py-2 font-semibold text-gray-600 w-16">QTY</th>
                <th className="text-left py-2 font-semibold text-gray-600 w-24">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium text-gray-800">{line.product_name}</p>
                    <p className="text-[11px] text-gray-400 font-mono" dir="ltr">
                      ₪{line.unit_price?.toFixed(2)} × {line.qty}
                    </p>
                    {line.discount_pct > 0 && (
                      <p className="text-[11px] text-red-500">خصم: {line.discount_pct}%</p>
                    )}
                  </td>
                  <td className="text-center font-mono">{line.qty}</td>
                  <td className="text-left font-mono font-bold">₪{line.total?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t-2 border-gray-200 space-y-2">
          <div className="flex justify-between text-[13px]">
            <span className="text-gray-500">المجموع قبل الضريبة | Total Before VAT</span>
            <span className="font-mono">₪{order.subtotal?.toFixed(2)}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-[13px] text-red-600">
              <span>خصم العميل {discountPct}%</span>
              <span className="font-mono">-₪{order.discount_amount?.toFixed(2)}</span>
            </div>
          )}
          {order.tax_amount > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-gray-500">ضريبة | VAT</span>
              <span className="font-mono">₪{order.tax_amount?.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-[#1a1a2e]">
            <span className="font-bold text-lg">المجموع | Total</span>
            <span className="font-bold text-lg font-mono text-green-600">₪{order.total?.toFixed(2)}</span>
          </div>
        </div>

        {/* Survey CTA */}
        {surveyToken && (
          <div className="px-5 py-4 text-center bg-blue-50 border-t border-blue-100">
            <p className="text-sm text-gray-700 mb-2">شاركنا رأيك واربح كوبون خصم 🎁</p>
            <a
              href={`/survey/${surveyToken}`}
              className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              📋 تقييم تجربتك
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-5 bg-gray-50 border-t">
          <p className="text-sm font-bold text-gray-700">شكراً لتعاملكم معنا ❤️</p>
          <p className="text-[11px] text-gray-400 mt-1">Thank you for your purchase</p>
        </div>
      </div>
    </div>
  );
};

export default DigitalReceiptPage;
