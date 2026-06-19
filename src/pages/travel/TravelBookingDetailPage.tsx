import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { createPaymentJournalEntry, reverseCancellationEntries } from "@/services/travelAccountingService";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Printer, Upload, X, FileText, AlertTriangle, Ban, CheckCircle, Edit } from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  hajj: "🕋 حج", umrah: "🕌 عمرة", flight: "✈️ تذاكر طيران", hotel: "🏨 فنادق",
  visa: "📋 تأشيرة", tourism_package: "🌍 باقة سياحية", honeymoon: "💍 شهر عسل",
  transport: "🚌 نقل وترانسفير", insurance: "🛡️ تأمين سفر", package: "📦 باقة",
  transfer: "🚐 ترانسفير",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  visa: "📋 تأشيرة", flight: "✈️ طيران", hotel: "🏨 فندق", transport_air: "🛫 نقل جوي",
  transport_ground: "🚐 نقل بري", transport_train: "🚂 قطار", transport_bus: "🚌 حافلة",
  insurance: "🛡️ تأمين", guide: "🧑‍✈️ مرشد", meal_plan: "🍽️ وجبات", other: "📦 أخرى",
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "outline" }, confirmed: { label: "مؤكد", variant: "default" },
  in_progress: { label: "قيد التنفيذ", variant: "warning" }, completed: { label: "مكتمل", variant: "success" },
  cancelled: { label: "ملغى", variant: "destructive" }, issued: { label: "صدرت", variant: "success" },
};

const PAY_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "مدفوع بالكامل", color: "#16A34A" },
  partial: { label: "مدفوع جزئياً", color: "#F59E0B" },
  unpaid: { label: "غير مدفوع", color: "#DC2626" },
  refunded: { label: "مُسترد", color: "#8B5CF6" },
};

export default function TravelBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payBankName, setPayBankName] = useState("");
  const [payRef, setPayRef] = useState("");

  useEffect(() => {
    if (!id || !user) return;
    fetchAll();
  }, [id, user]);

  const fetchAll = async () => {
    const [bRes, iRes, pRes, pmRes, dRes] = await Promise.all([
      supabase.from("travel_bookings").select("*").eq("id", id).single(),
      supabase.from("travel_booking_items").select("*").eq("booking_id", id).order("sort_order"),
      supabase.from("travel_booking_passengers").select("*").eq("booking_id", id).order("passenger_index"),
      supabase.from("travel_booking_payments").select("*").eq("booking_id", id).order("payment_date", { ascending: false }),
      supabase.from("travel_booking_documents").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    ]);
    if (bRes.data) {
      const b = bRes.data as any;
      // Fetch supplier name from contacts if linked
      if (b.supplier_contact_id) {
        const { data: sc } = await supabase.from("contacts").select("contact_name").eq("id", b.supplier_contact_id).single();
        if (sc) b.supplier_name = sc.contact_name;
      }
      setBooking(b);
      // Fetch linked transactions
      const { data: txs } = await supabase.from("transactions").select("*").eq("reference", b.booking_number).eq("is_deleted", false).order("created_at", { ascending: false });
      if (txs) setTransactions(txs);
    }
    if (iRes.data) setItems(iRes.data);
    if (pRes.data) setPassengers(pRes.data);
    if (pmRes.data) setPayments(pmRes.data);
    if (dRes.data) setDocuments(dRes.data);
    setLoading(false);
  };

  const handleAddPayment = async () => {
    if (!booking || !payAmount || !user) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    const newPaid = (booking.amount_paid || 0) + amt;
    const newStatus = newPaid >= booking.selling_price ? "paid" : "partial";

    await supabase.from("travel_booking_payments").insert({
      user_id: user.id, booking_id: booking.id, amount: amt, amount_ils: amt,
      payment_method: payMethod, payment_direction: "received",
      reference_number: payRef || null, bank_name: payBankName || null,
    });
    await supabase.from("travel_bookings").update({ amount_paid: newPaid, payment_status: newStatus }).eq("id", booking.id);

    // Journal entry via service
    await createPaymentJournalEntry({
      userId: user.id,
      bookingNumber: booking.booking_number,
      customerName: booking.customer_name || "",
      amount: amt,
      paymentMethod: payMethod,
      bookingId: booking.id,
    });

    toast({ title: "✅ تم تسجيل الدفعة" });
    setPayAmount(""); setPayRef(""); setPayBankName("");
    fetchAll();
  };

  const handleCancel = async () => {
    if (!booking || !user) return;
    if (!confirm("هل أنت متأكد من إلغاء هذا الحجز؟ سيتم عكس جميع القيود المحاسبية.")) return;

    await supabase.from("travel_bookings").update({ status: "cancelled", payment_status: "refunded" }).eq("id", booking.id);

    // Reverse all journal entries
    await reverseCancellationEntries({
      userId: user.id,
      bookingNumber: booking.booking_number,
      customerName: booking.customer_name || "",
    });

    toast({ title: "تم إلغاء الحجز وعكس القيود المحاسبية" });
    fetchAll();
  };

  const handleMarkCompleted = async () => {
    if (!booking) return;
    await supabase.from("travel_bookings").update({ status: "completed" }).eq("id", booking.id);
    toast({ title: "✅ تم تحديث الحالة إلى مكتمل" });
    fetchAll();
  };

  const handleDocUpload = async (file: File) => {
    if (!booking || !user || file.size > 10 * 1024 * 1024) return;
    const path = `travel/${user.id}/${booking.id}/doc_${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("travel-documents").upload(path, file);
    if (error) { toast({ title: "خطأ في الرفع", variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("travel-documents").getPublicUrl(path);
    await supabase.from("travel_booking_documents").insert({
      booking_id: booking.id, user_id: user.id,
      file_name: file.name, file_url: urlData?.publicUrl || "",
      file_size: file.size,
    });
    toast({ title: "✅ تم رفع المستند" });
    fetchAll();
  };

  const handlePrint = () => {
    navigate(`/travel/bookings/${id}/print`);
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">جارٍ التحميل...</div>;
  if (!booking) return <div className="text-center py-20 text-muted-foreground">الحجز غير موجود</div>;

  const profit = (booking.selling_price || 0) - (booking.cost_price_ils || 0);
  const balance = (booking.selling_price || 0) - (booking.amount_paid || 0);
  const st = STATUS_MAP[booking.status] || STATUS_MAP.confirmed;
  const ps = PAY_STATUS[booking.payment_status] || PAY_STATUS.unpaid;

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/travel/bookings")}><ArrowRight className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#0D1B2E" }}>
              <span className="font-mono text-sm">{booking.booking_number}</span>
              <Badge variant={st.variant as any}>{st.label}</Badge>
              <Badge style={{ background: ps.color, color: "#fff" }}>{ps.label}</Badge>
            </h1>
            <p className="text-xs text-muted-foreground">{SERVICE_LABELS[booking.service_type] || booking.service_type} • {booking.destination || "—"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 ml-1" /> طباعة</Button>
          {booking.status !== "cancelled" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/travel/bookings/${id}/edit`)}><Edit className="w-4 h-4 ml-1" /> تعديل</Button>
          )}
          {booking.status !== "completed" && booking.status !== "cancelled" && (
            <Button variant="outline" size="sm" onClick={handleMarkCompleted} className="text-green-600 border-green-200 hover:bg-green-50">
              <CheckCircle className="w-4 h-4 ml-1" /> مكتمل
            </Button>
          )}
          {booking.status !== "cancelled" && (
            <Button variant="outline" size="sm" onClick={handleCancel} className="text-destructive border-destructive/20 hover:bg-destructive/5">
              <Ban className="w-4 h-4 ml-1" /> إلغاء الحجز
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="summary" dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="summary">ملخص</TabsTrigger>
          <TabsTrigger value="items">بنود التكلفة ({items.length})</TabsTrigger>
          <TabsTrigger value="passengers">المسافرون ({passengers.length})</TabsTrigger>
          <TabsTrigger value="payments">المدفوعات ({payments.length})</TabsTrigger>
          <TabsTrigger value="documents">المستندات ({documents.length})</TabsTrigger>
          <TabsTrigger value="journal">القيود ({transactions.length})</TabsTrigger>
        </TabsList>

        {/* Summary */}
        <TabsContent value="summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold text-sm" style={{ color: "#0D1B2E" }}>بيانات الحجز</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">العميل:</span><p className="font-medium">{booking.customer_name || "—"}</p></div>
                <div><span className="text-muted-foreground">الهاتف:</span><p>{booking.customer_phone || "—"}</p></div>
                <div><span className="text-muted-foreground">الخدمة:</span><p>{SERVICE_LABELS[booking.service_type]}</p></div>
                <div><span className="text-muted-foreground">الوجهة:</span><p>{booking.destination || "—"}</p></div>
                <div><span className="text-muted-foreground">تاريخ السفر:</span><p>{booking.travel_date || "—"}</p></div>
                <div><span className="text-muted-foreground">تاريخ العودة:</span><p>{booking.return_date || "—"}</p></div>
                <div><span className="text-muted-foreground">المورد:</span><p>{booking.supplier_name || "—"}</p></div>
                <div><span className="text-muted-foreground">PNR:</span><p className="font-mono">{booking.supplier_ref || "—"}</p></div>
                <div><span className="text-muted-foreground">عدد المسافرين:</span><p>{booking.pax_count}</p></div>
              </div>
            </Card>
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold text-sm" style={{ color: "#0D1B2E" }}>المالية</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">إجمالي التكلفة:</span><span className="font-medium">₪{(booking.cost_price_ils || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">سعر البيع:</span><span className="font-medium">₪{(booking.selling_price || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الربح:</span><span className="font-bold" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</span></div>
                <div className="border-t pt-2 flex justify-between"><span className="text-muted-foreground">المدفوع:</span><span className="font-medium">₪{(booking.amount_paid || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المتبقي:</span><span className="font-bold" style={{ color: balance > 0 ? "#DC2626" : "#16A34A" }}>₪{balance.toLocaleString()}</span></div>
              </div>
            </Card>
          </div>
          {booking.notes && (
            <Card className="p-4 mt-4"><h3 className="font-semibold text-sm mb-1">ملاحظات</h3><p className="text-sm text-muted-foreground">{booking.notes}</p></Card>
          )}
        </TabsContent>

        {/* Cost Items */}
        <TabsContent value="items">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-right py-3 px-3">النوع</th>
                  <th className="text-right py-3 px-2">الوصف</th>
                  <th className="text-right py-3 px-2">المدينة</th>
                  <th className="text-right py-3 px-2">الكمية</th>
                  <th className="text-right py-3 px-2">التكلفة</th>
                  <th className="text-right py-3 px-2">البيع</th>
                  <th className="text-right py-3 px-2">الربح</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const tc = it.total_cost || (it.quantity || 1) * (it.unit_cost || 0);
                  const tp = it.total_price || (it.quantity || 1) * (it.unit_price || 0);
                  return (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="py-2 px-3 text-xs">{ITEM_TYPE_LABELS[it.item_type] || it.item_type}</td>
                      <td className="py-2 px-2">{it.description}</td>
                      <td className="py-2 px-2">{it.city || "—"}</td>
                      <td className="py-2 px-2">{it.quantity}</td>
                      <td className="py-2 px-2">₪{tc.toLocaleString()}</td>
                      <td className="py-2 px-2">₪{tp.toLocaleString()}</td>
                      <td className="py-2 px-2" style={{ color: tp - tc >= 0 ? "#16A34A" : "#DC2626" }}>₪{(tp - tc).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد بنود</p>}
          </Card>
        </TabsContent>

        {/* Passengers */}
        <TabsContent value="passengers">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {passengers.map((p, i) => (
              <Card key={p.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">👤 المسافر {p.passenger_index || i + 1}</h4>
                  {p.passport_image_url && <a href={p.passport_image_url} target="_blank" rel="noreferrer" className="text-xs text-primary">عرض الجواز</a>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground text-xs">الاسم:</span><p className="font-medium">{p.full_name}</p></div>
                  {p.full_name_en && <div><span className="text-muted-foreground text-xs">بالإنجليزية:</span><p>{p.full_name_en}</p></div>}
                  {p.passport_number && <div><span className="text-muted-foreground text-xs">رقم الجواز:</span><p className="font-mono">{p.passport_number}</p></div>}
                  {p.passport_expiry && (
                    <div>
                      <span className="text-muted-foreground text-xs">انتهاء الجواز:</span>
                      <p className="flex items-center gap-1">
                        {p.passport_expiry}
                        {new Date(p.passport_expiry) <= new Date() && <AlertTriangle className="w-3 h-3 text-destructive" />}
                      </p>
                    </div>
                  )}
                  {p.nationality && <div><span className="text-muted-foreground text-xs">الجنسية:</span><p>{p.nationality}</p></div>}
                  {p.phone && <div><span className="text-muted-foreground text-xs">الهاتف:</span><p>{p.phone}</p></div>}
                  {p.room_type && <div><span className="text-muted-foreground text-xs">الغرفة:</span><p>{p.room_type === "single" ? "فردية" : p.room_type === "double" ? "مزدوجة" : p.room_type === "triple" ? "ثلاثية" : "رباعية"}</p></div>}
                </div>
              </Card>
            ))}
            {passengers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8 col-span-2">لا يوجد مسافرون</p>}
          </div>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <div className="space-y-4">
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-right py-3 px-3">التاريخ</th>
                  <th className="text-right py-3 px-2">المبلغ</th>
                  <th className="text-right py-3 px-2">الطريقة</th>
                  <th className="text-right py-3 px-2">المرجع</th>
                </tr></thead>
                <tbody>
                  {payments.map(pm => (
                    <tr key={pm.id} className="border-b last:border-0">
                      <td className="py-2 px-3">{pm.payment_date}</td>
                      <td className="py-2 px-2 font-medium">₪{pm.amount?.toLocaleString()}</td>
                      <td className="py-2 px-2 text-xs">{pm.payment_method === "cash" ? "نقدي" : pm.payment_method === "bank_transfer" ? "بنك" : pm.payment_method}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">{pm.reference_number || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد دفعات</p>}
            </Card>

            {/* Add payment */}
            {booking.payment_status !== "paid" && booking.status !== "cancelled" && (
              <Card className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">تسجيل دفعة جديدة</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">المبلغ</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={balance.toString()} /></div>
                  <div>
                    <Label className="text-xs">الطريقة</Label>
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="bank_transfer">بنك</SelectItem>
                        <SelectItem value="credit_card">بطاقة</SelectItem>
                        <SelectItem value="check">شيك</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(payMethod === "bank_transfer" || payMethod === "check") && (
                    <div><Label className="text-xs">المرجع</Label><Input value={payRef} onChange={e => setPayRef(e.target.value)} className="h-9" /></div>
                  )}
                  <div className="flex items-end">
                    <Button onClick={handleAddPayment} className="text-white w-full" style={{ background: "#0D1B2E" }}>تسجيل الدفعة</Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card className="p-4 space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30" style={{ borderColor: "rgba(13,27,46,0.2)" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleDocUpload(f); }}
              onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.onchange = ev => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handleDocUpload(f); }; inp.click(); }}>
              <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">اسحب الملف هنا أو اضغط للرفع (تذاكر، فيزا، مستندات...)</p>
            </div>
            {documents.length > 0 && (
              <div className="space-y-2">
                {documents.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{d.file_name}</a>
                      <span className="text-xs text-muted-foreground">{d.file_size ? `${(d.file_size / 1024).toFixed(0)} KB` : ""}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{d.created_at?.split("T")[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Journal Entries */}
        <TabsContent value="journal">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="text-right py-3 px-3">التاريخ</th>
                <th className="text-right py-3 px-2">الوصف</th>
                <th className="text-right py-3 px-2">مدين</th>
                <th className="text-right py-3 px-2">دائن</th>
                <th className="text-right py-3 px-2">المبلغ</th>
              </tr></thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="py-2 px-3">{tx.transaction_date}</td>
                    <td className="py-2 px-2 text-xs">{tx.description}</td>
                    <td className="py-2 px-2 font-mono text-xs">{tx.debit_account_code}</td>
                    <td className="py-2 px-2 font-mono text-xs">{tx.credit_account_code}</td>
                    <td className="py-2 px-2 font-medium">₪{tx.amount?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد قيود</p>}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
