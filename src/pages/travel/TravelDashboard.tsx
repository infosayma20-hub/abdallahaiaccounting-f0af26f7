import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plane, Plus, Users, TrendingUp, AlertTriangle, DollarSign, Calendar, FileWarning, Clock } from "lucide-react";

const SERVICE_ICONS: Record<string, string> = {
  flight: "✈️", hotel: "🏨", visa: "📋", package: "📦",
  honeymoon: "💍", umrah: "🕋", hajj: "🕌", transfer: "🚐", insurance: "🛡️",
};
const SERVICE_LABELS: Record<string, string> = {
  flight: "تذاكر طيران", hotel: "فنادق", visa: "تأشيرة", package: "باقة سياحية",
  honeymoon: "شهر عسل", umrah: "عمرة", hajj: "حج", transfer: "ترانسفير", insurance: "تأمين سفر",
};

export default function TravelDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("travel_bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("travel_booking_passengers").select("passenger_name, passport_expiry, booking_id"),
    ]).then(([bRes, pRes]) => {
      if (bRes.data) setBookings(bRes.data);
      if (pRes.data) setPassengers(pRes.data);
      setLoading(false);
    });
  }, [user]);

  const today = new Date().toISOString().split("T")[0];
  const thisMonth = new Date().toISOString().slice(0, 7);
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  const sixMonthsStr = sixMonthsFromNow.toISOString().split("T")[0];

  const monthBookings = bookings.filter(b => b.booking_date?.startsWith(thisMonth));
  const todayBookings = bookings.filter(b => b.booking_date === today);
  const totalSalesMonth = monthBookings.reduce((s, b) => s + (b.selling_price || 0), 0);
  const totalPaidMonth = monthBookings.reduce((s, b) => s + (b.amount_paid || 0), 0);
  const totalProfitMonth = monthBookings.reduce((s, b) => s + ((b.selling_price || 0) - (b.cost_price_ils || 0)), 0);

  const overdueBookings = bookings.filter(b => b.payment_status !== "paid" && b.status !== "cancelled" && (b.selling_price || 0) - (b.amount_paid || 0) > 0);

  // Smart alerts: passport expiry within 6 months
  const expiringPassports = passengers.filter(p => p.passport_expiry && p.passport_expiry <= sixMonthsStr && p.passport_expiry > today);
  const expiredPassports = passengers.filter(p => p.passport_expiry && p.passport_expiry <= today);

  // Smart alerts: upcoming travel with unpaid balance (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split("T")[0];
  const upcomingUnpaid = bookings.filter(b =>
    b.travel_date && b.travel_date >= today && b.travel_date <= thirtyDaysStr &&
    b.status !== "cancelled" && b.payment_status !== "paid" &&
    (b.selling_price || 0) - (b.amount_paid || 0) > 0
  );

  // Service breakdown
  const serviceBreakdown: Record<string, number> = {};
  monthBookings.forEach(b => {
    serviceBreakdown[b.service_type] = (serviceBreakdown[b.service_type] || 0) + (b.selling_price || 0);
  });
  const sortedServices = Object.entries(serviceBreakdown).sort((a, b) => b[1] - a[1]);

  const recentBookings = bookings.slice(0, 5);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(27,58,92,0.1)" }}>
            <Plane className="w-5 h-5" style={{ color: "#1B3A5C" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>إدارة مالية السياحة والسفر</h1>
            <p className="text-xs text-muted-foreground">حجوزات، موردون، عمولات، وأرباح</p>
          </div>
        </div>
        <Button onClick={() => navigate("/travel/bookings/new")} style={{ background: "#1B3A5C" }} className="text-white">
          <Plus className="w-4 h-4 ml-1" /> حجز جديد
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">حجوزات اليوم</span>
          </div>
          <p className="text-2xl font-bold">{todayBookings.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground">مبيعات الشهر</span>
          </div>
          <p className="text-2xl font-bold">₪{totalSalesMonth.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">أرباح الشهر</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">₪{totalProfitMonth.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-violet-500" />
            <span className="text-xs text-muted-foreground">مدفوعات مستلمة</span>
          </div>
          <p className="text-2xl font-bold">₪{totalPaidMonth.toLocaleString()}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Service breakdown */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="font-semibold mb-4 text-sm">مبيعات الشهر حسب نوع الخدمة</h3>
          {sortedServices.length > 0 ? (
            <div className="space-y-3">
              {sortedServices.map(([type, amount]) => {
                const pct = totalSalesMonth > 0 ? Math.round((amount / totalSalesMonth) * 100) : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-lg w-8">{SERVICE_ICONS[type] || "📌"}</span>
                    <span className="text-sm w-28">{SERVICE_LABELS[type] || type}</span>
                    <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#1B3A5C" }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-left">{pct}%</span>
                    <span className="text-sm font-medium w-24 text-left">₪{amount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد حجوزات هذا الشهر</p>
          )}
        </Card>

        {/* Smart Alerts */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 text-sm">تنبيهات ذكية</h3>
          <div className="space-y-3">
            {expiredPassports.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                <FileWarning className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">جوازات منتهية الصلاحية</p>
                  <p className="text-xs text-red-600 dark:text-red-300">{expiredPassports.length} مسافر بجواز منتهي</p>
                </div>
              </div>
            )}
            {expiringPassports.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                <FileWarning className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-orange-700 dark:text-orange-400">جوازات تنتهي قريباً</p>
                  <p className="text-xs text-orange-600 dark:text-orange-300">{expiringPassports.length} مسافر جوازه ينتهي خلال 6 أشهر</p>
                </div>
              </div>
            )}
            {upcomingUnpaid.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">سفر قريب غير مكتمل الدفع</p>
                  <p className="text-xs text-amber-600 dark:text-amber-300">{upcomingUnpaid.length} حجز يسافر خلال 30 يوم بدون دفع كامل</p>
                </div>
              </div>
            )}
            {overdueBookings.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">رصيد مستحق</p>
                  <p className="text-xs text-red-600 dark:text-red-300">{overdueBookings.length} حجوزات بها رصيد متأخر</p>
                </div>
              </div>
            )}
            {totalProfitMonth > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">أرباح هذا الشهر</p>
                  <p className="text-xs text-green-600 dark:text-green-300">₪{totalProfitMonth.toLocaleString()}</p>
                </div>
              </div>
            )}
            {overdueBookings.length === 0 && totalProfitMonth === 0 && expiringPassports.length === 0 && expiredPassports.length === 0 && upcomingUnpaid.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">لا توجد تنبيهات حالياً</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">آخر الحجوزات</h3>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/travel/bookings")}>عرض الكل</Button>
        </div>
        {recentBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-right py-2 pr-2">رقم الحجز</th>
                  <th className="text-right py-2">العميل</th>
                  <th className="text-right py-2">الخدمة</th>
                  <th className="text-right py-2">الوجهة</th>
                  <th className="text-right py-2">سعر البيع</th>
                  <th className="text-right py-2">الربح</th>
                  <th className="text-right py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map(b => {
                  const profit = (b.selling_price || 0) - (b.cost_price_ils || 0);
                  return (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/travel/bookings/${b.id}`)}>
                      <td className="py-2 pr-2 font-mono text-xs">{b.booking_number}</td>
                      <td className="py-2">{b.customer_name || "—"}</td>
                      <td className="py-2">{SERVICE_ICONS[b.service_type]} {SERVICE_LABELS[b.service_type] || b.service_type}</td>
                      <td className="py-2">{b.destination || "—"}</td>
                      <td className="py-2 font-medium">₪{(b.selling_price || 0).toLocaleString()}</td>
                      <td className="py-2" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</td>
                      <td className="py-2">
                        <Badge variant={b.payment_status === "paid" ? "success" : b.payment_status === "partial" ? "warning" : "outline"} className="text-[10px]">
                          {b.payment_status === "paid" ? "مدفوع" : b.payment_status === "partial" ? "جزئي" : "غير مدفوع"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد حجوزات بعد — ابدأ بإضافة أول حجز!</p>
        )}
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "الحجوزات", icon: "✈️", path: "/travel/bookings" },
          { label: "الموردون", icon: "🤝", path: "/travel/suppliers" },
          { label: "الباقات", icon: "📦", path: "/travel/packages" },
          { label: "التقارير", icon: "📊", path: "/travel/reports" },
          { label: "الإعدادات", icon: "⚙️", path: "/travel/settings" },
        ].map(link => (
          <Card key={link.path} className="p-4 cursor-pointer hover:shadow-md transition-shadow text-center" onClick={() => navigate(link.path)}>
            <span className="text-2xl">{link.icon}</span>
            <p className="text-sm font-medium mt-2">{link.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
