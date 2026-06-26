import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus, ShoppingBag, Check, ChefHat, X, Clock, ChevronRight, ChevronLeft, Home, UtensilsCrossed, MapPin, User, Menu, Flame, GlassWater } from "lucide-react";
import malakyLogo from "@/assets/malaky-logo.png.asset.json";
import broastBucket from "@/assets/menu/broast-bucket.png.asset.json";

// خريطة كلمات مفتاحية → صور طعام من Unsplash (احتياطية لحين رفع صور المنتجات)
// صور 4K واضحة — تظهر بكامل الشاشة لتجوّع الزبون
const IMG_Q = "w=1920&q=95&auto=format&fit=crop";
// لكل تصنيف مجموعة صور — نختار صورة مختلفة لكل صنف حسب اسمه
const FOOD_IMAGE_MAP: Array<{ keys: string[]; urls: string[] }> = [
  { keys: ["بيتزا", "pizza"], urls: [
    `https://images.unsplash.com/photo-1513104890138-7c749659a591?${IMG_Q}`,
    `https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?${IMG_Q}`,
    `https://images.unsplash.com/photo-1574071318508-1cdbab80d002?${IMG_Q}`,
  ]},
  { keys: ["برغر", "برجر", "burger"], urls: [
    `https://images.unsplash.com/photo-1568901346375-23c9450c58cd?${IMG_Q}`,
    `https://images.unsplash.com/photo-1586190848861-99aa4a171e90?${IMG_Q}`,
    `https://images.unsplash.com/photo-1550317138-10000687a72b?${IMG_Q}`,
  ]},
  // بروست / دجاج / فخاد — صورة موحّدة من رفع المالك
  { keys: ["بروست", "دجاج", "كريسبي", "crispy", "تندرز", "broast", "fried", "كرسبي", "فخاد", "فخد", "ورك", "صدر", "قطع", "وجبة قطعة", "وجبة عائلية", "عائلية", "family", "chicken"], urls: [
    broastBucket.url,
  ]},
  { keys: ["مشوي", "شوي", "grill", "مشاوي"], urls: [
    `https://images.unsplash.com/photo-1555939594-58d7cb561ad1?${IMG_Q}`,
    `https://images.unsplash.com/photo-1544025162-d76694265947?${IMG_Q}`,
    `https://images.unsplash.com/photo-1432139509613-5c4255815697?${IMG_Q}`,
  ]},
  { keys: ["شاورما", "shawarma"], urls: [
    `https://images.unsplash.com/photo-1633321088355-d0f81134ca3b?${IMG_Q}`,
    `https://images.unsplash.com/photo-1561651823-34feb02250e4?${IMG_Q}`,
  ]},
  { keys: ["سموذي", "smoothie"], urls: [
    `https://images.unsplash.com/photo-1505252585461-04db1eb84625?${IMG_Q}`,
    `https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?${IMG_Q}`,
  ]},
  { keys: ["عصير", "juice", "طبيعية"], urls: [
    `https://images.unsplash.com/photo-1600271886742-f049cd451bba?${IMG_Q}`,
    `https://images.unsplash.com/photo-1622597467836-f3285f2131b8?${IMG_Q}`,
  ]},
  { keys: ["موهيتو", "mojito", "نعناع"], urls: [
    `https://images.unsplash.com/photo-1551538827-9c037cb4f32a?${IMG_Q}`,
    `https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?${IMG_Q}`,
  ]},
  { keys: ["بطاطا", "fries", "بطاطس"], urls: [
    `https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?${IMG_Q}`,
    `https://images.unsplash.com/photo-1573080496219-bb080dd4f877?${IMG_Q}`,
  ]},
  { keys: ["سلطة", "salad"], urls: [
    `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?${IMG_Q}`,
    `https://images.unsplash.com/photo-1512621776951-a57141f2eefd?${IMG_Q}`,
  ]},
  { keys: ["وجبة", "كرسي", "اريزكو"], urls: [
    `https://images.unsplash.com/photo-1567620832903-9fc6debc209f?${IMG_Q}`,
    `https://images.unsplash.com/photo-1606755962773-d324e0a13086?${IMG_Q}`,
  ]},
  { keys: ["أطفال", "اطفال", "kids"], urls: [
    `https://images.unsplash.com/photo-1546548970-71785318a17b?${IMG_Q}`,
  ]},
  { keys: ["عرض", "offer"], urls: [
    `https://images.unsplash.com/photo-1504674900247-0877df9cc836?${IMG_Q}`,
  ]},
  { keys: ["ميلك", "milkshake", "شيك"], urls: [
    `https://images.unsplash.com/photo-1572490122747-3968b75cc699?${IMG_Q}`,
  ]},
  { keys: ["بوظة", "آيس", "ice cream"], urls: [
    `https://images.unsplash.com/photo-1501443762994-82bd5dace89a?${IMG_Q}`,
  ]},
];
const DEFAULT_FOOD_IMG = `https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?${IMG_Q}`;
function hashStr(s: string): number {
  let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function pickFoodImage(name?: string, catName?: string, seed?: string): string {
  const text = `${name || ""} ${catName || ""}`.toLowerCase();
  for (const m of FOOD_IMAGE_MAP) {
    if (m.keys.some(k => text.includes(k.toLowerCase()))) {
      const idx = hashStr(seed || name || "") % m.urls.length;
      return m.urls[idx];
    }
  }
  return DEFAULT_FOOD_IMG;
}
import { toast } from "sonner";

type Resolved = {
  user_id: string; branch_id: string; branch_name: string; account_name: string;
  welcome_message: string | null; require_phone: boolean; mode: string;
};
type ModifierOption = { id: string; name: string; extra_price: number; is_default: boolean };
type ModifierGroup = {
  id: string; name: string; selection_type: string;
  is_required: boolean; min_select: number | null; max_select: number | null;
  options: ModifierOption[];
};
type Product = {
  id: string; name: string; price: number; image_url: string | null;
  category_id: string; description: string | null;
  modifier_groups: ModifierGroup[];
};
type Category = { id: string; name: string; sort_order: number | null };
type CartLine = {
  product_id: string; name: string; base_price: number;
  unit_price: number; qty: number; note: string;
  modifiers: { group_id: string; group_name: string; option_id: string; name: string; extra_price: number }[];
};

export default function PublicMenuPage() {
  const { accountSlug, branchSlug, tableCode } = useParams();
  const [ctx, setCtx] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<string>("pending");
  const [detail, setDetail] = useState<Product | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showSideMenu, setShowSideMenu] = useState(false);

  // Resolve
  useEffect(() => {
    if (!accountSlug || !branchSlug) return;
    (async () => {
      const { data, error } = await (supabase as any).rpc("qr_menu_resolve", {
        _account_slug: accountSlug, _branch_slug: branchSlug,
      });
      if (error || !data || data.length === 0) { setError("المنيو غير متاح حالياً"); return; }
      setCtx(data[0] as Resolved);
    })();
  }, [accountSlug, branchSlug]);

  // Load menu
  useEffect(() => {
    if (!ctx) return;
    (async () => {
      const { data } = await (supabase as any).rpc("qr_menu_get_menu", { _user_id: ctx.user_id, _branch_id: ctx.branch_id });
      if (data?.error) { setError("المنيو غير متاح"); return; }
      setCategories((data?.categories || []) as Category[]);
      setProducts((data?.products || []) as Product[]);
      if (data?.categories?.[0]) setActiveCat(data.categories[0].id);
    })();
  }, [ctx]);

  // Realtime: track submitted order status
  useEffect(() => {
    if (!submittedId) return;
    const ch = supabase.channel("qr_order_" + submittedId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "qr_menu_orders", filter: `id=eq.${submittedId}` },
        (payload: any) => setSubmittedStatus(payload.new.status))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [submittedId]);

  const filtered = useMemo(() => products.filter(p => p.category_id === activeCat), [products, activeCat]);
  useEffect(() => { setActiveIdx(0); }, [activeCat]);
  const current = filtered[activeIdx];
  const goPrev = () => setActiveIdx(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
  const goNext = () => setActiveIdx(i => (filtered.length ? (i + 1) % filtered.length : 0));
  const catNameById = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [categories]);
  const total = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);

  const openProduct = (p: Product) => {
    if (!p.modifier_groups || p.modifier_groups.length === 0) {
      // simple add — no modifiers
      setCart(prev => {
        const idx = prev.findIndex(l => l.product_id === p.id && l.modifiers.length === 0);
        if (idx >= 0) { const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + 1 }; return c; }
        return [...prev, {
          product_id: p.id, name: p.name,
          base_price: Number(p.price) || 0, unit_price: Number(p.price) || 0,
          qty: 1, note: "", modifiers: [],
        }];
      });
      return;
    }
    setDetail(p);
  };
  const addLineFromDetail = (line: CartLine) => {
    setCart(prev => [...prev, line]);
    setDetail(null);
  };
  const changeQty = (i: number, d: number) => setCart(prev => {
    const c = [...prev]; const q = c[i].qty + d;
    if (q <= 0) c.splice(i, 1); else c[i] = { ...c[i], qty: q };
    return c;
  });

  const submit = async () => {
    if (!ctx) return;
    if (cart.length === 0) { toast.error("السلة فارغة"); return; }
    if (ctx.require_phone && !phone.trim()) { toast.error("الجوال مطلوب"); return; }
    setSubmitting(true);
    const itemsPayload = cart.map(l => ({
      product_id: l.product_id, name: l.name, qty: l.qty,
      price: l.unit_price, base_price: l.base_price,
      modifiers: l.modifiers, note: l.note,
    }));
    const { data, error } = await supabase.from("qr_menu_orders").insert({
      user_id: ctx.user_id, branch_id: ctx.branch_id,
      table_id: tableCode || null,
      customer_name: name.trim() || null, customer_phone: phone.trim() || null,
      items: itemsPayload, notes: notes.trim() || null,
    } as any).select("id").single();
    setSubmitting(false);
    if (error) { toast.error("تعذّر الإرسال: " + error.message); return; }
    setSubmittedId((data as any).id);
    setSubmittedStatus("pending");
    setShowCart(false);
  };

  if (error) {
    return (
      <div dir="rtl" className="min-h-[100dvh] grid place-items-center p-6 text-center"
        style={{ background: "#ffffff", color: "#1F2C7C" }}>
        <div className="space-y-2">
          <ChefHat className="h-12 w-12 mx-auto" style={{ color: "#E63027" }} />
          <h1 className="text-2xl font-bold">{error}</h1>
          <p className="text-sm opacity-70">يرجى التواصل مع الكاشير</p>
        </div>
      </div>
    );
  }
  if (!ctx) return (
    <div className="min-h-[100dvh] grid place-items-center" style={{ background: "#ffffff", color: "#1F2C7C" }}>
      <div className="animate-pulse text-sm tracking-widest">جارٍ تحضير المنيو…</div>
    </div>
  );

  if (submittedId) {
    const labels: Record<string, string> = {
      pending: "طلبك قيد المراجعة…", accepted: "تم قبول طلبك — يجهّز الآن",
      rejected: "اعتذر الكاشير عن الطلب", converted: "طلبك في الإعداد", cancelled: "تم الإلغاء",
    };
    const isOk = submittedStatus === "accepted" || submittedStatus === "converted";
    const isPending = submittedStatus === "pending";
    return (
      <div dir="rtl" className="min-h-[100dvh] grid place-items-center p-6"
        style={{ background: "#ffffff", color: "#1F2C7C" }}>
        <div className="max-w-sm w-full rounded-3xl p-8 text-center space-y-4 border-2"
          style={{ background: "#ffffff", borderColor: "#F1F1F5", boxShadow: "0 20px 60px -20px rgba(31,44,124,0.15)" }}>
          <div className="mx-auto h-20 w-20 rounded-full grid place-items-center"
            style={{ background: isOk ? "#16A34A" : isPending ? "#1F2C7C" : "#E63027" }}>
            {isPending ? <Clock className="h-10 w-10 text-white" /> : isOk ? <Check className="h-10 w-10 text-white" /> : <X className="h-10 w-10 text-white" />}
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#1F2C7C" }}>{labels[submittedStatus] || submittedStatus}</h1>
          <p className="text-sm opacity-60">{ctx.account_name} · {ctx.branch_name}</p>
          {submittedStatus === "rejected" && (
            <button onClick={() => { setSubmittedId(null); setCart([]); }}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "#E63027" }}>
              إعادة الطلب
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] w-full relative overflow-hidden"
      style={{ background: "#F5F5F5", color: "#1F2C7C", fontFamily: "'Tajawal','Cairo','Noto Naskh Arabic',sans-serif" }}>

      {/* Right vertical red sidebar (RTL leading edge) - hidden on mobile, bottom nav used instead */}
      <aside className="hidden md:flex fixed top-0 right-0 h-full w-[72px] lg:w-[88px] z-40 flex-col items-center py-6 gap-7 text-white"
        style={{ background: "#E63027" }}>
        <button className="flex flex-col items-center gap-1 opacity-90 hover:opacity-100 transition">
          <Home className="h-5 w-5" /><span className="text-[11px] font-bold">الرئيسية</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <UtensilsCrossed className="h-5 w-5" /><span className="text-[11px] font-bold">القائمة</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-90">
          <MapPin className="h-5 w-5" /><span className="text-[11px] font-bold">الفروع</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-90">
          <User className="h-5 w-5" /><span className="text-[11px] font-bold">حسابي</span>
        </button>
        <button onClick={() => cart.length && setShowCart(true)} className="flex flex-col items-center gap-1 opacity-90 mt-auto relative">
          <div className="relative">
            <ShoppingBag className="h-5 w-5" />
            {cart.reduce((s,l)=>s+l.qty,0) > 0 && (
              <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full grid place-items-center text-[10px] font-black bg-white" style={{ color: "#E63027" }}>
                {cart.reduce((s,l)=>s+l.qty,0)}
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold">سلة الطلب</span>
        </button>
      </aside>

      {/* Main canvas (offset from sidebar on md+) */}
      <div className="md:mr-[72px] lg:mr-[88px] min-h-[100dvh] relative pb-20 md:pb-0">

        {/* Top bar: responsive — single row on desktop, stacked on mobile */}
        <header className="relative z-20 px-4 sm:px-6 lg:px-10 pt-4 sm:pt-6">
          {/* Row 1: logo + branch + menu */}
          <div className="flex items-center justify-between gap-3">
            <div className="h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20 rounded-2xl bg-white p-1.5 sm:p-2 shrink-0"
              style={{ boxShadow: "0 8px 24px -10px rgba(230,48,39,0.25)" }}>
              <img src={malakyLogo.url} alt={ctx.account_name} className="w-full h-full object-contain" />
            </div>

            {/* Categories on desktop, between logo and branch */}
            <nav className="hidden md:block flex-1 min-w-0">
              <div className="mx-auto max-w-3xl rounded-full px-3 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hide"
                style={{ background: "#fff", boxShadow: "0 8px 24px -14px rgba(31,44,124,0.18)" }}>
                {categories.map(c => {
                  const active = activeCat === c.id;
                  return (
                    <button key={c.id} onClick={() => setActiveCat(c.id)}
                      className="px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                      style={active
                        ? { background: "#E63027", color: "#fff" }
                        : { background: "transparent", color: "#1F2C7C" }}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2 max-w-[120px] sm:max-w-none truncate"
                style={{ background: "#E63027" }}>
                <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">{ctx.branch_name}</span>
              </div>
              <button onClick={() => setShowSideMenu(true)}
                className="h-10 w-10 sm:h-11 sm:w-11 rounded-full grid place-items-center bg-white shrink-0"
                style={{ boxShadow: "0 8px 20px -12px rgba(31,44,124,0.2)", color: "#1F2C7C" }}>
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Row 2 (mobile only): full-width categories scroll bar */}
          <nav className="md:hidden mt-3 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              {categories.map(c => {
                const active = activeCat === c.id;
                return (
                  <button key={c.id} onClick={() => setActiveCat(c.id)}
                    className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shrink-0"
                    style={active
                      ? { background: "#E63027", color: "#fff", boxShadow: "0 8px 18px -8px rgba(230,48,39,0.5)" }
                      : { background: "#fff", color: "#1F2C7C", boxShadow: "0 4px 12px -6px rgba(31,44,124,0.12)" }}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </nav>
        </header>

        {/* Showcase area */}
        {filtered.length === 0 || !current ? (
          <div className="min-h-[70vh] grid place-items-center">
            <p className="text-lg opacity-60">لا توجد أصناف في هذا القسم</p>
          </div>
        ) : (
          <main className="relative px-4 sm:px-6 lg:px-16 pt-4 sm:pt-8 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-center lg:min-h-[78vh]">
              {/* Right column (text) — comes first in RTL */}
              <div className="relative z-10 lg:pr-6 text-center lg:text-right">
                <h1 className="text-3xl sm:text-4xl lg:text-7xl font-black"
                  style={{ color: "#E63027", lineHeight: 1.55 }}>
                  {current.name}
                </h1>
                {current.description && (
                  <p className="mt-4 sm:mt-6 text-sm sm:text-base lg:text-lg max-w-md mx-auto lg:mx-0"
                    style={{ color: "#1F2C7C", opacity: 0.85, lineHeight: 2 }}>
                    {current.description}
                  </p>
                )}

                {/* Specs row */}
                <div className="mt-6 sm:mt-8 flex items-center justify-center lg:justify-start gap-6 sm:gap-10">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <GlassWater className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: "#E63027" }} />
                    <div>
                      <div className="text-lg sm:text-xl font-black" style={{ color: "#1F2C7C" }}>450 مل</div>
                      <div className="text-[11px] sm:text-xs opacity-60">الحجم</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Flame className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: "#E63027" }} />
                    <div>
                      <div className="text-lg sm:text-xl font-black" style={{ color: "#1F2C7C" }}>280</div>
                      <div className="text-[11px] sm:text-xs opacity-60">سعرات حرارية</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 sm:mt-10 h-px w-48 sm:w-64 mx-auto lg:mx-0" style={{ background: "#E5E7EE" }} />

                {/* Price — RTL-safe: render the number as one LTR unit */}
                <div className="mt-4 sm:mt-6 flex items-baseline justify-center lg:justify-start gap-3" style={{ color: "#1F2C7C" }}>
                  <span dir="ltr" className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight inline-block">
                    {Number(current.price).toFixed(2)}
                  </span>
                  <span className="text-xl sm:text-2xl font-bold opacity-70">₪</span>
                </div>

                {/* CTA */}
                <button onClick={() => openProduct(current)}
                  className="mt-6 sm:mt-8 inline-flex items-center gap-3 pl-6 sm:pl-8 pr-2 py-2 rounded-full font-black text-base sm:text-lg text-white transition-transform active:scale-[0.98]"
                  style={{ background: "#E63027", boxShadow: "0 18px 36px -14px rgba(230,48,39,0.55)" }}>
                  <span className="h-10 w-10 sm:h-12 sm:w-12 rounded-full grid place-items-center bg-white" style={{ color: "#E63027" }}>
                    <Plus className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
                  </span>
                  أضف للطلب
                </button>
              </div>

              {/* Left column (image with red half-circle) */}
              <div className="relative h-[42vh] sm:h-[52vh] lg:h-[78vh] order-first lg:order-last">
                {/* Red disc */}
                <div className="absolute inset-0 grid place-items-center">
                  <div className="relative w-[80%] sm:w-[85%] lg:w-[90%] aspect-square max-w-[560px]">
                    <div className="absolute inset-0 rounded-full"
                      style={{ background: "#E63027" }} />
                    {/* Concentric outline ring */}
                    <div className="absolute -inset-3 sm:-inset-6 rounded-full pointer-events-none"
                      style={{ border: "2px dashed rgba(230,48,39,0.25)" }} />
                    {/* Product image */}
                    <img src={current.image_url || pickFoodImage(current.name, catNameById[current.category_id], current.id)}
                      alt={current.name}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_FOOD_IMG; }}
                      className="absolute inset-0 w-full h-full object-cover rounded-full"
                      style={{ filter: "drop-shadow(0 40px 50px rgba(0,0,0,0.35))" }} />
                  </div>
                </div>

                {/* "New" badge */}
                <div className="absolute top-2 sm:top-6 left-2 h-14 w-14 sm:h-20 sm:w-20 rounded-full grid place-items-center bg-white text-xs sm:text-sm font-black"
                  style={{ border: "2px solid #E63027", color: "#E63027" }}>
                  جديد
                </div>
              </div>
            </div>

            {/* Navigation arrows */}
            <button onClick={goNext} aria-label="next"
              className="absolute top-[22vh] sm:top-[26vh] lg:top-1/2 lg:-translate-y-1/2 right-2 sm:right-4 lg:right-8 h-10 w-10 sm:h-12 sm:w-12 rounded-full grid place-items-center bg-white z-20"
              style={{ boxShadow: "0 10px 24px -10px rgba(31,44,124,0.25)", color: "#1F2C7C" }}>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button onClick={goPrev} aria-label="prev"
              className="absolute top-[22vh] sm:top-[26vh] lg:top-1/2 lg:-translate-y-1/2 left-2 sm:left-4 lg:left-8 h-10 w-10 sm:h-12 sm:w-12 rounded-full grid place-items-center bg-white z-20"
              style={{ boxShadow: "0 10px 24px -10px rgba(31,44,124,0.25)", color: "#1F2C7C" }}>
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            {/* Dot indicators */}
            <div className="mt-4 sm:mt-8 flex items-center justify-center gap-2">
              {filtered.slice(0, Math.min(filtered.length, 8)).map((_, i) => (
                <button key={i} onClick={() => setActiveIdx(i)}
                  className="h-2 rounded-full transition-all"
                  style={i === activeIdx
                    ? { width: 22, background: "#E63027" }
                    : { width: 8, background: "#D5D9E2" }} />
              ))}
            </div>
          </main>
        )}
      </div>

      {/* Mobile bottom nav (replaces side rail on small screens) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around py-2 text-white"
        style={{ background: "#E63027", boxShadow: "0 -8px 24px -10px rgba(230,48,39,0.4)" }}>
        <button className="flex flex-col items-center gap-0.5 px-3 py-1">
          <Home className="h-5 w-5" /><span className="text-[10px] font-bold">الرئيسية</span>
        </button>
        <button className="flex flex-col items-center gap-0.5 px-3 py-1">
          <UtensilsCrossed className="h-5 w-5" /><span className="text-[10px] font-bold">القائمة</span>
        </button>
        <button className="flex flex-col items-center gap-0.5 px-3 py-1">
          <MapPin className="h-5 w-5" /><span className="text-[10px] font-bold">الفروع</span>
        </button>
        <button onClick={() => cart.length && setShowCart(true)} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
          <div className="relative">
            <ShoppingBag className="h-5 w-5" />
            {cart.reduce((s,l)=>s+l.qty,0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full grid place-items-center text-[9px] font-black bg-white" style={{ color: "#E63027" }}>
                {cart.reduce((s,l)=>s+l.qty,0)}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">السلة</span>
        </button>
      </nav>

      {/* Floating cart bar */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-20 md:bottom-4 inset-x-4 md:inset-x-auto md:left-4 md:right-[104px] md:max-w-md rounded-2xl py-3 sm:py-4 px-5 flex items-center justify-between font-bold z-30 text-white animate-in fade-in slide-in-from-bottom-4"
          style={{ background: "#E63027", boxShadow: "0 18px 40px -10px rgba(230,48,39,0.55)" }}>
          <span className="flex items-center gap-3">
            <span className="relative">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full grid place-items-center text-[10px] font-black"
                style={{ background: "#fff", color: "#E63027" }}>
                {cart.reduce((s, l) => s + l.qty, 0)}
              </span>
            </span>
            عرض الطلب
          </span>
          <span className="text-lg">₪{total.toFixed(2)}</span>
        </button>
      )}

      {/* Cart sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(31,44,124,0.35)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowCart(false)}>
          <div className="w-full rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto bg-white"
            style={{ color: "#1F2C7C" }}
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="mx-auto w-12 h-1 rounded-full mb-4" style={{ background: "#E5E7EE" }} />
            <h2 className="text-xl font-black mb-4" style={{ color: "#1F2C7C" }}>طلبك</h2>
            <div className="space-y-3">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "#F8F9FB", border: "1px solid #ECEEF3" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "#1F2C7C" }}>{l.name}</p>
                    {l.modifiers.length > 0 && (
                      <p className="text-[11px] truncate" style={{ color: "#7C8499" }}>{l.modifiers.map(m => m.name).join(" • ")}</p>
                    )}
                    {l.note && <p className="text-[11px]" style={{ color: "#9AA1B4" }}>📝 {l.note}</p>}
                    <p className="text-xs mt-1 font-bold" style={{ color: "#E63027" }}>₪{l.unit_price.toFixed(2)} × {l.qty}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i, -1)}
                      className="h-8 w-8 rounded-full grid place-items-center"
                      style={{ background: "#F1F2F8", color: "#1F2C7C" }}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button onClick={() => changeQty(i, 1)}
                      className="h-8 w-8 rounded-full grid place-items-center text-white"
                      style={{ background: "#E63027" }}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              <Input placeholder="اسمك (اختياري)" value={name} onChange={e => setName(e.target.value)}
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
              <Input placeholder={ctx.require_phone ? "رقم جوالك *" : "رقم جوالك (اختياري)"} value={phone}
                onChange={e => setPhone(e.target.value)} inputMode="tel"
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
              <Textarea placeholder="ملاحظات للمطبخ (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
            </div>
            <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: "1px dashed #E5E7EE" }}>
              <span className="text-sm" style={{ color: "#7C8499" }}>الإجمالي</span>
              <span className="text-2xl font-black" style={{ color: "#E63027" }}>₪{total.toFixed(2)}</span>
            </div>
            <button onClick={submit} disabled={submitting}
              className="w-full mt-4 py-4 rounded-2xl font-black text-base text-white disabled:opacity-50"
              style={{ background: "#E63027", boxShadow: "0 12px 30px -10px rgba(230,48,39,0.5)" }}>
              {submitting ? "جارٍ الإرسال…" : "تأكيد الطلب"}
            </button>
          </div>
        </div>
      )}

      {/* Product detail sheet with modifiers */}
      {detail && (
        <ProductDetailSheet
          product={detail}
          onClose={() => setDetail(null)}
          onAdd={addLineFromDetail}
        />
      )}
    </div>
  );
}

function ProductDetailSheet({
  product, onClose, onAdd,
}: { product: Product; onClose: () => void; onAdd: (line: CartLine) => void }) {
  // selections: groupId -> Set of optionId
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of product.modifier_groups) {
      const defaults = g.options.filter(o => o.is_default).map(o => o.id);
      // For single-select, take first default; else all defaults
      const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
      init[g.id] = new Set(isSingle ? defaults.slice(0, 1) : defaults);
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const toggle = (g: ModifierGroup, optId: string) => {
    setSelections(prev => {
      const cur = new Set(prev[g.id] || []);
      const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
      if (isSingle) {
        cur.clear(); cur.add(optId);
      } else {
        if (cur.has(optId)) cur.delete(optId);
        else {
          if (g.max_select && cur.size >= g.max_select) {
            toast.error(`أقصى ${g.max_select} اختيارات لـ ${g.name}`);
            return prev;
          }
          cur.add(optId);
        }
      }
      return { ...prev, [g.id]: cur };
    });
  };

  const selectedFlat = product.modifier_groups.flatMap(g =>
    Array.from(selections[g.id] || []).map(optId => {
      const opt = g.options.find(o => o.id === optId)!;
      return { group_id: g.id, group_name: g.name, option_id: optId, name: opt.name, extra_price: Number(opt.extra_price) || 0 };
    })
  );
  const addonsTotal = selectedFlat.reduce((s, m) => s + m.extra_price, 0);
  const unitPrice = (Number(product.price) || 0) + addonsTotal;

  const validate = (): string | null => {
    for (const g of product.modifier_groups) {
      const n = (selections[g.id] || new Set()).size;
      if (g.is_required && n === 0) return `يرجى اختيار: ${g.name}`;
      if (g.min_select && n < g.min_select) return `${g.name}: اختر ${g.min_select} على الأقل`;
    }
    return null;
  };

  const handleAdd = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    onAdd({
      product_id: product.id,
      name: product.name,
      base_price: Number(product.price) || 0,
      unit_price: unitPrice,
      qty,
      note,
      modifiers: selectedFlat,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" dir="rtl"
      style={{ background: "rgba(31,44,124,0.35)", backdropFilter: "blur(6px)" }}
      onClick={onClose}>
      <div className="w-full rounded-t-3xl max-h-[92vh] overflow-y-auto bg-white"
        style={{ color: "#1F2C7C" }}
        onClick={e => e.stopPropagation()}>
        <div className="relative">
          <img src={product.image_url || pickFoodImage(product.name)} alt={product.name}
            className="w-full h-56 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_FOOD_IMG; }} />
          <button onClick={onClose}
            className="absolute top-3 left-3 h-9 w-9 rounded-full grid place-items-center text-white"
            style={{ background: "rgba(31,44,124,0.7)", backdropFilter: "blur(8px)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <h2 className="text-2xl font-black" style={{ color: "#1F2C7C" }}>{product.name}</h2>
            {product.description && <p className="text-sm mt-1 leading-relaxed" style={{ color: "#5B6478" }}>{product.description}</p>}
            <p className="text-lg font-black mt-2" style={{ color: "#E63027" }}>₪{Number(product.price).toFixed(2)}</p>
          </div>

          {product.modifier_groups.map(g => {
            const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
            return (
              <div key={g.id} className="rounded-2xl p-4"
                style={{ background: "#F8F9FB", border: "1px solid #ECEEF3" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-sm" style={{ color: "#1F2C7C" }}>
                    {g.name}
                    {g.is_required && <span className="mr-1" style={{ color: "#E63027" }}>*</span>}
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "#fff", color: "#1F2C7C", border: "1px solid #ECEEF3" }}>
                    {isSingle ? "اختر واحد" : g.max_select ? `حتى ${g.max_select}` : "اختياري"}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.options.map(o => {
                    const checked = (selections[g.id] || new Set()).has(o.id);
                    return (
                      <button type="button" key={o.id} onClick={() => toggle(g, o.id)}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-all"
                        style={checked
                          ? { background: "#fff", border: "1.5px solid #E63027", color: "#1F2C7C" }
                          : { background: "#fff", border: "1.5px solid #ECEEF3", color: "#1F2C7C" }}>
                        <span className="flex items-center gap-3">
                          <span className="h-5 w-5 rounded-full grid place-items-center"
                            style={{ border: `2px solid ${checked ? "#E63027" : "#D5D9E2"}` }}>
                            {checked && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E63027" }} />}
                          </span>
                          <span className="font-medium">{o.name}</span>
                        </span>
                        {Number(o.extra_price) > 0 && (
                          <span className="text-xs font-bold" style={{ color: "#E63027" }}>+₪{Number(o.extra_price).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <p className="text-sm font-bold mb-2" style={{ color: "#1F2C7C" }}>ملاحظات (اختياري)</p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="بدون بصل، حار، الخ"
              style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
          </div>

          <div className="flex items-center gap-3 pt-3" style={{ borderTop: "1px dashed #E5E7EE" }}>
            <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: "#F1F2F8" }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full grid place-items-center"
                style={{ background: "#fff", color: "#1F2C7C" }}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-black text-lg" style={{ color: "#1F2C7C" }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="h-9 w-9 rounded-full grid place-items-center text-white"
                style={{ background: "#E63027" }}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button onClick={handleAdd}
              className="flex-1 py-3.5 rounded-2xl font-black text-white"
              style={{ background: "#E63027", boxShadow: "0 12px 30px -10px rgba(230,48,39,0.5)" }}>
              إضافة — ₪{(unitPrice * qty).toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}