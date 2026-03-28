import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, ArrowLeft, Plus, Trash2, Check, Upload, X, AlertTriangle } from "lucide-react";

const SERVICE_TYPES = [
  { key: "flight", label: "تذاكر طيران", icon: "✈️" },
  { key: "hotel", label: "فنادق", icon: "🏨" },
  { key: "visa", label: "تأشيرة فيزا", icon: "📋" },
  { key: "package", label: "باقة سياحية", icon: "📦" },
  { key: "honeymoon", label: "شهر عسل", icon: "💍" },
  { key: "umrah", label: "عمرة", icon: "🕋" },
  { key: "hajj", label: "حج", icon: "🕌" },
  { key: "transfer", label: "نقل وترانسفير", icon: "🚐" },
  { key: "insurance", label: "تأمين سفر", icon: "🛡️" },
];

interface Passenger {
  full_name: string;
  passport_number: string;
  passport_expiry: string;
  passport_image_url: string;
  passport_image_file: File | null;
  nationality: string;
  date_of_birth: string;
  gender: string;
  ticket_number: string;
}

export default function TravelBookingFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [serviceType, setServiceType] = useState("");

  // Step 2
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("فلسطين");
  const [travelDate, setTravelDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [paxCount, setPaxCount] = useState(1);

  // Step 3
  const [costPrice, setCostPrice] = useState("");
  const [costCurrency, setCostCurrency] = useState("ILS");
  const [costExchangeRate, setCostExchangeRate] = useState("1");
  const [sellingPrice, setSellingPrice] = useState("");
  const [notes, setNotes] = useState("");

  // Step 4
  const [passengers, setPassengers] = useState<Passenger[]>([{ full_name: "", passport_number: "", nationality: "", date_of_birth: "", gender: "", ticket_number: "" }]);

  // Step 5
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("contacts").select("id, contact_name, phone").order("contact_name"),
      supabase.from("travel_suppliers").select("id, name, type, currency, commission_rate").eq("is_active", true),
    ]).then(([cRes, sRes]) => {
      if (cRes.data) setContacts(cRes.data);
      if (sRes.data) setSuppliers(sRes.data);
    });
  }, [user]);

  const costIls = parseFloat(costPrice || "0") * parseFloat(costExchangeRate || "1");
  const profit = parseFloat(sellingPrice || "0") - costIls;
  const profitMargin = parseFloat(sellingPrice || "0") > 0 ? (profit / parseFloat(sellingPrice || "1")) * 100 : 0;

  const handleSelectContact = (id: string) => {
    setCustomerId(id);
    const c = contacts.find(c => c.id === id);
    if (c) {
      setCustomerName(c.contact_name);
      setCustomerPhone(c.phone || "");
    }
  };

  const addPassenger = () => setPassengers([...passengers, { full_name: "", passport_number: "", nationality: "", date_of_birth: "", gender: "", ticket_number: "" }]);
  const removePassenger = (i: number) => setPassengers(passengers.filter((_, idx) => idx !== i));
  const updatePassenger = (i: number, field: keyof Passenger, value: string) => {
    const updated = [...passengers];
    updated[i][field] = value;
    setPassengers(updated);
  };

  const handleSave = async () => {
    if (!user || !serviceType || !sellingPrice) return;
    setSaving(true);
    try {
      const payAmt = payNow ? parseFloat(payAmount || "0") : 0;
      const sell = parseFloat(sellingPrice || "0");
      const paymentStatus = payAmt >= sell ? "paid" : payAmt > 0 ? "partial" : "unpaid";

      // Create booking
      const { data: booking, error } = await supabase.from("travel_bookings").insert({
        user_id: user.id,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        service_type: serviceType,
        destination, origin,
        travel_date: travelDate || null,
        return_date: returnDate || null,
        pax_count: paxCount,
        cost_price: parseFloat(costPrice || "0"),
        cost_currency: costCurrency,
        cost_exchange_rate: parseFloat(costExchangeRate || "1"),
        selling_price: sell,
        amount_paid: payAmt,
        payment_status: paymentStatus,
        supplier_id: supplierId || null,
        supplier_ref: supplierRef || null,
        notes: notes || null,
        created_by: user.id,
      }).select().single();

      if (error) throw error;

      // Add passengers
      const validPassengers = passengers.filter(p => p.full_name.trim());
      if (validPassengers.length > 0) {
        await supabase.from("travel_booking_passengers").insert(
          validPassengers.map(p => ({ booking_id: booking.id, ...p }))
        );
      }

      // Journal entry: debit receivables/cash, credit revenue
      const debitCode = payAmt >= sell ? (payMethod === "bank_transfer" ? "1120" : "1110") : "1130";
      await supabase.from("transactions").insert({
        user_id: user.id,
        transaction_date: new Date().toISOString().split("T")[0],
        description: `حجز سياحي - ${booking.booking_number} - ${customerName || ""}`,
        debit_account_code: debitCode,
        credit_account_code: "4100",
        amount: sell,
        currency: "شيكل",
        transaction_type: "travel_booking",
        reference: booking.booking_number,
        payment_method: payAmt > 0 ? (payMethod === "cash" ? "نقدي" : "بنك") : "آجل",
        idempotency_key: `TRVBOOK-${booking.id}`,
      });

      // If partial payment, also record the payment
      if (payAmt > 0 && payAmt < sell) {
        await supabase.from("travel_booking_payments").insert({
          user_id: user.id,
          booking_id: booking.id,
          amount: payAmt,
          amount_ils: payAmt,
          payment_method: payMethod,
        });
      } else if (payAmt >= sell) {
        await supabase.from("travel_booking_payments").insert({
          user_id: user.id,
          booking_id: booking.id,
          amount: payAmt,
          amount_ils: payAmt,
          payment_method: payMethod,
        });
      }

      toast({ title: `✅ تم إنشاء الحجز ${booking.booking_number}` });
      navigate("/travel/bookings");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>✈️ حجز جديد</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs">
        {["نوع الخدمة", "التفاصيل", "التسعير", "المسافرون", "الدفع"].map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step === i + 1 ? "text-white" : step > i + 1 ? "text-white" : "text-muted-foreground border"}`}
              style={{ background: step >= i + 1 ? "#1B3A5C" : "transparent" }}>
              {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={step === i + 1 ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < 4 && <span className="text-muted-foreground mx-1">—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Service Type */}
      {step === 1 && (
        <Card className="p-6">
          <h2 className="font-semibold mb-4">اختر نوع الخدمة</h2>
          <div className="grid grid-cols-3 gap-3">
            {SERVICE_TYPES.map(st => (
              <button key={st.key} onClick={() => { setServiceType(st.key); setStep(2); }}
                className={`p-4 rounded-lg border-2 text-center transition-all hover:shadow-md ${serviceType === st.key ? "border-[#1B3A5C] bg-[#1B3A5C]/5" : "border-border"}`}>
                <span className="text-2xl block mb-1">{st.icon}</span>
                <span className="text-sm font-medium">{st.label}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">تفاصيل الحجز</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>العميل</Label>
              <Select value={customerId} onValueChange={handleSelectContact}>
                <SelectTrigger><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>اسم العميل</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="أو أدخل الاسم يدوياً" />
            </div>
            <div>
              <Label>هاتف العميل</Label>
              <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <Label>عدد المسافرين</Label>
              <Input type="number" min={1} value={paxCount} onChange={e => setPaxCount(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>الوجهة</Label>
              <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="مثال: إسطنبول، دبي..." />
            </div>
            <div>
              <Label>المغادرة من</Label>
              <Input value={origin} onChange={e => setOrigin(e.target.value)} />
            </div>
            <div>
              <Label>تاريخ السفر</Label>
              <Input type="date" value={travelDate} onChange={e => setTravelDate(e.target.value)} />
            </div>
            <div>
              <Label>تاريخ العودة</Label>
              <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
            </div>
            <div>
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="اختر مورداً" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>رقم الحجز عند المورد</Label>
              <Input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="PNR / Confirmation #" />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(3)} style={{ background: "#1B3A5C" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 3: Pricing */}
      {step === 3 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">التسعير</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>تكلفة المورد</Label>
              <Input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>عملة التكلفة</Label>
              <Select value={costCurrency} onValueChange={setCostCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ILS">₪ شيكل</SelectItem>
                  <SelectItem value="USD">$ دولار</SelectItem>
                  <SelectItem value="JOD">د.أ دينار</SelectItem>
                  <SelectItem value="EUR">€ يورو</SelectItem>
                  <SelectItem value="TRY">₺ ليرة تركية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {costCurrency !== "ILS" && (
              <div>
                <Label>سعر الصرف (1 {costCurrency} = X ₪)</Label>
                <Input type="number" step="0.01" value={costExchangeRate} onChange={e => setCostExchangeRate(e.target.value)} />
              </div>
            )}
            <div>
              <Label>سعر البيع للعميل (₪)</Label>
              <Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* Profit preview */}
          <div className="p-4 rounded-lg bg-muted/50 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">التكلفة بالشيكل</p>
              <p className="text-lg font-bold">₪{costIls.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الربح</p>
              <p className="text-lg font-bold" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">هامش الربح</p>
              <p className="text-lg font-bold">{profitMargin.toFixed(1)}%</p>
            </div>
          </div>

          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." />
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(4)} style={{ background: "#1B3A5C" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 4: Passengers */}
      {step === 4 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">المسافرون</h2>
            <Button variant="outline" size="sm" onClick={addPassenger}><Plus className="w-3 h-3 ml-1" /> إضافة مسافر</Button>
          </div>
          {passengers.map((p, i) => (
            <div key={i} className="p-3 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">مسافر {i + 1}</span>
                {passengers.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePassenger(i)}><Trash2 className="w-3 h-3 text-red-500" /></Button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">الاسم الكامل *</Label><Input value={p.full_name} onChange={e => updatePassenger(i, "full_name", e.target.value)} /></div>
                <div><Label className="text-xs">رقم الجواز</Label><Input value={p.passport_number} onChange={e => updatePassenger(i, "passport_number", e.target.value)} /></div>
                <div><Label className="text-xs">الجنسية</Label><Input value={p.nationality} onChange={e => updatePassenger(i, "nationality", e.target.value)} /></div>
                <div><Label className="text-xs">تاريخ الميلاد</Label><Input type="date" value={p.date_of_birth} onChange={e => updatePassenger(i, "date_of_birth", e.target.value)} /></div>
                <div>
                  <Label className="text-xs">الجنس</Label>
                  <Select value={p.gender} onValueChange={v => updatePassenger(i, "gender", v)}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">ذكر</SelectItem>
                      <SelectItem value="female">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">رقم التذكرة</Label><Input value={p.ticket_number} onChange={e => updatePassenger(i, "ticket_number", e.target.value)} /></div>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(3)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(5)} style={{ background: "#1B3A5C" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 5: Payment */}
      {step === 5 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">الدفع</h2>

          {/* Summary */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
            <div className="flex justify-between"><span>الخدمة:</span><span>{SERVICE_TYPES.find(s => s.key === serviceType)?.icon} {SERVICE_TYPES.find(s => s.key === serviceType)?.label}</span></div>
            <div className="flex justify-between"><span>العميل:</span><span>{customerName || "—"}</span></div>
            <div className="flex justify-between"><span>الوجهة:</span><span>{destination || "—"}</span></div>
            <div className="flex justify-between"><span>سعر البيع:</span><span className="font-bold">₪{parseFloat(sellingPrice || "0").toLocaleString()}</span></div>
            <div className="flex justify-between"><span>الربح:</span><span className="font-bold" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>عدد المسافرين:</span><span>{passengers.filter(p => p.full_name).length}</span></div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={payNow} onChange={e => setPayNow(e.target.checked)} id="payNow" />
            <label htmlFor="payNow" className="text-sm">هل دفع العميل الآن؟</label>
          </div>

          {payNow && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>المبلغ المدفوع</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={sellingPrice} />
              </div>
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="credit_card">بطاقة ائتمان</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(4)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={handleSave} disabled={saving} style={{ background: "#1B3A5C" }} className="text-white">
              {saving ? "جارٍ الحفظ..." : "✅ حفظ الحجز"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
