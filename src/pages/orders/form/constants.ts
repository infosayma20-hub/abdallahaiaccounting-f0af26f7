export const PAYMENT_METHODS = ["كاش", "تحويل بنكي", "شيك", "دفع إلكتروني", "آجل"];
export const SOURCES = ["يدوي", "متجر إلكتروني", "واتساب", "هاتف", "أخرى"];
export const STATUSES = ["جديد", "مؤكد", "قيد التجهيز", "جاهز للفوترة", "مفوتر", "جاهز للشحن", "تم الشحن", "تم التسليم", "مؤجل", "ملغي"];
export const PAYMENT_STATUSES = ["غير مدفوع", "مدفوع جزئياً", "مدفوع كاملاً"];

export const PROFILE_PLATFORMS: { value: string; label: string; prefix?: string }[] = [
  { value: "none", label: "— بدون —" },
  { value: "instagram", label: "إنستجرام", prefix: "https://instagram.com/" },
  { value: "facebook", label: "فيسبوك", prefix: "https://facebook.com/" },
  { value: "tiktok", label: "تيك توك", prefix: "https://tiktok.com/@" },
  { value: "snapchat", label: "سناب شات", prefix: "https://snapchat.com/add/" },
  { value: "whatsapp", label: "واتساب", prefix: "https://wa.me/" },
  { value: "x", label: "X (تويتر)", prefix: "https://x.com/" },
  { value: "website", label: "موقع/رابط آخر" },
];

export const REGIONS: Record<string, string[]> = {
  "الداخل 48": ["حيفا", "يافا", "عكا", "الناصرة", "اللد", "الرملة", "أم الفحم", "الطيبة", "باقة الغربية", "سخنين", "شفاعمرو", "طمرة", "عرعرة", "كفر قاسم", "كفر كنا", "المغار", "دبورية", "عرابة", "كفر ياسيف"],
  "القدس": ["القدس", "أبو ديس", "العيزرية", "بيت حنينا", "شعفاط", "العيسوية", "سلوان", "الطور", "بيت صفافا", "صور باهر"],
  "الضفة الغربية": ["رام الله", "نابلس", "الخليل", "بيت لحم", "جنين", "طولكرم", "قلقيلية", "أريحا", "سلفيت", "طوباس", "يطا", "دورا", "حلحول", "بيت جالا", "بيت ساحور", "بيرزيت", "بيتونيا"],
  "النقب والجنوب": ["بئر السبع", "رهط", "تل السبع", "حورة", "كسيفة", "اللقية", "عرعرة النقب", "شقيب السلام"],
};

export const defaultForm = {
  manual_ref: "",
  customer_name: "",
  customer_phone: "",
  customer_address: "",
  customer_profile_url: "",
  customer_profile_platform: "none",
  order_date: new Date().toISOString().split("T")[0],
  delivery_date: "",
  status: "جديد",
  subtotal: 0,
  discount: 0,
  shipping_cost: 0,
  total: 0,
  payment_status: "غير مدفوع",
  payment_method: "كاش",
  shipping_method: "",
  tracking_number: "",
  source: "يدوي",
  notes: "",
};

export type OrderForm = typeof defaultForm;

export type Item = {
  id?: string;
  product_id?: string | null;
  product_name: string;
  /** خاصية القماش على مستوى البند (اختيارية) */
  fabric?: string | null;
  /** المورد المرتبط بالبند (من دليل pos_suppliers) لتوليد طلبية شراء */
  supplier_id?: string | null;
  /** طلبية الشراء التي تولّدت من هذا البند (بعد الإنشاء) */
  procurement_order_id?: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
};

export const fmt = (n: number) =>
  `₪${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;