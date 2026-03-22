import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { multiWordMatchAny } from "@/lib/utils";

const SERVICE_LABELS: Record<string, string> = {
  flight: "✈️ تذاكر طيران", hotel: "🏨 فنادق", visa: "📋 تأشيرة", package: "📦 باقة سياحية",
  honeymoon: "💍 شهر عسل", umrah: "🕋 عمرة", hajj: "🕌 حج", transfer: "🚐 ترانسفير", insurance: "🛡️ تأمين",
};
const STATUS_LABELS: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "outline" },
  confirmed: { label: "مؤكد", variant: "default" },
  issued: { label: "صدرت", variant: "success" },
  cancelled: { label: "ملغى", variant: "destructive" },
  refunded: { label: "مُسترد", variant: "warning" },
};
const PAYMENT_LABELS: Record<string, { label: string; variant: "success" | "warning" | "outline" }> = {
  paid: { label: "مدفوع", variant: "success" },
  partial: { label: "جزئي", variant: "warning" },
  unpaid: { label: "غير مدفوع", variant: "outline" },
};

export default function TravelBookingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  useEffect(() => {
    if (!user) return;
    fetchBookings();
  }, [user]);

  const fetchBookings = async () => {
    const { data } = await supabase.from("travel_bookings").select("*, supplier:travel_suppliers(name)").order("created_at", { ascending: false });
    if (data) setBookings(data);
    setLoading(false);
  };

  const openDetail = async (booking: any) => {
    setSelected(booking);
    const [pRes, psRes] = await Promise.all([
      supabase.from("travel_booking_payments").select("*").eq("booking_id", booking.id).order("payment_date", { ascending: false }),
      supabase.from("travel_booking_passengers").select("*").eq("booking_id", booking.id),
    ]);
    if (pRes.data) setPayments(pRes.data);
    if (psRes.data) setPassengers(psRes.data);
  };

  const handleAddPayment = async () => {
    if (!selected || !payAmount || !user) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    const newPaid = (selected.amount_paid || 0) + amt;
    const newStatus = newPaid >= selected.selling_price ? "paid" : "partial";

    await supabase.from("travel_booking_payments").insert({
      user_id: user.id,
      booking_id: selected.id,
      amount: amt,
      amount_ils: amt,
      payment_method: payMethod,
    });
    await supabase.from("travel_bookings").update({
      amount_paid: newPaid,
      payment_status: newStatus,
    }).eq("id", selected.id);

    // Create journal entry: debit cash, credit receivables
    await supabase.from("transactions").insert({
      user_id: user.id,
      transaction_date: new Date().toISOString().split("T")[0],
      description: `دفعة حجز سياحي - ${selected.booking_number} - ${selected.customer_name || ""}`,
      debit_account_code: payMethod === "bank_transfer" ? "1120" : "1110",
      credit_account_code: "1130",
      amount: amt,
      currency: "شيكل",
      transaction_type: "travel_payment",
      reference: selected.booking_number,
      payment_method: payMethod === "cash" ? "نقدي" : payMethod === "bank_transfer" ? "بنك" : payMethod,
      idempotency_key: `TRVPAY-${selected.id}-${Date.now()}`,
    });

    toast({ title: "تم تسجيل الدفعة بنجاح ✅" });
    setPayAmount("");
    fetchBookings();
    openDetail({ ...selected, amount_paid: newPaid, payment_status: newStatus });
  };

  const filtered = bookings.filter(b => {
    if (search && !b.booking_number?.includes(search) && !b.customer_name?.toLowerCase().includes(search.toLowerCase()) && !b.destination?.includes(search)) return false;
    if (serviceFilter !== "all" && b.service_type !== serviceFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>✈️ الحجوزات</h1>
        <Button onClick={() => navigate("/travel/bookings/new")} style={{ background: "#1B3A5C" }} className="text-white">
          <Plus className="w-4 h-4 ml-1" /> حجز جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالرقم، العميل، الوجهة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="نوع الخدمة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الخدمات</SelectItem>
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
              <th className="text-right py-3 px-3">رقم الحجز</th>
              <th className="text-right py-3 px-2">العميل</th>
              <th className="text-right py-3 px-2">الخدمة</th>
              <th className="text-right py-3 px-2">الوجهة</th>
              <th className="text-right py-3 px-2">سعر البيع</th>
              <th className="text-right py-3 px-2">المدفوع</th>
              <th className="text-right py-3 px-2">الرصيد</th>
              <th className="text-right py-3 px-2">الربح</th>
              <th className="text-right py-3 px-2">الحالة</th>
              <th className="text-right py-3 px-2">الدفع</th>
              <th className="py-3 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const profit = (b.selling_price || 0) - (b.cost_price_ils || 0);
              const balance = (b.selling_price || 0) - (b.amount_paid || 0);
              const pay = PAYMENT_LABELS[b.payment_status] || PAYMENT_LABELS.unpaid;
              const st = STATUS_LABELS[b.status] || STATUS_LABELS.confirmed;
              return (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3 font-mono text-xs">{b.booking_number}</td>
                  <td className="py-2.5 px-2">{b.customer_name || "—"}</td>
                  <td className="py-2.5 px-2 text-xs">{SERVICE_LABELS[b.service_type] || b.service_type}</td>
                  <td className="py-2.5 px-2">{b.destination || "—"}</td>
                  <td className="py-2.5 px-2 font-medium">₪{(b.selling_price || 0).toLocaleString()}</td>
                  <td className="py-2.5 px-2">₪{(b.amount_paid || 0).toLocaleString()}</td>
                  <td className="py-2.5 px-2" style={{ color: balance > 0 ? "#DC2626" : "#16A34A" }}>₪{balance.toLocaleString()}</td>
                  <td className="py-2.5 px-2" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</td>
                  <td className="py-2.5 px-2"><Badge variant={st.variant as any} className="text-[10px]">{st.label}</Badge></td>
                  <td className="py-2.5 px-2"><Badge variant={pay.variant as any} className="text-[10px]">{pay.label}</Badge></td>
                  <td className="py-2.5 px-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(b)}><Eye className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">لا توجد حجوزات</p>}
      </Card>

      {/* Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm">{selected.booking_number}</span>
                  <Badge variant={STATUS_LABELS[selected.status]?.variant as any}>{STATUS_LABELS[selected.status]?.label}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {/* Booking Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">العميل:</span><p className="font-medium">{selected.customer_name || "—"}</p></div>
                  <div><span className="text-muted-foreground">الهاتف:</span><p>{selected.customer_phone || "—"}</p></div>
                  <div><span className="text-muted-foreground">الخدمة:</span><p>{SERVICE_LABELS[selected.service_type]}</p></div>
                  <div><span className="text-muted-foreground">الوجهة:</span><p>{selected.destination || "—"}</p></div>
                  <div><span className="text-muted-foreground">تاريخ السفر:</span><p>{selected.travel_date || "—"}</p></div>
                  <div><span className="text-muted-foreground">تاريخ العودة:</span><p>{selected.return_date || "—"}</p></div>
                  <div><span className="text-muted-foreground">المورد:</span><p>{selected.supplier?.name || "—"}</p></div>
                  <div><span className="text-muted-foreground">رقم الحجز عند المورد:</span><p>{selected.supplier_ref || "—"}</p></div>
                </div>

                {/* Financial */}
                <Card className="p-3 space-y-2">
                  <h4 className="font-semibold text-sm">المالية</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>تكلفة المورد: <span className="font-medium">₪{(selected.cost_price_ils || 0).toLocaleString()}</span></div>
                    <div>سعر البيع: <span className="font-medium">₪{(selected.selling_price || 0).toLocaleString()}</span></div>
                    <div>الربح: <span className="font-medium" style={{ color: (selected.selling_price - selected.cost_price_ils) >= 0 ? "#16A34A" : "#DC2626" }}>₪{((selected.selling_price || 0) - (selected.cost_price_ils || 0)).toLocaleString()}</span></div>
                    <div>المدفوع: <span className="font-medium">₪{(selected.amount_paid || 0).toLocaleString()}</span></div>
                  </div>
                </Card>

                {/* Passengers */}
                {passengers.length > 0 && (
                  <Card className="p-3">
                    <h4 className="font-semibold text-sm mb-2">المسافرون ({passengers.length})</h4>
                    <div className="space-y-1.5">
                      {passengers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-sm">
                          <span>👤</span>
                          <span>{p.full_name}</span>
                          {p.passport_number && <span className="text-xs text-muted-foreground">({p.passport_number})</span>}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Payment history */}
                <Card className="p-3">
                  <h4 className="font-semibold text-sm mb-2">سجل الدفعات</h4>
                  {payments.length > 0 ? (
                    <div className="space-y-2">
                      {payments.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-1">
                          <span>{p.payment_date}</span>
                          <span className="text-xs text-muted-foreground">{p.payment_method === "cash" ? "نقدي" : p.payment_method === "bank_transfer" ? "بنك" : p.payment_method}</span>
                          <span className="font-medium">₪{p.amount?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">لا توجد دفعات بعد</p>
                  )}
                </Card>

                {/* Add payment */}
                {selected.payment_status !== "paid" && selected.status !== "cancelled" && (
                  <Card className="p-3 space-y-2">
                    <h4 className="font-semibold text-sm">تسجيل دفعة جديدة</h4>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="المبلغ" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="flex-1" />
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">نقدي</SelectItem>
                          <SelectItem value="bank_transfer">بنك</SelectItem>
                          <SelectItem value="credit_card">بطاقة</SelectItem>
                          <SelectItem value="cheque">شيك</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAddPayment} style={{ background: "#1B3A5C" }} className="text-white">تسجيل</Button>
                    </div>
                  </Card>
                )}

                {selected.notes && (
                  <Card className="p-3">
                    <h4 className="font-semibold text-sm mb-1">ملاحظات</h4>
                    <p className="text-sm text-muted-foreground">{selected.notes}</p>
                  </Card>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
