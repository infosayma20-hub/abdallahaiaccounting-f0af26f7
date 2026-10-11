import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag, Package, Building2, UtensilsCrossed, CalendarCheck, Copy, Check, MessageCircle,
  ShoppingCart, Bell, ClipboardList, Boxes, Calculator, AlertTriangle, RotateCw, ExternalLink, Instagram,
  Shirt, Sofa, Sparkles, Cake, Headphones, Store,
} from "lucide-react";
import logo from "@/assets/unify-mark-white.webp";
import qamarShot from "@/assets/qamar-brand-shot.webp";
import "./websites.css";

/* ===== ثوابت الحملة ===== */
const WA_NUMBER = "972594336699";
const COUPON = "UNIFY500";
const OLD_PRICE = 800;
const NEW_PRICE = 500;
/** تاريخ انتهاء العرض بصيغة ISO مثل "2026-10-31T23:59:00+03:00" — فارغ = لا يظهر العدّاد */
const OFFER_END_DATE = "";
/** معرّف Meta Pixel — فارغ = لا يُحمَّل */
const META_PIXEL_ID = "";

type Lang = "ar" | "en";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const num = (n: number | string, lang: Lang) =>
  lang === "ar" ? String(n).replace(/\d/g, (d) => AR_DIGITS[+d]) : String(n);

/* ===== مصدر الزيارة ===== */
function getRef(): string {
  try {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) sessionStorage.setItem("wl-ref", r.slice(0, 60));
    return sessionStorage.getItem("wl-ref") || "";
  } catch {
    return "";
  }
}

/* ===== منطق الواتساب ===== */
type WaContext =
  | { kind: "default" }
  | { kind: "design"; type: string; name: string; color: string }
  | { kind: "type"; site: string };

export function buildWhatsAppLink(ctx: WaContext, ref = getRef()): string {
  let msg: string;
  if (ctx.kind === "design") {
    msg = `مرحبا، شفت إعلان يونيفاي وصممت متجري:\nنوع المتجر: ${ctx.type}\nاسم المحل: ${ctx.name}\nاللون: ${ctx.color}\nكود الخصم: ${COUPON}`;
  } else if (ctx.kind === "type") {
    msg = `مرحبا، شفت إعلان يونيفاي وبدي ${ctx.site}.\nكود الخصم: ${COUPON}`;
  } else {
    msg = `مرحبا، شفت إعلان يونيفاي وبدي موقع إلكتروني.\nكود الخصم: ${COUPON}`;
  }
  if (ref) msg += `\nالمصدر: ${ref}`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function trackContact(button: string) {
  try {
    (window as any).fbq?.("track", "Contact", { button });
  } catch { /* ignore */ }
}

/* ===== نصوص ===== */
const STORE_TYPES = [
  { id: "clothes", icon: Shirt, ar: "ملابس", en: "Clothing",
    items: { ar: [["فستان سهرة", 180], ["قميص قطن", 85], ["جاكيت جينز", 150], ["شنطة يد", 120]], en: [["Evening dress", 180], ["Cotton shirt", 85], ["Denim jacket", 150], ["Handbag", 120]] } },
  { id: "furniture", icon: Sofa, ar: "أثاث وديكور", en: "Furniture & decor",
    items: { ar: [["طاولة وسط خشب", 320], ["مراية دائرية", 210], ["كرسي مخمل", 450], ["إضاءة أرضية", 175]], en: [["Wooden coffee table", 320], ["Round mirror", 210], ["Velvet chair", 450], ["Floor lamp", 175]] } },
  { id: "beauty", icon: Sparkles, ar: "تجميل وعطور", en: "Beauty & perfume",
    items: { ar: [["عطر عود", 240], ["سيروم فيتامين C", 95], ["أحمر شفاه", 55], ["كريم ترطيب", 70]], en: [["Oud perfume", 240], ["Vitamin C serum", 95], ["Lipstick", 55], ["Moisturizer", 70]] } },
  { id: "food", icon: Cake, ar: "أكل وحلويات", en: "Food & sweets",
    items: { ar: [["كنافة نابلسية", 45], ["علبة معمول", 60], ["كيك شوكولا", 90], ["بقلاوة مشكلة", 75]], en: [["Nabulsi knafeh", 45], ["Maamoul box", 60], ["Chocolate cake", 90], ["Mixed baklava", 75]] } },
  { id: "tech", icon: Headphones, ar: "إلكترونيات وإكسسوارات", en: "Electronics & accessories",
    items: { ar: [["سماعة لاسلكية", 160], ["شاحن سريع", 65], ["ساعة ذكية", 280], ["كفر جوال", 35]], en: [["Wireless earbuds", 160], ["Fast charger", 65], ["Smartwatch", 280], ["Phone case", 35]] } },
  { id: "other", icon: Store, ar: "إشي ثاني", en: "Something else",
    items: { ar: [["منتج مميز", 120], ["الأكثر طلبًا", 90], ["وصل حديثًا", 150], ["عرض خاص", 60]], en: [["Featured item", 120], ["Best seller", 90], ["New arrival", 150], ["Special offer", 60]] } },
] as const;

const COLORS = [
  { id: "navy", hex: "#0D1B2E", ar: "كحلي", en: "Navy" },
  { id: "sky", hex: "#0284c7", ar: "أزرق", en: "Blue" },
  { id: "green", hex: "#15803d", ar: "أخضر", en: "Green" },
  { id: "rose", hex: "#be185d", ar: "زهري", en: "Pink" },
  { id: "terra", hex: "#c2410c", ar: "برتقالي", en: "Orange" },
  { id: "black", hex: "#1f2937", ar: "أسود", en: "Black" },
];

const SITE_TYPES = [
  { icon: ShoppingBag, ar: ["متاجر إلكترونية", "بيع أونلاين مع سلة ولوحة تحكم"], en: ["Online stores", "Sell online with a cart and a dashboard"], wa: "متجر إلكتروني" },
  { icon: Package, ar: ["مواقع منتجات", "اعرض منتجاتك واستقبل الطلبات على الواتساب"], en: ["Product sites", "Show your products and get orders on WhatsApp"], wa: "موقع منتجات" },
  { icon: Building2, ar: ["مواقع شركات", "هوية شركتك وخدماتها بشكل احترافي"], en: ["Company sites", "Your brand and services, professionally"], wa: "موقع شركة" },
  { icon: UtensilsCrossed, ar: ["منيو مطاعم", "منيو رقمي بـ QR بتعدّل عليه بأي وقت"], en: ["Restaurant menus", "A QR digital menu you can edit anytime"], wa: "منيو مطعم" },
  { icon: CalendarCheck, ar: ["مواقع حجوزات", "عيادات، صالونات، ملاعب، قاعات"], en: ["Booking sites", "Clinics, salons, courts, halls"], wa: "موقع حجوزات" },
];

const T = {
  ar: {
    lang: "English",
    eyebrow: "عرض خاص لمتابعين الصفحة",
    h1: "متجرك الإلكتروني… جاهز يبيع عنك",
    sub: "متجر كامل بواجهة للزباين ولوحة تحكم إلك: طلبيات، مخزون، وحسابات. كله بمكان واحد.",
    withCoupon: "مع كوبون الخصم",
    copy: "انسخ الكوبون", copied: "تم النسخ",
    cta: `احجز موقعك بـ ${num(NEW_PRICE, "ar")}$ على الواتساب`,
    sticky: `احجز بـ ${num(NEW_PRICE, "ar")}$`,
    toast: `طلبية جديدة ${num(320, "ar")} ₪`, cats: ["الكل", "جديد", "عروض", "الأكثر مبيعًا"], cart: "السلة",
    tryTitle: "جرّب بنفسك: كيف رح يطلع متجرك؟",
    s1: "شو بتبيع؟", s2: "شو اسم محلك؟", s3: "اختار لون متجرك", namePh: "متجري", defName: "متجري",
    sendDesign: "ابعتلي هالتصميم على الواتساب",
    insideTitle: "من برّا متجر… ومن جوّا نظام كامل", seeInside: "شوف من جوّا", seeOutside: "شوف من برّا",
    dash: "لوحة التحكم", sales: "المبيعات", exp: "المصاريف", profit: "صافي الربح",
    statuses: [["جديدة", "#8C7F70"], ["قيد التجهيز", "#a8693f"], ["تم الشحن", "#6b5a4b"], ["تم التسليم", "#4f7a5a"], ["مرتجعة", "#b0503a"]],
    stockShort: `باقي ${num(3, "ar")} قطع`, newOrder: "طلبية جديدة",
    ribbonTitle: "متجرك بيرتّب منتجاتك لحاله", ribbonText: "أقسام، بحث، فلاتر، وصفحة لكل منتج. بتضيف المنتج مرة وحدة وهو بيترتب بمكانه.",
    bothDevices: "ونفس المتجر بيشتغل على الجوال والكمبيوتر.", layers: ["واجهة المتجر", "الطلبيات", "المخزون", "الحسابات"],
    pkgNote: `هاد كله داخل باقة الـ ${num(NEW_PRICE, "ar")}$.`, want: "بدي هاد", searchPh: "ابحث عن منتج",
    stock: `باقي ${num(3, "ar")} قطع من طاولة وسط خشب`,
    cards: [["الطلبيات", "كل طلبية بحالتها وتفاصيلها، من لحظة الطلب للتسليم."], ["المخزون", "بتعرف شو باقي عندك وشو لازم تطلب، بدون جرد يدوي."], ["الحسابات", "مبيعاتك ومصاريفك وربحك قدامك أول بأول."]],
    inclNote: `هاد كله داخل باقة الـ ${num(NEW_PRICE, "ar")}$. هاد الحد الأدنى للمتجر عنا، والزيادات حسب طلبك.`,
    liveTitle: "متجر شغّال هلّأ",
    liveText: `قمر براند — أثاث خشبي ومرايا وديكور. ${num(23, "ar")} قسم، منتجات بتنضاف كل أسبوع، وطلبيات بتوصل مباشرة على لوحة التحكم.`,
    visit: "زور المتجر", insta: "صفحتهم على إنستغرام",
    typesTitle: "قلّي شو بدك… وأنا بعطيك",
    howTitle: "كيف بنشتغل",
    how: ["بتبعتلنا على الواتساب", "بنتفق على التفاصيل والمحتوى", "بنبني موقعك وبتشوفه قبل التسليم", "بتستلم موقعك ولوحة التحكم وبتبلّش تبيع"],
    finalTitle: "جاهز يكون إلك متجر؟",
    ends: "العرض بينتهي خلال", d: "يوم", h: "ساعة", m: "دقيقة", s: "ثانية",
    foot: "يونيفاي — UNIFY",
    title: `مواقع يونيفاي — متجرك بـ ${num(NEW_PRICE, "ar")}$`,
    desc: `متجر إلكتروني كامل مع لوحة تحكم للطلبيات والمخزون والحسابات. بدل ${num(OLD_PRICE, "ar")}$ صار ${num(NEW_PRICE, "ar")}$ مع الكوبون.`,
  },
  en: {
    lang: "عربي",
    eyebrow: "A special offer for our followers",
    h1: "Your online store… ready to sell for you",
    sub: "A complete store with a customer storefront and your own dashboard: orders, stock, and accounts. All in one place.",
    withCoupon: "with the discount coupon",
    copy: "Copy coupon", copied: "Copied",
    cta: `Book your site for $${NEW_PRICE} on WhatsApp`,
    sticky: `Book for $${NEW_PRICE}`,
    toast: "New order ₪320", cats: ["All", "New", "Offers", "Best sellers"], cart: "Cart",
    tryTitle: "Try it: what will your store look like?",
    s1: "What do you sell?", s2: "What's your shop name?", s3: "Pick your store color", namePh: "My Store", defName: "My Store",
    sendDesign: "Send me this design on WhatsApp",
    insideTitle: "A store outside… a full system inside", seeInside: "See inside", seeOutside: "See outside",
    dash: "Dashboard", sales: "Sales", exp: "Expenses", profit: "Net profit",
    statuses: [["New", "#8C7F70"], ["Preparing", "#a8693f"], ["Shipped", "#6b5a4b"], ["Delivered", "#4f7a5a"], ["Returned", "#b0503a"]],
    stockShort: "Only 3 left", newOrder: "New order",
    ribbonTitle: "Your store organizes your products by itself", ribbonText: "Categories, search, filters, and a page for every product. Add a product once and it falls into place.",
    bothDevices: "And the same store works on phone and desktop.", layers: ["Storefront", "Orders", "Stock", "Accounts"],
    pkgNote: `All of this is in the $${NEW_PRICE} package.`, want: "I want this", searchPh: "Search products",
    stock: "Only 3 left of Wooden coffee table",
    cards: [["Orders", "Every order with its status and details, from order to delivery."], ["Stock", "Know what's left and what to reorder, no manual counting."], ["Accounts", "Your sales, expenses and profit, always up to date."]],
    inclNote: `All of this is in the $${NEW_PRICE} package. That's our minimum store; extras as you need.`,
    liveTitle: "A store that's live now",
    liveText: "Qamar Brand — wooden furniture, mirrors and decor. 23 categories, new products every week, and orders arriving straight to the dashboard.",
    visit: "Visit the store", insta: "Their Instagram",
    typesTitle: "Tell me what you want… and I'll build it",
    howTitle: "How we work",
    how: ["You message us on WhatsApp", "We agree on details and content", "We build your site and you review it before delivery", "You receive your site and dashboard and start selling"],
    finalTitle: "Ready to own a store?",
    ends: "Offer ends in", d: "days", h: "hours", m: "min", s: "sec",
    foot: "UNIFY",
    title: `UNIFY Websites — your store for $${NEW_PRICE}`,
    desc: `A complete online store with a dashboard for orders, stock and accounts. Was $${OLD_PRICE}, now $${NEW_PRICE} with the coupon.`,
  },
};

/* ===== أدوات ===== */
function useMeta(lang: Lang) {
  useEffect(() => {
    const t = T[lang];
    document.title = t.title;
    const set = (sel: string, attr: string, key: string, val: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(sel);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = val;
    };
    set('meta[name="description"]', "name", "description", t.desc);
    set('meta[property="og:title"]', "property", "og:title", t.title);
    set('meta[property="og:description"]', "property", "og:description", t.desc);
    set('meta[property="og:url"]', "property", "og:url", "https://unifyerp.app/websites");
    set('meta[property="og:image"]', "property", "og:image", "https://unifyerp.app/websites/og.jpg");
    set('meta[property="og:image:width"]', "property", "og:image:width", "1200");
    set('meta[property="og:image:height"]', "property", "og:image:height", "630");
    set('meta[name="twitter:image"]', "name", "twitter:image", "https://unifyerp.app/websites/og.jpg");
    document.documentElement.lang = lang;
  }, [lang]);
}

function usePixel() {
  useEffect(() => {
    if (!META_PIXEL_ID || (window as any).fbq) return;
    const w = window as any;
    const n: any = (w.fbq = function (...a: any[]) { n.callMethod ? n.callMethod(...a) : n.queue.push(a); });
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const s = document.createElement("script");
    s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    w.fbq("init", META_PIXEL_ID);
    w.fbq("track", "PageView");
  }, []);
}

function CouponBox({ lang }: { lang: Lang }) {
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON);
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch {
      const el = ref.current; if (!el) return;
      const r = document.createRange(); r.selectNodeContents(el);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
    }
  };
  return (
    <div className="wl-coupon">
      <code ref={ref}>{COUPON}</code>
      <button type="button" className="wl-btn2" onClick={copy}>
        {done ? <Check size={16} /> : <Copy size={16} />}{done ? T[lang].copied : T[lang].copy}
      </button>
    </div>
  );
}

function Price({ lang }: { lang: Lang }) {
  const f = (n: number) => (lang === "ar" ? `${num(n, "ar")}$` : `$${n}`);
  return (
    <div className="wl-price">
      <span className="wl-old">{f(OLD_PRICE)}</span>
      <span className="wl-new">{f(NEW_PRICE)}</span>
      <small>{T[lang].withCoupon}</small>
    </div>
  );
}

function WaButton({ ctx, label, name }: { ctx: WaContext; label: string; name: string }) {
  return (
    <a className="wl-cta" href={buildWhatsAppLink(ctx)} onClick={() => trackContact(name)}>
      <MessageCircle size={18} className="wl-wa-ic" />{label}
    </a>
  );
}


/* ===== مسرح الجوال والعناصر الطايرة ===== */
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** مجلد صور كل نوع متجر — null = أيقونة فقط */
const IMG_DIR: Record<string, string | null> = { clothes: "fashion", furniture: "furniture", beauty: "beauty", food: "food", tech: "electronics", other: null };

function ProdImg({ typeId, i, Icon, size = 30 }: { typeId: string; i: number; Icon: any; size?: number }) {
  const [bad, setBad] = useState(false);
  const dir = IMG_DIR[typeId];
  if (!dir || bad) return <div className="wl-glass wl-ph"><Icon size={size} /></div>;
  return <img className="wl-cut" src={`/websites/products/${dir}/${i + 1}.webp`} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />;
}

/** أقواس ضوئية خفيفة تدور حول الجوال — تتوقف خارج الشاشة */
function LightArcs() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || reducedMotion()) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0, visible = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => { c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; };
    resize(); window.addEventListener("resize", resize);
    const arcs = [{ rx: .42, ry: .16, tilt: -.35, sp: .00018 }, { rx: .36, ry: .22, tilt: .5, sp: -.00013 }, { rx: .47, ry: .12, tilt: .12, sp: .0001 }];
    const tick = (now: number) => {
      const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
      arcs.forEach((a, k) => {
        const rot = now * a.sp + k * 2;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a.tilt);
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.2 * dpr;
        ctx.shadowColor = "rgba(140,127,112,.25)"; ctx.shadowBlur = 4 * dpr;
        ctx.beginPath(); ctx.ellipse(0, 0, a.rx * W, a.ry * H, 0, rot, rot + 2.2); ctx.stroke();
        const x = Math.cos(rot + 2.2) * a.rx * W, y = Math.sin(rot + 2.2) * a.ry * H;
        ctx.fillStyle = "#fff"; ctx.shadowBlur = 10 * dpr; ctx.shadowColor = "rgba(255,255,255,1)";
        ctx.beginPath(); ctx.arc(x, y, 2.2 * dpr, 0, 6.3); ctx.fill();
        ctx.restore();
      });
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(tick); });
    io.observe(c);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="wl-arcs" aria-hidden />;
}

/** parallax + ميلان الجوال: ماوس على الكمبيوتر، تمرير على الجوال */
function useStageMotion(ref: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = ref.current; if (!el || reducedMotion()) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let raf = 0, visible = false;
    const apply = () => {
      raf = 0; const r = el.getBoundingClientRect();
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight; // -1..1
      el.style.setProperty("--py", (p * 60).toFixed(1));
      if (!fine) { el.style.setProperty("--ty", (p * -6).toFixed(2)); el.style.setProperty("--tx", (p * 4).toFixed(2)); }
    };
    const onScroll = () => { if (visible && !raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      if (!visible) return; const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.setProperty("--ty", (x * 12).toFixed(2)); el.style.setProperty("--tx", (y * -12).toFixed(2));
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; el.classList.toggle("live", visible); if (visible) apply(); });
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); };
  }, [ref]);
}

type Fly = { l: "back" | "mid" | "front"; x: number; y: number; kind: "thumb" | "cut" | "order" | "price" | "stock"; i?: number; f: number };
const FLY: Fly[] = [
  { l: "back", kind: "thumb", i: 1, x: -205, y: -185, f: 5.2 },
  { l: "back", kind: "thumb", i: 2, x: 200, y: -205, f: 4.6 },
  { l: "back", kind: "thumb", i: 3, x: -195, y: 205, f: 5.8 },
  { l: "mid", kind: "cut", i: 0, x: 190, y: -40, f: 4.2 },
  { l: "mid", kind: "cut", i: 1, x: -210, y: 30, f: 3.6 },
  { l: "mid", kind: "cut", i: 2, x: 175, y: 190, f: 4.8 },
  { l: "front", kind: "order", x: 125, y: -240, f: 3.4 },
  { l: "front", kind: "price", x: -170, y: -95, f: 4.4 },
  { l: "front", kind: "stock", x: -140, y: 150, f: 3.9 },
];

function Stage({ lang, typeIdx, screen, intro, only }: { lang: Lang; typeIdx: number; screen: React.ReactNode; intro?: boolean; only?: Fly["l"][] }) {
  const ref = useRef<HTMLDivElement>(null);
  useStageMotion(ref);
  const [shown, setShown] = useState(typeIdx);
  const [phase, setPhase] = useState<"in" | "out">(intro && !reducedMotion() ? "in" : "out");
  useEffect(() => { if (phase === "in" && intro) { const id = setTimeout(() => setPhase("out"), 1150); return () => clearTimeout(id); } }, []); // eslint-disable-line
  useEffect(() => {
    if (typeIdx === shown) return;
    if (reducedMotion()) { setShown(typeIdx); return; }
    setPhase("in");
    const id = setTimeout(() => { setShown(typeIdx); requestAnimationFrame(() => requestAnimationFrame(() => setPhase("out"))); }, 380);
    return () => clearTimeout(id);
  }, [typeIdx]); // eslint-disable-line
  const ty = STORE_TYPES[shown];
  const Icon = ty.icon;
  const items = ty.items[lang];
  const t = T[lang];
  const fly = FLY.filter((f) => !only || only.includes(f.l));
  const node = (f: Fly) => {
    if (f.kind === "thumb") return <div className="wl-glass wl-thumb"><ProdImg key={ty.id} typeId={ty.id} i={f.i!} Icon={Icon} size={18} /></div>;
    if (f.kind === "cut") return <div className="wl-cutbox"><ProdImg key={ty.id} typeId={ty.id} i={f.i!} Icon={Icon} /></div>;
    if (f.kind === "order") return <div className="wl-glass wl-card-s"><Bell size={14} /><span>{t.newOrder}</span><b>{num(320, lang)} ₪</b></div>;
    if (f.kind === "price") return <div className="wl-glass wl-card-s col"><span>{items[0][0]}</span><b>{num(items[0][1] as number, lang)} ₪</b></div>;
    return <div className="wl-glass wl-card-s"><Boxes size={14} /><span>{t.stockShort}</span></div>;
  };
  return (
    <div className={`wl-stage ${intro ? "intro" : ""}`} data-phase={phase} ref={ref}>
      <div className="wl-glow" aria-hidden />
      <LightArcs />
      {(["back", "mid", "front"] as const).map((layer) => (
        <div key={layer} className={`wl-layer ${layer}`} aria-hidden>
          {fly.filter((f) => f.l === layer).map((f, k) => (
            <div key={k} className="wl-fi" style={{ "--x": f.x, "--y": f.y, "--d": `${FLY.indexOf(f) * 80}ms` } as React.CSSProperties}>
              <div className="wl-fl" style={{ animationDuration: `${f.f}s`, animationDelay: `-${(FLY.indexOf(f) * 0.7).toFixed(1)}s` }}>{node(f)}</div>
            </div>
          ))}
        </div>
      ))}
      <div className="wl-rise">
        <div className="wl-shadow" aria-hidden />
        <div className="wl-tilt"><div className="wl-phone"><i className="wl-island" />{screen}</div></div>
      </div>
    </div>
  );
}

const TINTS = ["#efe7dc", "#f2e8e2", "#e9eae0", "#f1eadb"];

function StoreScreen({ lang, typeIdx, name, color }: { lang: Lang; typeIdx: number; name: string; color: string }) {
  const t = STORE_TYPES[typeIdx];
  const Icon = t.icon;
  return (
    <div className="wl-screen">
      <div className="wl-s-head" style={{ background: color }}>{name}</div>
      <div className="wl-s-cats">{T[lang].cats.map((c, i) => <span key={c} style={i === 0 ? { background: color, color: "#fff" } : undefined}>{c}</span>)}</div>
      <div className="wl-s-grid">
        {t.items[lang].map(([n, p], i) => (
          <div className="wl-p" key={n as string}>
            <div className="wl-p-img" style={{ background: TINTS[i] }}><Icon size={26} color={color} /></div>
            <b>{n}</b><i>{num(p as number, lang)} ₪</i>
          </div>
        ))}
      </div>
      <div className="wl-s-cart" style={{ background: color }}><ShoppingCart size={13} style={{ verticalAlign: "-2px" }} /> {T[lang].cart}</div>
    </div>
  );
}

function CountUp({ to, lang, run }: { to: number; lang: Lang; run: boolean }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!run || reducedMotion()) { setV(to); return; }
    let raf = 0; const start = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - start) / 1200); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <>{num(v.toLocaleString("en-US"), lang)}</>;
}

function Countdown({ lang }: { lang: Lang }) {
  const end = useMemo(() => (OFFER_END_DATE ? new Date(OFFER_END_DATE).getTime() : NaN), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (isNaN(end)) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [end]);
  if (isNaN(end)) return null;
  const left = Math.max(0, end - now);
  if (left === 0) return null;
  const t = T[lang];
  const parts: [number, string][] = [[Math.floor(left / 864e5), t.d], [Math.floor(left / 36e5) % 24, t.h], [Math.floor(left / 6e4) % 60, t.m], [Math.floor(left / 1e3) % 60, t.s]];
  return (
    <div style={{ marginTop: 20 }}>
      <p className="wl-mut">{t.ends}</p>
      <div className="wl-count">{parts.map(([n, l]) => <div key={l} className="wl-glass"><b>{num(String(n).padStart(2, "0"), lang)}</b><small>{l}</small></div>)}</div>
    </div>
  );
}

