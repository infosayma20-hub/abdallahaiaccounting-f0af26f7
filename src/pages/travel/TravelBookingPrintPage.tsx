import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { ArrowRight, Printer } from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  hajj: "حج", umrah: "عمرة", flight: "تذاكر طيران", hotel: "فنادق",
  visa: "تأشيرة", tourism_package: "باقة سياحية", honeymoon: "شهر عسل",
  transport: "نقل وترانسفير", insurance: "تأمين سفر", package: "باقة", transfer: "ترانسفير",
};

const ITEM_LABELS: Record<string, string> = {
  visa: "تأشيرة", flight: "طيران", hotel: "فندق", transport_air: "نقل جوي",
  transport_ground: "نقل بري", insurance: "تأمين", guide: "مرشد", meal_plan: "وجبات", other: "أخرى",
};

export default function TravelBookingPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [printType, setPrintType] = useState<"invoice" | "voucher">("invoice");

  useEffect(() => {
    if (!id || !user) return;
    const fetch = async () => {
      const [bRes, iRes, pRes, prRes] = await Promise.all([
        supabase.from("travel_bookings").select("*").eq("id", id!).eq("user_id", dataOwnerId!).single(),
        supabase.from("travel_booking_items").select("*").eq("booking_id", id).order("sort_order"),
        supabase.from("travel_booking_passengers").select("*").eq("booking_id", id).order("passenger_index"),
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      ]);
      if (bRes.data) setBooking(bRes.data);
      if (iRes.data) setItems(iRes.data);
      if (pRes.data) setPassengers(pRes.data);
      if (prRes.data) setProfile(prRes.data);
    };
    fetch();
  }, [id, user]);

  if (!booking) return <div className="text-center py-20">جارٍ التحميل...</div>;

  const balance = (booking.selling_price || 0) - (booking.amount_paid || 0);

  return (
    <div dir="rtl">
      {/* Controls (hidden on print) */}
      <div className="flex items-center gap-3 mb-4 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/travel/bookings/${id}`)}><ArrowRight className="w-5 h-5" /></Button>
        <div className="flex gap-2">
          <Button variant={printType === "invoice" ? "default" : "outline"} size="sm" onClick={() => setPrintType("invoice")} style={printType === "invoice" ? { background: "#0D1B2E" } : {}}>فاتورة مبيعات</Button>
          <Button variant={printType === "voucher" ? "default" : "outline"} size="sm" onClick={() => setPrintType("voucher")} style={printType === "voucher" ? { background: "#0D1B2E" } : {}}>وصل حجز</Button>
        </div>
        <Button onClick={() => window.print()} style={{ background: "#C9A84C" }} className="text-white"><Printer className="w-4 h-4 ml-1" /> طباعة</Button>
      </div>

      {/* Print Area */}
      <div className="max-w-[210mm] mx-auto bg-white text-black p-8 print:p-6" style={{ fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 pb-4 mb-4" style={{ borderColor: "#0D1B2E" }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>{profile?.company_name || "شركة السياحة والسفر"}</h1>
            <p className="text-xs text-gray-500">{profile?.display_name}</p>
          </div>
          <div className="text-left">
            <p className="font-bold" style={{ color: "#C9A84C" }}>{printType === "invoice" ? "فاتورة مبيعات" : "وصل حجز سفر"}</p>
            <p className="font-mono text-sm">{booking.booking_number}</p>
            <p className="text-xs text-gray-500">{booking.booking_date}</p>
          </div>
        </div>

        {/* Client Info */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
          <div className="p-3 rounded border">
            <p className="font-bold mb-1" style={{ color: "#0D1B2E" }}>بيانات العميل</p>
            <p>الاسم: {booking.customer_name || "—"}</p>
            <p>الهاتف: {booking.customer_phone || "—"}</p>
          </div>
          <div className="p-3 rounded border">
            <p className="font-bold mb-1" style={{ color: "#0D1B2E" }}>بيانات الحجز</p>
            <p>نوع الخدمة: {SERVICE_LABELS[booking.service_type] || booking.service_type}</p>
            <p>الوجهة: {booking.destination || "—"}</p>
            <p>التواريخ: {booking.travel_date || "—"} → {booking.return_date || "—"}</p>
            {booking.supplier_ref && <p>رقم PNR: {booking.supplier_ref}</p>}
          </div>
        </div>

        {printType === "invoice" ? (
          <>
            {/* Invoice Items Table */}
            <table className="w-full mb-4 text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0D1B2E", color: "#fff" }}>
                  <th className="py-2 px-3 text-right">#</th>
                  <th className="py-2 px-3 text-right">البيان</th>
                  <th className="py-2 px-3 text-right">الكمية</th>
                  <th className="py-2 px-3 text-right">السعر</th>
                  <th className="py-2 px-3 text-right">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((it, i) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td className="py-2 px-3">{i + 1}</td>
                    <td className="py-2 px-3">{it.description || ITEM_LABELS[it.item_type] || it.item_type}</td>
                    <td className="py-2 px-3">{it.quantity || 1}</td>
                    <td className="py-2 px-3">₪{(it.unit_price || 0).toLocaleString()}</td>
                    <td className="py-2 px-3">₪{((it.quantity || 1) * (it.unit_price || 0)).toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    <td className="py-2 px-3">1</td>
                    <td className="py-2 px-3">{SERVICE_LABELS[booking.service_type]} — {booking.destination}</td>
                    <td className="py-2 px-3">1</td>
                    <td className="py-2 px-3">₪{(booking.selling_price || 0).toLocaleString()}</td>
                    <td className="py-2 px-3">₪{(booking.selling_price || 0).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-64 text-xs space-y-1">
                <div className="flex justify-between font-bold text-sm border-t pt-2" style={{ borderColor: "#0D1B2E" }}>
                  <span>الإجمالي:</span><span>₪{(booking.selling_price || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between"><span>المدفوع:</span><span>₪{(booking.amount_paid || 0).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold" style={{ color: balance > 0 ? "#DC2626" : "#16A34A" }}>
                  <span>المتبقي:</span><span>₪{balance.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Voucher: Passengers */}
            {passengers.length > 0 && (
              <div className="mb-4">
                <p className="font-bold mb-2 text-sm" style={{ color: "#0D1B2E" }}>المسافرون</p>
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#0D1B2E", color: "#fff" }}>
                      <th className="py-2 px-3 text-right">#</th>
                      <th className="py-2 px-3 text-right">الاسم</th>
                      <th className="py-2 px-3 text-right">رقم الجواز</th>
                      <th className="py-2 px-3 text-right">تاريخ الانتهاء</th>
                      <th className="py-2 px-3 text-right">الجنسية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passengers.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td className="py-2 px-3">{i + 1}</td>
                        <td className="py-2 px-3">{p.full_name}</td>
                        <td className="py-2 px-3 font-mono">{p.passport_number || "—"}</td>
                        <td className="py-2 px-3">{p.passport_expiry || "—"}</td>
                        <td className="py-2 px-3">{p.nationality || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Voucher: Itinerary */}
            {items.length > 0 && (
              <div className="mb-4">
                <p className="font-bold mb-2 text-sm" style={{ color: "#0D1B2E" }}>تفاصيل الرحلة والإقامة</p>
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th className="py-2 px-3 text-right">الخدمة</th>
                      <th className="py-2 px-3 text-right">الوصف</th>
                      <th className="py-2 px-3 text-right">المدينة</th>
                      <th className="py-2 px-3 text-right">من</th>
                      <th className="py-2 px-3 text-right">إلى</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td className="py-2 px-3">{ITEM_LABELS[it.item_type] || it.item_type}</td>
                        <td className="py-2 px-3">{it.description}</td>
                        <td className="py-2 px-3">{it.city || "—"}</td>
                        <td className="py-2 px-3">{it.check_in_date || "—"}</td>
                        <td className="py-2 px-3">{it.check_out_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Notes */}
        {booking.notes && (
          <div className="p-3 rounded border mb-4 text-xs">
            <p className="font-bold mb-1">ملاحظات:</p>
            <p>{booking.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t pt-4 mt-8 flex justify-between text-xs text-gray-400" style={{ borderColor: "#0D1B2E" }}>
          <span>توقيع وختم الشركة: ________________</span>
          <span>AMWALI © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}
