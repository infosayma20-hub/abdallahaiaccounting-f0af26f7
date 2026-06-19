import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureTravelAccounts, createBookingJournalEntry } from "@/services/travelAccountingService";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, ArrowLeft, Plus, Trash2, Check, Upload, X, AlertTriangle, Minus } from "lucide-react";

const SERVICE_TYPES = [
  { key: "hajj", label: "حج", icon: "🕋" },
  { key: "umrah", label: "عمرة", icon: "🕌" },
  { key: "flight", label: "تذاكر طيران", icon: "✈️" },
  { key: "hotel", label: "فنادق", icon: "🏨" },
  { key: "visa", label: "تأشيرة فيزا", icon: "📋" },
  { key: "tourism_package", label: "باقة سياحية", icon: "🌍" },
  { key: "honeymoon", label: "شهر عسل", icon: "💍" },
  { key: "transport", label: "نقل وترانسفير", icon: "🚌" },
  { key: "insurance", label: "تأمين سفر", icon: "🛡️" },
];

const ITEM_TYPES = [
  { key: "visa", label: "تأشيرة", icon: "📋" },
  { key: "flight", label: "تذاكر طيران", icon: "✈️" },
  { key: "hotel", label: "فندق", icon: "🏨" },
  { key: "transport_air", label: "نقل جوي", icon: "🛫" },
  { key: "transport_ground", label: "نقل بري", icon: "🚐" },
  { key: "transport_train", label: "قطار", icon: "🚂" },
  { key: "transport_bus", label: "حافلة", icon: "🚌" },
  { key: "insurance", label: "تأمين", icon: "🛡️" },
  { key: "guide", label: "مرشد سياحي", icon: "🧑‍✈️" },
  { key: "meal_plan", label: "وجبات", icon: "🍽️" },
  { key: "other", label: "أخرى", icon: "📦" },
];

const CURRENCIES = [
  { code: "ILS", symbol: "₪", label: "شيكل" },
  { code: "USD", symbol: "$", label: "دولار" },
  { code: "SAR", symbol: "﷼", label: "ريال سعودي" },
  { code: "JOD", symbol: "د.أ", label: "دينار أردني" },
  { code: "EUR", symbol: "€", label: "يورو" },
  { code: "TRY", symbol: "₺", label: "ليرة تركية" },
  { code: "EGP", symbol: "ج.م", label: "جنيه مصري" },
];

const PAY_METHODS = [
  { key: "cash", label: "💵 نقدي" },
  { key: "bank_transfer", label: "🏦 حوالة بنكية" },
  { key: "credit_card", label: "💳 بطاقة ائتمان" },
  { key: "check", label: "📄 شيك" },
  { key: "installment", label: "📅 أقساط" },
];

interface CostItem {
  item_type: string;
  description: string;
  city: string;
  supplier_contact_id: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

interface Passenger {
  full_name: string;
  full_name_en: string;
  passport_number: string;
  passport_issue_date: string;
  passport_expiry: string;
  passport_image_url: string;
  passport_image_file: File | null;
  nationality: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  phone: string;
  email: string;
  mahram_name: string;
  room_type: string;
}

const defaultItem = (): CostItem => ({
  item_type: "other", description: "", city: "", supplier_contact_id: "",
  check_in_date: "", check_out_date: "", nights: 0, quantity: 1, unit_cost: 0, unit_price: 0,
});

const defaultPassenger = (): Passenger => ({
  full_name: "", full_name_en: "", passport_number: "", passport_issue_date: "", passport_expiry: "",
  passport_image_url: "", passport_image_file: null, nationality: "", date_of_birth: "", gender: "",
  national_id: "", phone: "", email: "", mahram_name: "", room_type: "",
});

const getDefaultItems = (serviceType: string): CostItem[] => {
  if (serviceType === "hajj" || serviceType === "umrah") {
    return [
      { ...defaultItem(), item_type: "visa", description: `تأشيرة ${serviceType === "hajj" ? "حج" : "عمرة"}` },
      { ...defaultItem(), item_type: "flight", description: "تذاكر طيران (ذهاب + إياب)" },
      { ...defaultItem(), item_type: "hotel", description: "فندق مكة المكرمة", city: "مكة" },
      { ...defaultItem(), item_type: "hotel", description: "فندق المدينة المنورة", city: "المدينة" },
      { ...defaultItem(), item_type: "transport_ground", description: "مواصلات من/إلى المطار" },
      { ...defaultItem(), item_type: "transport_ground", description: "ترانسفير بين المدن المقدسة" },
    ];
  }
  if (serviceType === "flight") return [{ ...defaultItem(), item_type: "flight", description: "تذكرة طيران" }];
  if (serviceType === "hotel") return [{ ...defaultItem(), item_type: "hotel", description: "حجز فندق" }];
  if (serviceType === "visa") return [{ ...defaultItem(), item_type: "visa", description: "تأشيرة سفر" }];
  if (serviceType === "tourism_package") return [
    { ...defaultItem(), item_type: "flight", description: "تذاكر طيران" },
    { ...defaultItem(), item_type: "hotel", description: "إقامة فندقية" },
    { ...defaultItem(), item_type: "transport_ground", description: "مواصلات" },
  ];
  return [defaultItem()];
};

export default function TravelBookingFormPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { id: editId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(editId ? 2 : 1);
  const [contacts, setContacts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [isEditMode] = useState(!!editId);
  const [editBookingNumber, setEditBookingNumber] = useState("");

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
  const [currency, setCurrency] = useState("ILS");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [notes, setNotes] = useState("");

  // Inline quick-add
  const [customerSearch, setCustomerSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showCustomerDD, setShowCustomerDD] = useState(false);
  const [showSupplierDD, setShowSupplierDD] = useState(false);
  const [newCustPhone, setNewCustPhone] = useState("");
  const custRef = useRef<HTMLDivElement>(null);
  const suppRef = useRef<HTMLDivElement>(null);

  // Step 3 - Cost items
  const [items, setItems] = useState<CostItem[]>([defaultItem()]);

  // Step 4 - Passengers
  const [passengers, setPassengers] = useState<Passenger[]>([defaultPassenger()]);

  // Step 5 - Payment
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payBankName, setPayBankName] = useState("");
  const [payRefNumber, setPayRefNumber] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts").select("id, contact_name, phone, contact_type").eq("is_archived", false).order("contact_name");
    if (data) setContacts(data);
  }, [user]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Load existing booking for edit mode
  useEffect(() => {
    if (!editId || !user) return;
    const loadBooking = async () => {
      const [bRes, iRes, pRes] = await Promise.all([
        supabase.from("travel_bookings").select("*").eq("id", editId!).eq("user_id", dataOwnerId!).single(),
        supabase.from("travel_booking_items").select("*").eq("booking_id", editId).order("sort_order"),
        supabase.from("travel_booking_passengers").select("*").eq("booking_id", editId).order("passenger_index"),
      ]);
      if (bRes.data) {
        const b = bRes.data as any;
        setEditBookingNumber(b.booking_number || "");
        setServiceType(b.service_type || "");
        setCustomerId(b.customer_id || b.contact_id || "");
        setCustomerName(b.customer_name || "");
        setCustomerSearch(b.customer_name || "");
        setCustomerPhone(b.customer_phone || "");
        setDestination(b.destination || "");
        setOrigin(b.origin || "فلسطين");
        setTravelDate(b.travel_date || "");
        setReturnDate(b.return_date || "");
        setSupplierId(b.supplier_contact_id || b.supplier_id || "");
        setSupplierRef(b.supplier_ref || "");
        setPaxCount(b.pax_count || 1);
        setCurrency(b.cost_currency || "ILS");
        setExchangeRate(String(b.cost_exchange_rate || 1));
        setNotes(b.notes || "");
      }
      if (iRes.data && iRes.data.length > 0) {
        setItems(iRes.data.map((it: any) => ({
          item_type: it.item_type || "other",
          description: it.description || "",
          city: it.city || "",
          supplier_contact_id: it.supplier_contact_id || "",
          check_in_date: it.check_in_date || "",
          check_out_date: it.check_out_date || "",
          nights: it.nights || 0,
          quantity: it.quantity || 1,
          unit_cost: it.unit_cost || 0,
          unit_price: it.unit_price || 0,
        })));
      }
      if (pRes.data && pRes.data.length > 0) {
        setPassengers(pRes.data.map((p: any) => ({
          full_name: p.full_name || "",
          full_name_en: p.full_name_en || "",
          passport_number: p.passport_number || "",
          passport_issue_date: p.passport_issue_date || "",
          passport_expiry: p.passport_expiry || "",
          passport_image_url: p.passport_image_url || "",
          passport_image_file: null,
          nationality: p.nationality || "",
          date_of_birth: p.date_of_birth || "",
          gender: p.gender || "",
          national_id: p.national_id || "",
          phone: p.phone || "",
          email: p.email || "",
          mahram_name: p.mahram_name || "",
          room_type: p.room_type || "",
        })));
      }
      // Fetch supplier name
      const sid = bRes.data?.supplier_contact_id || bRes.data?.supplier_id;
      if (sid) {
        const { data: sc } = await supabase.from("contacts").select("contact_name").eq("id", sid).single();
        if (sc) setSupplierSearch(sc.contact_name);
      }
    };
    loadBooking();
  }, [editId, user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustomerDD(false);
      if (suppRef.current && !suppRef.current.contains(e.target as Node)) setShowSupplierDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync paxCount with passengers
  useEffect(() => {
    if (paxCount > passengers.length) {
      setPassengers([...passengers, ...Array(paxCount - passengers.length).fill(null).map(() => defaultPassenger())]);
    } else if (paxCount < passengers.length && paxCount >= 1) {
      setPassengers(passengers.slice(0, paxCount));
    }
  }, [paxCount]);

  const customers = contacts.filter(c => c.contact_type === "عميل" || c.contact_type === "عميل ومورد");
  const suppliers = contacts.filter(c => c.contact_type === "مورد" || c.contact_type === "عميل ومورد");
  const filteredCustomers = customerSearch.trim() ? customers.filter(c => c.contact_name.includes(customerSearch)) : customers;
  const filteredSuppliers = supplierSearch.trim() ? suppliers.filter(c => c.contact_name.includes(supplierSearch)) : suppliers;

  const handleSelectCustomer = (c: any) => { setCustomerId(c.id); setCustomerName(c.contact_name); setCustomerPhone(c.phone || ""); setCustomerSearch(c.contact_name); setShowCustomerDD(false); };
  const handleSelectSupplier = (c: any) => { setSupplierId(c.id); setSupplierSearch(c.contact_name); setShowSupplierDD(false); };

  const handleQuickAddCustomer = async () => {
    if (!user || !customerSearch.trim()) return;
    try {
      const { data, error } = await supabase.from("contacts").upsert({ user_id: dataOwnerId!, contact_name: customerSearch.trim(), contact_type: "عميل", phone: newCustPhone || null }, { onConflict: "user_id,contact_name" }).select().single();
      if (error) throw error;
      await fetchContacts();
      setCustomerId(data.id); setCustomerName(data.contact_name); setCustomerPhone(data.phone || ""); setCustomerSearch(data.contact_name); setNewCustPhone(""); setShowCustomerDD(false);
      toast({ title: "✅ تم إضافة العميل" });
    } catch (err: any) { toast({ title: "خطأ", description: err.message, variant: "destructive" }); }
  };

  const handleQuickAddSupplier = async () => {
    if (!user || !supplierSearch.trim()) return;
    try {
      const { data, error } = await supabase.from("contacts").upsert({ user_id: dataOwnerId!, contact_name: supplierSearch.trim(), contact_type: "مورد" }, { onConflict: "user_id,contact_name" }).select().single();
      if (error) throw error;
      await fetchContacts();
      setSupplierId(data.id); setSupplierSearch(data.contact_name); setShowSupplierDD(false);
      toast({ title: "✅ تم إضافة المورد" });
    } catch (err: any) { toast({ title: "خطأ", description: err.message, variant: "destructive" }); }
  };

  const updateItem = (i: number, field: keyof CostItem, value: any) => {
    const u = [...items]; (u[i] as any)[field] = value;
    if (field === "check_in_date" || field === "check_out_date") {
      const ci = field === "check_in_date" ? value : u[i].check_in_date;
      const co = field === "check_out_date" ? value : u[i].check_out_date;
      if (ci && co) { const diff = Math.ceil((new Date(co).getTime() - new Date(ci).getTime()) / 86400000); u[i].nights = diff > 0 ? diff : 0; }
    }
    setItems(u);
  };

  const updatePassenger = (i: number, field: keyof Passenger, value: any) => { const u = [...passengers]; (u[i] as any)[field] = value; setPassengers(u); };

  const handlePassportUpload = (i: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast({ title: "خطأ", description: "الحد الأقصى 5MB", variant: "destructive" }); return; }
    const u = [...passengers]; u[i].passport_image_file = file; u[i].passport_image_url = URL.createObjectURL(file); setPassengers(u);
  };

  const isPassportExpired = (d: string) => d ? new Date(d) <= new Date() : false;
  const isPassportNearExpiry = (d: string) => { if (!d) return false; const exp = new Date(d); const m6 = new Date(); m6.setMonth(m6.getMonth() + 6); return exp <= m6 && exp > new Date(); };
  const isPassportNumValid = (n: string) => !n || /^[a-zA-Z0-9]{6,12}$/.test(n);

  const rate = parseFloat(exchangeRate || "1");
  const totalCost = items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_cost || 0), 0);
  const totalPrice = items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0);
  const totalCostILS = totalCost * rate;
  const totalPriceILS = totalPrice * rate;
  const profit = totalPriceILS - totalCostILS;
  const profitPct = totalPriceILS > 0 ? (profit / totalPriceILS) * 100 : 0;
  const curSymbol = CURRENCIES.find(c => c.code === currency)?.symbol || "₪";

  const handleServiceSelect = (key: string) => {
    setServiceType(key);
    setItems(getDefaultItems(key));
    setStep(2);
  };

  const handleSave = async () => {
    if (!user || !serviceType) return;
    // Validations
    if (!customerName.trim()) { toast({ title: "يرجى إدخال اسم العميل", variant: "destructive" }); setStep(2); return; }
    if (!destination.trim()) { toast({ title: "يرجى إدخال الوجهة", variant: "destructive" }); setStep(2); return; }
    if (returnDate && travelDate && returnDate <= travelDate) { toast({ title: "تاريخ العودة يجب أن يكون بعد تاريخ السفر", variant: "destructive" }); setStep(2); return; }
    if (payNow && parseFloat(payAmount || "0") > totalPriceILS) { toast({ title: "المبلغ المدفوع لا يمكن أن يتجاوز سعر البيع", variant: "destructive" }); return; }
    // Check passport expiry for passengers
    const expiredPax = passengers.filter(p => p.full_name.trim() && p.passport_expiry && new Date(p.passport_expiry) <= new Date());
    if (expiredPax.length > 0) {
      if (!confirm(`تنبيه: ${expiredPax.length} مسافر بجواز منتهي الصلاحية. هل تريد المتابعة؟`)) { setStep(4); return; }
    }
    setSaving(true);
    try {
      const payAmt = payNow ? parseFloat(payAmount || "0") : 0;
      const sell = totalPriceILS;
      const cost = totalCostILS;
      const paymentStatus = payAmt >= sell ? "paid" : payAmt > 0 ? "partial" : "unpaid";

      const bookingData = {
        user_id: user.id,
        contact_id: customerId || null,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        service_type: serviceType,
        destination, origin,
        travel_date: travelDate || null,
        return_date: returnDate || null,
        pax_count: paxCount,
        cost_price: cost,
        cost_currency: currency,
        cost_exchange_rate: rate,
        cost_price_ils: cost,
        selling_price: sell,
        selling_currency: currency,
        supplier_id: supplierId || null,
        supplier_contact_id: supplierId || null,
        supplier_ref: supplierRef || null,
        notes: notes || null,
      } as any;

      let booking: any;

      if (isEditMode && editId) {
        // UPDATE existing booking
        const { data, error } = await supabase.from("travel_bookings")
          .update(bookingData)
          .eq("id", editId)
          .select().single();
        if (error) throw error;
        booking = data;

        // Replace items
        await supabase.from("travel_booking_items").delete().eq("booking_id", editId);
        // Replace passengers
        await supabase.from("travel_booking_passengers").delete().eq("booking_id", editId);
      } else {
        // INSERT new booking
        bookingData.amount_paid = payAmt;
        bookingData.payment_status = paymentStatus;
        bookingData.created_by = user.id;
        bookingData.status = "confirmed";
        const { data, error } = await supabase.from("travel_bookings")
          .insert(bookingData)
          .select().single();
        if (error) throw error;
        booking = data;
      }

      // Save cost items
      if (items.length > 0) {
        const itemRows = items.map((it, idx) => ({
          booking_id: booking.id,
          user_id: dataOwnerId!,
          item_type: it.item_type,
          description: it.description || "",
          supplier_contact_id: it.supplier_contact_id || null,
          city: it.city || null,
          check_in_date: it.check_in_date || null,
          check_out_date: it.check_out_date || null,
          nights: it.nights || null,
          quantity: it.quantity || 1,
          unit_cost: it.unit_cost || 0,
          unit_price: it.unit_price || 0,
          exchange_rate: rate,
          sort_order: idx,
        }));
        await supabase.from("travel_booking_items").insert(itemRows);
      }

      // Save passengers
      const validPassengers = passengers.filter(p => p.full_name.trim());
      if (validPassengers.length > 0) {
        const pRows = [];
        for (let idx = 0; idx < validPassengers.length; idx++) {
          const p = validPassengers[idx];
          let imageUrl: string | null = p.passport_image_url || null;
          if (p.passport_image_file) {
            const ext = p.passport_image_file.name.split(".").pop() || "jpg";
            const path = `travel/${user.id}/${booking.id}/passport_${idx}.${ext}`;
            const { error: upErr } = await supabase.storage.from("travel-documents").upload(path, p.passport_image_file, { upsert: true });
            if (!upErr) { const { data: u } = supabase.storage.from("travel-documents").getPublicUrl(path); imageUrl = u?.publicUrl || null; }
          }
          pRows.push({
            booking_id: booking.id,
            user_id: user.id,
            passenger_index: idx + 1,
            full_name: p.full_name,
            full_name_en: p.full_name_en || null,
            passport_number: p.passport_number || null,
            passport_issue_date: p.passport_issue_date || null,
            passport_expiry: p.passport_expiry || null,
            passport_image_url: imageUrl,
            nationality: p.nationality || null,
            date_of_birth: p.date_of_birth || null,
            gender: p.gender || null,
            national_id: p.national_id || null,
            phone: p.phone || null,
            email: p.email || null,
            mahram_name: p.mahram_name || null,
            room_type: p.room_type || null,
          });
        }
        await supabase.from("travel_booking_passengers").insert(pRows);
      }

      if (!isEditMode) {
        // Payment record (only for new bookings)
        if (payAmt > 0) {
          await supabase.from("travel_booking_payments").insert({
            user_id: dataOwnerId!,
            booking_id: booking.id,
            amount: payAmt,
            amount_ils: payAmt,
            payment_method: payMethod,
            payment_direction: "received",
            payment_date: payDate,
            reference_number: payRefNumber || null,
            bank_name: payBankName || null,
          });
        }

        // Ensure travel accounts exist and create journal entry
        await ensureTravelAccounts(user.id);
        await createBookingJournalEntry({
          userId: user.id,
          bookingNumber: booking.booking_number,
          customerName: customerName || "",
          serviceType,
          sellingPrice: sell,
          amountPaid: payAmt,
          paymentMethod: payMethod,
        });
      }

      toast({ title: isEditMode ? `✅ تم تحديث الحجز ${booking.booking_number}` : `✅ تم إنشاء الحجز ${booking.booking_number}` });
      navigate(isEditMode ? `/travel/bookings/${editId}` : "/travel/bookings");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stepNames = ["نوع الخدمة", "التفاصيل", "بنود التكلفة", "المسافرون", "الدفع والتأكيد"];

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>{isEditMode ? `✏️ تعديل الحجز ${editBookingNumber}` : "✈️ حجز جديد"}</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-1 text-xs flex-wrap">
        {stepNames.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <button onClick={() => i + 1 < step && setStep(i + 1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${step === i + 1 ? "text-white" : step > i + 1 ? "text-white cursor-pointer" : "text-muted-foreground border"}`}
              style={{ background: step >= i + 1 ? "#0D1B2E" : "transparent" }}>
              {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
            </button>
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
              <button key={st.key} onClick={() => handleServiceSelect(st.key)}
                className={`p-4 rounded-xl border-2 text-center transition-all hover:shadow-md ${serviceType === st.key ? "border-[#C9A84C] bg-[#C9A84C]/5" : "border-border"}`}>
                <span className="text-3xl block mb-2">{st.icon}</span>
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
            {/* Customer */}
            <div className="col-span-2" ref={custRef}>
              <Label>العميل *</Label>
              <div className="relative">
                <Input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDD(true); if (!e.target.value.trim()) { setCustomerId(""); setCustomerName(""); setCustomerPhone(""); } }} onFocus={() => setShowCustomerDD(true)} placeholder="ابحث عن عميل أو أدخل اسم جديد..." />
                {showCustomerDD && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} onClick={() => handleSelectCustomer(c)} className="w-full text-right px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm">
                        <span>{c.contact_name}</span>
                        {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                      </button>
                    ))}
                    {customerSearch.trim() && !customers.find(c => c.contact_name === customerSearch.trim()) && (
                      <div className="border-t p-2 space-y-2">
                        <p className="text-xs text-muted-foreground">عميل جديد: <strong>{customerSearch}</strong></p>
                        <div className="flex gap-2">
                          <Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="الهاتف (اختياري)" className="h-8 text-xs flex-1" onKeyDown={e => e.key === "Enter" && handleQuickAddCustomer()} />
                          <Button size="sm" className="h-8 text-xs" onClick={handleQuickAddCustomer} style={{ background: "#0D1B2E" }}>➕ حفظ</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div><Label>هاتف العميل</Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
            <div>
              <Label>عدد المسافرين</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setPaxCount(Math.max(1, paxCount - 1))}><Minus className="w-4 h-4" /></Button>
                <Input type="number" min={1} value={paxCount} onChange={e => setPaxCount(Math.max(1, parseInt(e.target.value) || 1))} className="text-center" />
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setPaxCount(paxCount + 1)}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <div><Label>الوجهة *</Label><Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="مثال: إسطنبول، دبي..." /></div>
            <div><Label>المغادرة من</Label><Input value={origin} onChange={e => setOrigin(e.target.value)} /></div>
            <div><Label>تاريخ السفر</Label><Input type="date" value={travelDate} onChange={e => setTravelDate(e.target.value)} /></div>
            <div><Label>تاريخ العودة</Label><Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>

            {/* Supplier */}
            <div ref={suppRef}>
              <Label>المورد الرئيسي</Label>
              <div className="relative">
                <Input value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDD(true); if (!e.target.value.trim()) setSupplierId(""); }} onFocus={() => setShowSupplierDD(true)} placeholder="ابحث عن مورد..." />
                {showSupplierDD && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.map(c => (<button key={c.id} onClick={() => handleSelectSupplier(c)} className="w-full text-right px-3 py-2 hover:bg-muted/50 text-sm">{c.contact_name}</button>))}
                    {supplierSearch.trim() && !suppliers.find(c => c.contact_name === supplierSearch.trim()) && (
                      <div className="border-t p-2"><Button size="sm" className="h-8 text-xs w-full" onClick={handleQuickAddSupplier} style={{ background: "#0D1B2E" }}>➕ إضافة "{supplierSearch}" كمورد</Button></div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div><Label>رقم PNR / مرجع المورد</Label><Input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="PNR / Confirmation #" /></div>

            {/* Currency */}
            <div>
              <Label>العملة</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {currency !== "ILS" && (
              <div><Label>سعر الصرف (1 {currency} = X ₪)</Label><Input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} /></div>
            )}

            <div className="col-span-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} /></div>
          </div>
          {/* Validation warnings */}
          {returnDate && travelDate && returnDate <= travelDate && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تاريخ العودة يجب أن يكون بعد تاريخ السفر</span>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={() => {
              if (!customerName.trim()) { toast({ title: "يرجى إدخال اسم العميل", variant: "destructive" }); return; }
              if (!destination.trim()) { toast({ title: "يرجى إدخال الوجهة", variant: "destructive" }); return; }
              if (returnDate && travelDate && returnDate <= travelDate) { toast({ title: "تاريخ العودة يجب أن يكون بعد تاريخ السفر", variant: "destructive" }); return; }
              setStep(3);
            }} style={{ background: "#0D1B2E" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 3: Cost Items */}
      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">بنود التكلفة والتسعير</h2>
            <Button variant="outline" size="sm" onClick={() => setItems([...items, defaultItem()])}><Plus className="w-3 h-3 ml-1" /> إضافة بند</Button>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="p-4 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">بند {i + 1}</span>
                  {items.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-destructive" /></Button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">نوع البند</Label>
                    <Select value={item.item_type} onValueChange={v => updateItem(i, "item_type", v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.icon} {t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 md:col-span-1"><Label className="text-xs">الوصف</Label><Input className="h-9 text-xs" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} /></div>
                  <div><Label className="text-xs">المدينة</Label><Input className="h-9 text-xs" value={item.city} onChange={e => updateItem(i, "city", e.target.value)} /></div>
                </div>

                {(item.item_type === "hotel") && (
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs">تاريخ الدخول</Label><Input type="date" className="h-9 text-xs" value={item.check_in_date} onChange={e => updateItem(i, "check_in_date", e.target.value)} /></div>
                    <div><Label className="text-xs">تاريخ الخروج</Label><Input type="date" className="h-9 text-xs" value={item.check_out_date} onChange={e => updateItem(i, "check_out_date", e.target.value)} /></div>
                    <div><Label className="text-xs">عدد الليالي</Label><Input type="number" className="h-9 text-xs" value={item.nights} readOnly /></div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                  <div><Label className="text-xs">الكمية</Label><Input type="number" min={1} className="h-9 text-xs" value={item.quantity} onChange={e => updateItem(i, "quantity", parseInt(e.target.value) || 1)} /></div>
                  <div><Label className="text-xs">سعر التكلفة ({curSymbol})</Label><Input type="number" className="h-9 text-xs" value={item.unit_cost || ""} onChange={e => updateItem(i, "unit_cost", parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">سعر البيع ({curSymbol})</Label><Input type="number" className="h-9 text-xs" value={item.unit_price || ""} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} /></div>
                  <div>
                    <Label className="text-xs">الربح</Label>
                    <div className="h-9 flex items-center text-xs font-medium" style={{ color: ((item.quantity || 1) * (item.unit_price || 0) - (item.quantity || 1) * (item.unit_cost || 0)) >= 0 ? "#16A34A" : "#DC2626" }}>
                      {curSymbol}{((item.quantity || 1) * (item.unit_price - item.unit_cost)).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-4 rounded-lg grid grid-cols-4 gap-4 text-center" style={{ background: "rgba(13,27,46,0.05)" }}>
            <div><p className="text-xs text-muted-foreground">إجمالي التكلفة</p><p className="text-lg font-bold">{curSymbol}{totalCost.toLocaleString()}</p>{currency !== "ILS" && <p className="text-[10px] text-muted-foreground">₪{totalCostILS.toLocaleString()}</p>}</div>
            <div><p className="text-xs text-muted-foreground">إجمالي البيع</p><p className="text-lg font-bold">{curSymbol}{totalPrice.toLocaleString()}</p>{currency !== "ILS" && <p className="text-[10px] text-muted-foreground">₪{totalPriceILS.toLocaleString()}</p>}</div>
            <div><p className="text-xs text-muted-foreground">إجمالي الربح</p><p className="text-lg font-bold" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">نسبة الربح</p><p className="text-lg font-bold">{profitPct.toFixed(1)}%</p></div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={() => setStep(4)} style={{ background: "#0D1B2E" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 4: Passengers */}
      {step === 4 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">المسافرون ({passengers.length})</h2>
            <Button variant="outline" size="sm" onClick={() => { setPassengers([...passengers, defaultPassenger()]); setPaxCount(paxCount + 1); }}><Plus className="w-3 h-3 ml-1" /> إضافة مسافر</Button>
          </div>
          <Accordion type="multiple" defaultValue={passengers.map((_, i) => `p-${i}`)}>
            {passengers.map((p, i) => (
              <AccordionItem key={i} value={`p-${i}`}>
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
                  <div className="flex items-center justify-between w-full pl-2">
                    <span>👤 المسافر {i + 1}{p.full_name ? ` — ${p.full_name}` : ""}</span>
                    {passengers.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6 mr-2" onClick={e => { e.stopPropagation(); setPassengers(passengers.filter((_, idx) => idx !== i)); setPaxCount(Math.max(1, paxCount - 1)); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div><Label className="text-xs">الاسم الكامل (عربي) *</Label><Input value={p.full_name} onChange={e => updatePassenger(i, "full_name", e.target.value)} /></div>
                    <div><Label className="text-xs">الاسم بالإنجليزية</Label><Input value={p.full_name_en} onChange={e => updatePassenger(i, "full_name_en", e.target.value)} placeholder="As in passport" /></div>
                    <div><Label className="text-xs">الجنسية</Label><Input value={p.nationality} onChange={e => updatePassenger(i, "nationality", e.target.value)} /></div>
                    <div><Label className="text-xs">تاريخ الميلاد</Label><Input type="date" value={p.date_of_birth} onChange={e => updatePassenger(i, "date_of_birth", e.target.value)} /></div>
                    <div>
                      <Label className="text-xs">الجنس</Label>
                      <Select value={p.gender} onValueChange={v => updatePassenger(i, "gender", v)}>
                        <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent><SelectItem value="male">ذكر</SelectItem><SelectItem value="female">أنثى</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">رقم الهوية الوطنية</Label><Input value={p.national_id} onChange={e => updatePassenger(i, "national_id", e.target.value)} /></div>
                    <div><Label className="text-xs">الهاتف</Label><Input value={p.phone} onChange={e => updatePassenger(i, "phone", e.target.value)} /></div>
                    <div><Label className="text-xs">البريد الإلكتروني</Label><Input type="email" value={p.email} onChange={e => updatePassenger(i, "email", e.target.value)} /></div>
                    {(serviceType === "hajj" || serviceType === "umrah") && p.gender === "female" && (
                      <div><Label className="text-xs">اسم المحرم</Label><Input value={p.mahram_name} onChange={e => updatePassenger(i, "mahram_name", e.target.value)} /></div>
                    )}
                    <div>
                      <Label className="text-xs">نوع الغرفة</Label>
                      <Select value={p.room_type} onValueChange={v => updatePassenger(i, "room_type", v)}>
                        <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">فردية</SelectItem>
                          <SelectItem value="double">مزدوجة</SelectItem>
                          <SelectItem value="triple">ثلاثية</SelectItem>
                          <SelectItem value="quad">رباعية</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Passport */}
                  <div className="p-4 rounded-lg border border-dashed space-y-3" style={{ borderColor: "rgba(13,27,46,0.3)" }}>
                    <h4 className="text-sm font-semibold" style={{ color: "#0D1B2E" }}>🛂 بيانات الجواز</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">رقم جواز السفر</Label>
                        <Input value={p.passport_number} onChange={e => updatePassenger(i, "passport_number", e.target.value)} placeholder="A12345678" />
                        {p.passport_number && !isPassportNumValid(p.passport_number) && <p className="text-xs text-destructive mt-1">أحرف وأرقام فقط، 6–12 خانة</p>}
                      </div>
                      <div>
                        <Label className="text-xs">تاريخ الإصدار</Label>
                        <Input type="date" value={p.passport_issue_date} onChange={e => updatePassenger(i, "passport_issue_date", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">تاريخ الانتهاء</Label>
                        <Input type="date" value={p.passport_expiry} onChange={e => updatePassenger(i, "passport_expiry", e.target.value)} />
                        {isPassportExpired(p.passport_expiry) && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> الجواز منتهي</p>}
                        {isPassportNearExpiry(p.passport_expiry) && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#E67E22" }}><AlertTriangle className="w-3 h-3" /> قارب على الانتهاء</p>}
                      </div>
                    </div>

                    {/* Upload */}
                    <div>
                      <Label className="text-xs">صورة الجواز</Label>
                      {p.passport_image_url ? (
                        <div className="relative mt-2 inline-block">
                          {p.passport_image_file?.type === "application/pdf"
                            ? <div className="w-32 h-20 rounded-lg border flex items-center justify-center bg-muted text-xs">📄 PDF</div>
                            : <img src={p.passport_image_url} alt="جواز" className="w-32 h-20 object-cover rounded-lg border" />}
                          <button onClick={() => { const u = [...passengers]; u[i].passport_image_file = null; u[i].passport_image_url = ""; setPassengers(u); }}
                            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="mt-2 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30" style={{ borderColor: "rgba(13,27,46,0.2)" }}
                          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handlePassportUpload(i, f); }}
                          onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/jpeg,image/png,application/pdf"; inp.onchange = ev => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handlePassportUpload(i, f); }; inp.click(); }}>
                          <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">اسحب الصورة هنا أو اضغط للرفع</p>
                          <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, PDF — حد 5MB</p>
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
            <Button onClick={() => setStep(5)} style={{ background: "#0D1B2E" }} className="text-white"><ArrowLeft className="w-4 h-4 ml-1" /> التالي</Button>
          </div>
        </Card>
      )}

      {/* Step 5: Payment & Confirm */}
      {step === 5 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">ملخص الحجز والدفع</h2>

          {/* Summary */}
          <div className="p-4 rounded-lg space-y-2 text-sm" style={{ background: "rgba(13,27,46,0.04)" }}>
            <div className="flex justify-between"><span>الخدمة:</span><span className="font-medium">{SERVICE_TYPES.find(s => s.key === serviceType)?.icon} {SERVICE_TYPES.find(s => s.key === serviceType)?.label}</span></div>
            <div className="flex justify-between"><span>العميل:</span><span>{customerName || "—"}</span></div>
            <div className="flex justify-between"><span>الوجهة:</span><span>{destination || "—"}</span></div>
            <div className="flex justify-between"><span>التواريخ:</span><span>{travelDate || "—"} → {returnDate || "—"}</span></div>
            <div className="flex justify-between"><span>عدد المسافرين:</span><span>{passengers.filter(p => p.full_name).length}</span></div>
            <div className="border-t pt-2 mt-2 space-y-1">
              {items.filter(it => it.description).map((it, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{ITEM_TYPES.find(t => t.key === it.item_type)?.icon} {it.description}</span>
                  <span>{curSymbol}{((it.quantity || 1) * it.unit_price).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 mt-2 space-y-1 font-medium">
              <div className="flex justify-between"><span>إجمالي البيع:</span><span className="text-lg">₪{totalPriceILS.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>الربح:</span><span style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()} ({profitPct.toFixed(1)}%)</span></div>
            </div>
          </div>

          {/* Payment */}
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" checked={payNow} onChange={e => setPayNow(e.target.checked)} id="payNow" className="rounded" />
            <label htmlFor="payNow" className="text-sm font-medium">تسجيل دفعة الآن</label>
          </div>

          {payNow && (
            <div className="space-y-4 p-4 rounded-lg border">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>المبلغ المدفوع *</Label>
                  <Input type="number" value={payAmount} onChange={e => {
                    const v = parseFloat(e.target.value || "0");
                    if (v > totalPriceILS) { setPayAmount(String(totalPriceILS)); return; }
                    setPayAmount(e.target.value);
                  }} placeholder={totalPriceILS.toString()} />
                  {parseFloat(payAmount || "0") > totalPriceILS && (
                    <p className="text-xs text-destructive mt-1">المبلغ لا يمكن أن يتجاوز ₪{totalPriceILS.toLocaleString()}</p>
                  )}
                </div>
                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAY_METHODS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {(payMethod === "bank_transfer" || payMethod === "check") && (
                  <>
                    <div><Label>اسم البنك</Label><Input value={payBankName} onChange={e => setPayBankName(e.target.value)} /></div>
                    <div><Label>رقم المرجع / الشيك</Label><Input value={payRefNumber} onChange={e => setPayRefNumber(e.target.value)} /></div>
                  </>
                )}
                <div><Label>تاريخ الدفع</Label><Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep(4)}><ArrowRight className="w-4 h-4 ml-1" /> السابق</Button>
            <Button onClick={handleSave} disabled={saving} className="text-white px-8" style={{ background: "#C9A84C" }}>
              {saving ? "جارٍ الحفظ..." : "✅ تأكيد الحجز وإنشاء القيد"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
