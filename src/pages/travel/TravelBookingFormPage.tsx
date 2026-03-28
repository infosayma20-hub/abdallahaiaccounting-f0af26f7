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
  const [supplierName, setSupplierName] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [paxCount, setPaxCount] = useState(1);

  // Inline quick-add
  const [customerSearch, setCustomerSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);
  const supplierRef2 = useRef<HTMLDivElement>(null);

  // Step 3
  const [costPrice, setCostPrice] = useState("");
  const [costCurrency, setCostCurrency] = useState("ILS");
  const [costExchangeRate, setCostExchangeRate] = useState("1");
  const [sellingPrice, setSellingPrice] = useState("");
  const [notes, setNotes] = useState("");

  // Step 4
  const [passengers, setPassengers] = useState<Passenger[]>([{ full_name: "", passport_number: "", passport_expiry: "", passport_image_url: "", passport_image_file: null, nationality: "", date_of_birth: "", gender: "", ticket_number: "" }]);

  // Step 5
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts").select("id, contact_name, phone, contact_type").eq("is_archived", false).order("contact_name");
    if (data) setContacts(data);
  }, [user]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setShowCustomerDropdown(false);
      if (supplierRef2.current && !supplierRef2.current.contains(e.target as Node)) setShowSupplierDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const costIls = parseFloat(costPrice || "0") * parseFloat(costExchangeRate || "1");
  const profit = parseFloat(sellingPrice || "0") - costIls;
  const profitMargin = parseFloat(sellingPrice || "0") > 0 ? (profit / parseFloat(sellingPrice || "1")) * 100 : 0;

  const customers = contacts.filter(c => c.contact_type === "عميل" || c.contact_type === "both");
  const suppliers = contacts.filter(c => c.contact_type === "مورد" || c.contact_type === "both");

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => c.contact_name.includes(customerSearch))
    : customers;

  const filteredSuppliers = supplierSearch.trim()
    ? suppliers.filter(c => c.contact_name.includes(supplierSearch))
    : suppliers;

  const handleSelectContact = (c: any) => {
    setCustomerId(c.id);
    setCustomerName(c.contact_name);
    setCustomerPhone(c.phone || "");
    setCustomerSearch(c.contact_name);
    setShowCustomerDropdown(false);
  };

  const handleSelectSupplier = (c: any) => {
    setSupplierId(c.id);
    setSupplierName(c.contact_name);
    setSupplierSearch(c.contact_name);
    setShowSupplierDropdown(false);
  };

  const handleQuickAddCustomer = async () => {
    if (!user || !customerSearch.trim()) return;
    setSavingCustomer(true);
    try {
      const { data, error } = await supabase.from("contacts").upsert({
        user_id: user.id,
        contact_name: customerSearch.trim(),
        contact_type: "عميل",
        phone: newCustomerPhone || null,
      }, { onConflict: "user_id,contact_name" }).select().single();
      if (error) throw error;
      await fetchContacts();
      setCustomerId(data.id);
      setCustomerName(data.contact_name);
      setCustomerPhone(data.phone || "");
      setCustomerSearch(data.contact_name);
      setNewCustomerPhone("");
      setShowCustomerDropdown(false);
      toast({ title: "✅ تم إضافة العميل" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleQuickAddSupplier = async () => {
    if (!user || !supplierSearch.trim()) return;
    setSavingSupplier(true);
    try {
      const { data, error } = await supabase.from("contacts").upsert({
        user_id: user.id,
        contact_name: supplierSearch.trim(),
        contact_type: "مورد",
      }, { onConflict: "user_id,contact_name" }).select().single();
      if (error) throw error;
      await fetchContacts();
      setSupplierId(data.id);
      setSupplierName(data.contact_name);
      setSupplierSearch(data.contact_name);
      setShowSupplierDropdown(false);
      toast({ title: "✅ تم إضافة المورد" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSavingSupplier(false);
    }
  };

  const newPassenger = (): Passenger => ({ full_name: "", passport_number: "", passport_expiry: "", passport_image_url: "", passport_image_file: null, nationality: "", date_of_birth: "", gender: "", ticket_number: "" });
  const addPassenger = () => setPassengers([...passengers, newPassenger()]);
  const removePassenger = (i: number) => setPassengers(passengers.filter((_, idx) => idx !== i));
  const updatePassenger = (i: number, field: keyof Passenger, value: any) => {
    const updated = [...passengers];
    (updated[i] as any)[field] = value;
    setPassengers(updated);
  };

  const handlePassportUpload = (i: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الملف يجب أن لا يتجاوز 5MB", variant: "destructive" });
      return;
    }
    const updated = [...passengers];
    updated[i].passport_image_file = file;
    updated[i].passport_image_url = URL.createObjectURL(file);
    setPassengers(updated);
  };

  const removePassportImage = (i: number) => {
    const updated = [...passengers];
    updated[i].passport_image_file = null;
    updated[i].passport_image_url = "";
    setPassengers(updated);
  };

  const isPassportExpiringWithin6Months = (dateStr: string) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    return expiry <= sixMonths && expiry > new Date();
  };

  const isPassportExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) <= new Date();
  };

  const isPassportNumberValid = (num: string) => {
    if (!num) return true;
    return /^[a-zA-Z0-9]{6,12}$/.test(num);
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

      // Upload passport images and add passengers
      const validPassengers = passengers.filter(p => p.full_name.trim());
      if (validPassengers.length > 0) {
        const passengerRows = [];
        for (let idx = 0; idx < validPassengers.length; idx++) {
          const p = validPassengers[idx];
          let imageUrl: string | null = null;
          if (p.passport_image_file) {
            const ext = p.passport_image_file.name.split(".").pop() || "jpg";
            const path = `bookings/${booking.id}/passport_${idx}.${ext}`;
            const { error: upErr } = await supabase.storage.from("passport-documents").upload(path, p.passport_image_file);
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("passport-documents").getPublicUrl(path);
              imageUrl = urlData?.publicUrl || null;
            }
          }
          passengerRows.push({
            booking_id: booking.id,
            full_name: p.full_name,
            passport_number: p.passport_number || null,
            passport_expiry: p.passport_expiry || null,
            passport_image_url: imageUrl,
            nationality: p.nationality || null,
            date_of_birth: p.date_of_birth || null,
            gender: p.gender || null,
            ticket_number: p.ticket_number || null,
          });
        }
        await supabase.from("travel_booking_passengers").insert(passengerRows);
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
            {/* Customer search with inline quick-add */}
            <div className="col-span-2" ref={customerRef}>
              <Label>العميل</Label>
              <div className="relative">
                <Input
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                    if (!e.target.value.trim()) { setCustomerId(""); setCustomerName(""); setCustomerPhone(""); }
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="ابحث عن عميل أو أدخل اسم جديد..."
                />
                {showCustomerDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} onClick={() => handleSelectContact(c)}
                        className="w-full text-right px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm">
                        <span>{c.contact_name}</span>
                        {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                      </button>
                    ))}
                    {customerSearch.trim() && !customers.find(c => c.contact_name === customerSearch.trim()) && (
                      <div className="border-t p-2 space-y-2">
                        <p className="text-xs text-muted-foreground">عميل جديد: <strong>{customerSearch}</strong></p>
                        <div className="flex gap-2 items-center">
                          <Input
                            value={newCustomerPhone}
                            onChange={e => setNewCustomerPhone(e.target.value)}
                            placeholder="رقم الهاتف (اختياري)"
                            className="h-8 text-xs flex-1"
                            onKeyDown={e => e.key === "Enter" && handleQuickAddCustomer()}
                          />
                          <Button size="sm" className="h-8 text-xs" disabled={savingCustomer} onClick={handleQuickAddCustomer}
                            style={{ background: "#1B3A5C" }}>
                            {savingCustomer ? "..." : "➕ حفظ"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {filteredCustomers.length === 0 && !customerSearch.trim() && (
                      <p className="text-xs text-muted-foreground p-3 text-center">لا يوجد عملاء</p>
                    )}
                  </div>
                )}
              </div>
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

            {/* Supplier search with inline quick-add */}
            <div ref={supplierRef2}>
              <Label>المورد</Label>
              <div className="relative">
                <Input
                  value={supplierSearch}
                  onChange={e => {
                    setSupplierSearch(e.target.value);
                    setShowSupplierDropdown(true);
                    if (!e.target.value.trim()) { setSupplierId(""); setSupplierName(""); }
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  placeholder="ابحث عن مورد أو أدخل اسم جديد..."
                />
                {showSupplierDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.map(c => (
                      <button key={c.id} onClick={() => handleSelectSupplier(c)}
                        className="w-full text-right px-3 py-2 hover:bg-muted/50 text-sm">
                        {c.contact_name}
                      </button>
                    ))}
                    {supplierSearch.trim() && !suppliers.find(c => c.contact_name === supplierSearch.trim()) && (
                      <div className="border-t p-2">
                        <Button size="sm" className="h-8 text-xs w-full" disabled={savingSupplier} onClick={handleQuickAddSupplier}
                          style={{ background: "#1B3A5C" }}>
                          {savingSupplier ? "..." : `➕ إضافة "${supplierSearch}" كمورد`}
                        </Button>
                      </div>
                    )}
                    {filteredSuppliers.length === 0 && !supplierSearch.trim() && (
                      <p className="text-xs text-muted-foreground p-3 text-center">لا يوجد موردين</p>
                    )}
                  </div>
                )}
              </div>
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
          <Accordion type="multiple" defaultValue={passengers.map((_, i) => `passenger-${i}`)}>
            {passengers.map((p, i) => (
              <AccordionItem key={i} value={`passenger-${i}`}>
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
                  <div className="flex items-center justify-between w-full pl-2">
                    <span>مسافر {i + 1}{p.full_name ? ` — ${p.full_name}` : ""}</span>
                    {passengers.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 mr-2" onClick={(e) => { e.stopPropagation(); removePassenger(i); }}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  {/* Basic info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">الاسم الكامل *</Label><Input value={p.full_name} onChange={e => updatePassenger(i, "full_name", e.target.value)} /></div>
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

                  {/* Passport section */}
                  <div className="p-4 rounded-lg border border-dashed space-y-3" style={{ borderColor: "rgba(27,58,92,0.3)" }}>
                    <h4 className="text-sm font-semibold" style={{ color: "#1B3A5C" }}>🛂 بيانات الجواز — المسافر {i + 1}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">رقم جواز السفر</Label>
                        <Input
                          value={p.passport_number}
                          onChange={e => updatePassenger(i, "passport_number", e.target.value)}
                          placeholder="مثال: A12345678"
                        />
                        {p.passport_number && !isPassportNumberValid(p.passport_number) && (
                          <p className="text-xs text-destructive mt-1">يجب أن يكون أحرف وأرقام فقط، بين 6–12 خانة</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">تاريخ انتهاء الجواز</Label>
                        <Input
                          type="date"
                          value={p.passport_expiry}
                          onChange={e => updatePassenger(i, "passport_expiry", e.target.value)}
                        />
                        {isPassportExpired(p.passport_expiry) && (
                          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> الجواز منتهي الصلاحية
                          </p>
                        )}
                        {isPassportExpiringWithin6Months(p.passport_expiry) && (
                          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#E67E22" }}>
                            <AlertTriangle className="w-3 h-3" /> تنبيه: الجواز قارب على الانتهاء
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Passport image upload */}
                    <div>
                      <Label className="text-xs">صورة جواز السفر</Label>
                      {p.passport_image_url ? (
                        <div className="relative mt-2 inline-block">
                          {p.passport_image_file?.type === "application/pdf" ? (
                            <div className="w-32 h-20 rounded-lg border flex items-center justify-center bg-muted text-xs text-muted-foreground">📄 PDF</div>
                          ) : (
                            <img src={p.passport_image_url} alt="صورة الجواز" className="w-32 h-20 object-cover rounded-lg border" />
                          )}
                          <button
                            onClick={() => removePassportImage(i)}
                            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="mt-2 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
                          style={{ borderColor: "rgba(27,58,92,0.25)" }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files?.[0];
                            if (file) handlePassportUpload(i, file);
                          }}
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/jpeg,image/png,application/pdf";
                            input.onchange = (ev) => {
                              const file = (ev.target as HTMLInputElement).files?.[0];
                              if (file) handlePassportUpload(i, file);
                            };
                            input.click();
                          }}
                        >
                          <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">اسحب الصورة هنا أو اضغط للرفع</p>
                          <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, PDF — حد أقصى 5MB</p>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
