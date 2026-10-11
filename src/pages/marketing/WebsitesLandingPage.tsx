import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

/* ===== محرّك المشاهد (تثبيت + scrub) ===== */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const isMobileW = () => typeof window !== "undefined" && window.innerWidth < 760;

/** يحسب نسبة التمرير داخل القسم (0..1) ويستدعي cb عبر rAF فقط قرب الشاشة */
function useScrub(ref: React.RefObject<HTMLElement>, cb: (p: number) => void) {
  const cbRef = useRef(cb); cbRef.current = cb;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reducedMotion()) { cbRef.current(1); return; }
    let raf = 0;
    const run = () => {
      raf = 0; const r = el.getBoundingClientRect(); const vh = window.innerHeight;
      if (r.bottom < -vh || r.top > 2 * vh) return;
      const d = r.height - vh;
      const p = d > 60 ? -r.top / d : (vh - r.top) / (r.height + vh);
      cbRef.current(clamp(p));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [ref]);
}

function Scene({ alt, loose, className = "", onP, children, sref }: { alt?: boolean; loose?: boolean; className?: string; onP?: (p: number) => void; children: React.ReactNode; sref?: React.RefObject<HTMLElement> }) {
  const own = useRef<HTMLElement>(null);
  const ref = sref || own;
  const pin = useRef<HTMLDivElement>(null);
  useScrub(ref, (p) => {
    const pe = pin.current;
    if (pe && !reducedMotion()) { const o = clamp((p - .9) / .1); pe.style.opacity = String(1 - o * .45); pe.style.transform = o ? `scale(${1 - o * .05})` : ""; }
    onP?.(p);
  });
  return <section ref={ref as any} className={`wl-scene ${alt ? "alt" : ""} ${loose ? "loose" : ""} ${className}`}><div ref={pin} className="wl-pin">{children}</div></section>;
}

const RIBBON_ITEMS = STORE_TYPES.slice(0, 5).flatMap((s) => [0, 1, 2, 3].map((j) => ({ s, j })));
const lerpHex = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
const SAND = [236, 228, 216], COFFEE = [92, 70, 52];

/* المشهد ١ — شريط المنتجات */
function RibbonScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [n, setN] = useState(48);
  useEffect(() => { setN(isMobileW() ? 24 : 48); }, []);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const txt = useRef<HTMLParagraphElement>(null);
  const onP = (p: number) => {
    const st = stage.current; if (!st) return;
    const W = st.clientWidth, mobile = W < 700;
    const cols = mobile ? 2 : 4, gw = mobile ? 150 : 170, gh = mobile ? 96 : 140, gap = 10, shown = 8;
    const rows = Math.ceil(shown / cols);
    const gridW = cols * gw + (cols - 1) * gap, gridH = rows * gh + (rows - 1) * gap;
    const wave = clamp(p / .45), m = ease(clamp((p - .38) / .4));
    const sp = mobile ? 17 : 22;
    const rtl = lang === "ar" ? -1 : 1;
    cards.current.forEach((c, i) => {
      if (!c) return;
      const ph = wave * Math.PI * 2 + i * .38;
      const wx = (i - (n - 1) / 2) * sp - (wave - .5) * 80, wy = Math.sin(ph) * 34, wz = Math.cos(ph) * 50, wr = Math.sin(ph) * 55;
      let x = wx, y = wy, z = wz, r = wr, sx = .16, sy = 1.15, o = 1;
      if (i < shown) {
        const col = i % cols, row = Math.floor(i / cols);
        const gx = rtl * (-gridW / 2 + col * (gw + gap) + gw / 2), gy = -gridH / 2 + row * (gh + gap) + gh / 2;
        x = wx + (gx - wx) * m; y = wy + (gy - wy) * m; z = wz * (1 - m); r = wr * (1 - m); sx = .16 + .84 * m; sy = 1.15 - .15 * m;
      } else { y = wy + 380 * m; o = 1 - m; }
      c.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${r.toFixed(1)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
      c.style.opacity = o.toFixed(2);
      c.style.setProperty("--m", m.toFixed(2));
      c.style.width = `${gw}px`; c.style.height = `${gh}px`; c.style.marginLeft = `${-gw / 2}px`; c.style.marginTop = `${-gh / 2}px`;
    });
    if (txt.current) { const k = clamp((p - .78) / .14); txt.current.style.opacity = String(k); txt.current.style.transform = `translateY(${(1 - k) * 14}px)`; }
  };
  return (
    <Scene onP={onP}>
      <h2 className="wl-scene-h">{t.ribbonTitle}</h2>
      <div className="wl-ribbon" ref={stage} aria-hidden>
        {Array.from({ length: n }, (_, i) => {
          const it = RIBBON_ITEMS[i % RIBBON_ITEMS.length]; const [nm, pr] = it.s.items[lang][it.j]; const I = it.s.icon;
          return (
            <div key={i} className="wl-rc" ref={(el) => (cards.current[i] = el)}>
              <div className="wl-rc-strip" style={{ background: `linear-gradient(180deg,${lerpHex(SAND, COFFEE, i / n)},${lerpHex(SAND, COFFEE, Math.min(1, i / n + .15))})` }} />
              <div className="wl-rc-prod"><div className="wl-rc-img"><I size={22} /></div><b>{nm}</b><i>{num(pr as number, lang)} ₪</i></div>
            </div>
          );
        })}
      </div>
      <p className="wl-scene-p" ref={txt}>{t.ribbonText}</p>
    </Scene>
  );
}

/* المشهد ٢ — صمّم متجرك على نافذة متصفح */
function BrowserStore({ lang, typeIdx, name, color }: { lang: Lang; typeIdx: number; name: string; color: string }) {
  const ty = STORE_TYPES[typeIdx]; const I = ty.icon; const t = T[lang];
  return (
    <div className="wl-bs" key={typeIdx}>
      <div className="wl-bs-nav"><b style={{ color }}>{name}</b><span className="wl-bs-search">{t.searchPh}</span><span className="wl-bs-cart" style={{ background: color }}><ShoppingCart size={12} /></span></div>
      <div className="wl-bs-cats">{t.cats.map((c, i) => <span key={c} style={i === 0 ? { background: color, color: "#fff" } : undefined}>{c}</span>)}</div>
      <div className="wl-bs-banner" style={{ background: color }}><I size={30} /><span>{ty[lang]}</span></div>
      <div className="wl-bs-grid">
        {ty.items[lang].map(([nm, pr], i) => (
          <div key={nm as string} className="wl-bs-p"><div style={{ background: TINTS[i] }}><I size={22} color={color} /></div><b>{nm}</b><i>{num(pr as number, lang)} ₪</i></div>
        ))}
      </div>
    </div>
  );
}

function BuilderScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [typeIdx, setTypeIdx] = useState(1);
  const [shop, setShop] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const shopName = shop.trim() || t.defName;
  const designLink: WaContext = { kind: "design", type: STORE_TYPES[typeIdx].ar, name: shop.trim() || "متجري", color: COLORS[colorIdx].ar };
  const win = useRef<HTMLDivElement>(null);
  const onP = (p: number) => { if (win.current) win.current.style.transform = `perspective(1400px) rotateX(${(8 * (1 - clamp(p / .5))).toFixed(2)}deg)`; };
  const slug = (shop.trim() || (lang === "ar" ? "متجري" : "mystore")).replace(/\s+/g, "");
  return (
    <Scene alt loose onP={onP}>
      <h2 className="wl-scene-h">{t.tryTitle}</h2>
      <div className="wl-builder2">
        <div className="wl-controls">
          <div className="wl-step wl-glass">
            <h3><span>{num(1, lang)}</span>{t.s1}</h3>
            <div className="wl-chips">{STORE_TYPES.map((s, i) => <button key={s.id} type="button" className="wl-chip" aria-pressed={typeIdx === i} onClick={() => setTypeIdx(i)}>{s[lang]}</button>)}</div>
          </div>
          <div className="wl-step wl-glass">
            <h3><span>{num(2, lang)}</span>{t.s2}</h3>
            <input className="wl-input" value={shop} maxLength={24} placeholder={t.namePh} onChange={(e) => setShop(e.target.value)} />
          </div>
          <div className="wl-step wl-glass">
            <h3><span>{num(3, lang)}</span>{t.s3}</h3>
            <div className="wl-dots">{COLORS.map((c, i) => <button key={c.id} type="button" className="wl-dot" aria-label={c[lang]} aria-pressed={colorIdx === i} style={{ background: c.hex }} onClick={() => setColorIdx(i)} />)}</div>
          </div>
          <WaButton ctx={designLink} label={t.sendDesign} name="design" />
        </div>
        <div className="wl-winwrap">
          <div className="wl-win" ref={win}>
            <div className="wl-win-bar"><i /><i /><i /><span>{slug}.ps</span></div>
            <div className="wl-win-body"><BrowserStore lang={lang} typeIdx={typeIdx} name={shopName} color={COLORS[colorIdx].hex} /></div>
          </div>
          <div className="wl-win-glow" aria-hidden />
          <p className="wl-mut wl-small">{t.bothDevices}</p>
        </div>
      </div>
    </Scene>
  );
}

/* المشهد ٣ — المنظر المتفكك */
function ExplodedScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(isMobileW()), []);
  const iso = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const nums = useRef<(HTMLElement | null)[]>([]);
  const note = useRef<HTMLParagraphElement>(null);
  const ids = mobile ? [0, 1, 3] : [0, 1, 2, 3];
  const TOT = [4850, 1230, 3620];
  const onP = (p: number) => {
    const tilt = ease(clamp(p / .3)), sep = ease(clamp((p - .28) / .4)), lab = clamp((p - .55) / .2), cnt = ease(clamp((p - .5) / .3));
    const rx = (mobile ? 42 : 55) * tilt, rz = (mobile ? -22 : -30) * tilt, gap = mobile ? 70 : 88;
    if (iso.current) iso.current.style.transform = `rotateX(${rx.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
    const L = ids.length;
    layers.current.forEach((el, i) => {
      if (!el) return;
      el.style.transform = `translateZ(${((L - 1 - i) * gap * sep).toFixed(1)}px)`;
      el.style.setProperty("--lab", lab.toFixed(2));
      el.style.opacity = i === 0 || sep > .02 ? "1" : "0";
    });
    nums.current.forEach((el, i) => { if (el) el.textContent = num(Math.round(TOT[i] * cnt).toLocaleString("en-US"), lang); });
    if (note.current) note.current.style.opacity = String(clamp((p - .8) / .12));
  };
  const body = (id: number) => {
    if (id === 0) return <><div className="wl-ly-head">{t.defName}</div><div className="wl-ly-grid">{[0, 1, 2, 3].map((k) => <span key={k} style={{ background: TINTS[k] }} />)}</div></>;
    if (id === 1) return <div className="wl-ly-orders">{t.statuses.map(([s, c], k) => <span key={s} style={{ background: `${c}22`, color: c }}>#{num(1042 - k, lang)} {s}</span>)}</div>;
    if (id === 2) return <div className="wl-ly-bars">{[70, 45, 88, 12, 60].map((h, k) => <span key={k} className={k === 3 ? "low" : ""} style={{ height: `${h}%` }}>{k === 3 && <em>{t.stockShort}</em>}</span>)}</div>;
    return <div className="wl-ly-kpi">{[t.sales, t.exp, t.profit].map((l, k) => <div key={l}><b ref={(e) => (nums.current[k] = e)}>{num(TOT[k].toLocaleString("en-US"), lang)}</b><small>{l} ₪</small></div>)}</div>;
  };
  return (
    <Scene onP={onP}>
      <h2 className="wl-scene-h">{t.insideTitle}</h2>
      <div className="wl-isostage" aria-hidden>
        <div className="wl-iso" ref={iso}>
          {ids.map((id, i) => (
            <div key={id} className="wl-ly" ref={(e) => (layers.current[i] = e)}>
              {body(id)}
              <span className="wl-ly-label">{t.layers[id]}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="wl-scene-p strong" ref={note}>{t.pkgNote}</p>
    </Scene>
  );
}

/* المشهد ٤ — الجزيئات */
async function sampleIcon(Icon: any, n: number, size = 200): Promise<Float32Array> {
  const svg = renderToStaticMarkup(<Icon size={size} strokeWidth={1.7} color="#000" />);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d")!; x.drawImage(img, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size).data; const px: number[] = [];
  for (let i = 0; i < size * size; i++) if (d[i * 4 + 3] > 90) px.push(i);
  const out = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) { const i = px[(Math.random() * px.length) | 0] || 0; out[k * 2] = (i % size) / size - .5; out[k * 2 + 1] = Math.floor(i / size) / size - .5; }
  return out;
}

function ParticlesScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const sec = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const pRef = useRef(0);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const onP = (p: number) => { pRef.current = p; };
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const N = isMobileW() ? 500 : 1200, still = reducedMotion();
    let shapes: Float32Array[] = [], raf = 0, visible = false, dead = false;
    const nx = new Float32Array(N), ny = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()); nx[i] = Math.cos(a) * r; ny[i] = Math.sin(a) * r; ph[i] = Math.random() * 6.283; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; };
    resize(); window.addEventListener("resize", resize);
    const draw = (now: number) => {
      raf = 0;
      const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
      const S = Math.min(W, H) * .78, ox = (W - S) / 2, oy = (H - S) / 2;
      // صندوق سلكي وخطوط قياس
      ctx.strokeStyle = "rgba(42,34,28,.28)"; ctx.lineWidth = dpr; ctx.strokeRect(ox, oy, S, S);
      ctx.strokeStyle = "rgba(42,34,28,.18)"; ctx.beginPath();
      ctx.moveTo(ox, oy - 12 * dpr); ctx.lineTo(ox + S, oy - 12 * dpr); ctx.moveTo(ox - 12 * dpr, oy); ctx.lineTo(ox - 12 * dpr, oy + S);
      for (let k = 0; k <= 4; k++) { const v = (S / 4) * k; ctx.moveTo(ox + v, oy - 16 * dpr); ctx.lineTo(ox + v, oy - 8 * dpr); ctx.moveTo(ox - 16 * dpr, oy + v); ctx.lineTo(ox - 8 * dpr, oy + v); }
      ctx.stroke();
      ctx.fillStyle = "rgba(140,127,112,.9)"; ctx.font = `${10 * dpr}px Cairo, sans-serif`; ctx.textAlign = "center";
      ctx.fillText("1200", ox + S / 2, oy - 20 * dpr); ctx.fillText("1:1", ox + S - 14 * dpr, oy + S + 16 * dpr);
      ctx.save(); ctx.translate(ox - 22 * dpr, oy + S / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("1200", 0, 0); ctx.restore();
      if (shapes.length === 5) {
        const s = pRef.current * 4, a = Math.min(3, Math.floor(s)), b = Math.min(4, a + 1);
        const f = s >= 4 ? 1 : ease(clamp((s - a - .35) / .65));
        const cur = f < .5 ? a : b;
        if (cur !== idxRef.current) { idxRef.current = cur; setIdx(cur); }
        const A = shapes[a], B = shapes[b], amp = Math.sin(Math.PI * f) * .42, jit = still ? 0 : .004;
        ctx.fillStyle = "#2A221C";
        const sz = 1.7 * dpr, sc = S * .8, cx = W / 2, cy = H / 2;
        for (let i = 0; i < N; i++) {
          const x = A[i * 2] + (B[i * 2] - A[i * 2]) * f + nx[i] * amp + Math.sin(now * .0015 + ph[i]) * jit;
          const y = A[i * 2 + 1] + (B[i * 2 + 1] - A[i * 2 + 1]) * f + ny[i] * amp + Math.cos(now * .0013 + ph[i]) * jit;
          ctx.fillRect(cx + x * sc - sz / 2, cy + y * sc - sz / 2, sz, sz);
        }
      }
      if (visible && !dead) raf = requestAnimationFrame(draw);
    };
    Promise.all(SITE_TYPES.map((st) => sampleIcon(st.icon, N))).then((r) => { if (dead) return; shapes = r; if (!raf) raf = requestAnimationFrame(draw); }).catch(() => { /* يبقى الصندوق فقط */ });
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); });
    io.observe(c);
    return () => { dead = true; io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  const jump = (i: number) => {
    const el = sec.current; if (!el) return;
    if (reducedMotion()) { pRef.current = i / 4; return; }
    const top = el.getBoundingClientRect().top + window.scrollY;
    const d = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + Math.max(0, d) * Math.min(1, i / 4 + (i < 4 ? .01 : 0)), behavior: "smooth" });
  };
  const st = SITE_TYPES[idx];
  return (
    <Scene alt sref={sec} onP={onP}>
      <h2 className="wl-scene-h">{t.typesTitle}</h2>
      <div className="wl-pt">
        <canvas ref={cv} className="wl-pt-cv" aria-hidden />
        <div className="wl-pt-info" aria-live="polite">
          <h3 key={idx} className="wl-swap">{st[lang][0]}</h3>
          <p key={`d${idx}`} className="wl-swap">{st[lang][1]}</p>
          <a className="wl-btn2 wl-pt-btn" href={buildWhatsAppLink({ kind: "type", site: st.wa })} onClick={() => trackContact(`type:${st.wa}`)}>
            <MessageCircle size={16} className="wl-wa-ic" />{t.want}
          </a>
        </div>
      </div>
      <div className="wl-pt-strip">
        {SITE_TYPES.map((s, i) => <button key={s.wa} type="button" aria-pressed={idx === i} onClick={() => jump(i)}><s.icon size={15} />{s[lang][0]}</button>)}
      </div>
    </Scene>
  );
}

/* المشهد ٥ — قمر براند */
function QamarScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const view = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null), win = useRef<HTMLDivElement>(null), bg = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState("/websites/qamar-desktop.webp");
  const onP = (p: number) => {
    const v = view.current, im = img.current;
    if (v && im) { const d = Math.max(0, im.offsetHeight - v.clientHeight); im.style.transform = `translate3d(0,${(-d * ease(clamp((p - .05) / .85))).toFixed(1)}px,0)`; }
    if (win.current) win.current.style.transform = `perspective(1600px) rotateX(${(6 * (1 - clamp(p / .4))).toFixed(2)}deg) rotateY(${lang === "ar" ? 4 : -4}deg)`;
    if (bg.current) bg.current.style.transform = `translate3d(0,${((p - .5) * -70).toFixed(1)}px,0) scale(1.1)`;
  };
  return (
    <Scene onP={onP}>
      <img ref={bg} className="wl-q-bg" src="/websites/og.jpg" alt="" aria-hidden loading="lazy" decoding="async" />
      <div className="wl-q">
        <div className="wl-q-text">
          <h2 className="wl-scene-h start">{t.liveTitle}</h2>
          <p className="wl-live">{t.liveText}</p>
          <div className="wl-row">
            <a className="wl-btn2" href="https://qamarbrand.com"><ExternalLink size={16} />{t.visit}</a>
            <a className="wl-btn2" href="https://www.instagram.com/qamar_brand1/"><Instagram size={16} />{t.insta}</a>
          </div>
        </div>
        <div className="wl-win big" ref={win}>
          <div className="wl-win-bar"><i /><i /><i /><span>qamarbrand.com</span></div>
          <div className="wl-q-view" ref={view}>
            <img ref={img} src={src} alt="Qamar Brand" loading="lazy" decoding="async"
              onLoad={(e) => { e.currentTarget.style.maxWidth = `${e.currentTarget.naturalWidth}px`; }}
              onError={() => { if (src !== qamarShot) setSrc(qamarShot); }} />
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* المشهد ٦ — خط يُرسم */
function LineScene({ lang }: { lang: Lang }) {
  const t = T[lang];
  const pathH = useRef<SVGPathElement>(null), pathV = useRef<SVGPathElement>(null);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  const onP = (p: number) => {
    const d = clamp(p / .85);
    [pathH.current, pathV.current].forEach((el) => el && (el.style.strokeDashoffset = String(1 - d)));
    steps.current.forEach((el, i) => el && el.classList.toggle("on", d >= i / 3 - .02));
  };
  return (
    <Scene alt onP={onP}>
      <h2 className="wl-scene-h">{t.howTitle}</h2>
      <div className="wl-line">
        <svg className="wl-line-h" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden>
          <path ref={pathH} pathLength={1} d="M125 60 C 250 10, 250 110, 375 60 S 500 10, 625 60 S 750 110, 875 60" />
        </svg>
        <svg className="wl-line-v" viewBox="0 0 60 1000" preserveAspectRatio="none" aria-hidden>
          <path ref={pathV} pathLength={1} d="M30 60 C 5 200, 55 250, 30 375 S 5 500, 30 625 S 55 750, 30 940" />
        </svg>
        <ol>
          {t.how.map((h, i) => (
            <li key={h} ref={(e) => (steps.current[i] = e)} style={{ "--i": i } as React.CSSProperties}>
              <b>{num(i + 1, lang)}</b><span>{h}</span>
            </li>
          ))}
        </ol>
      </div>
    </Scene>
  );
}

/* المشهد ٧ — الختام */
function FinalScene({ lang, sref }: { lang: Lang; sref: React.RefObject<HTMLElement> }) {
  const t = T[lang];
  const N = 28;
  const card = useRef<HTMLDivElement>(null);
  const strips = useRef<(HTMLSpanElement | null)[]>([]);
  const seeds = useMemo(() => Array.from({ length: N }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 180 - 90]), []);
  const onP = (p: number) => {
    const c = card.current; if (!c) return;
    const w = c.offsetWidth + 34, h = c.offsetHeight + 34, per = 2 * (w + h);
    const m = ease(clamp(p / .6));
    strips.current.forEach((el, i) => {
      if (!el) return;
      let d = (i / N) * per, x: number, y: number, r: number;
      if (d < w) { x = -w / 2 + d; y = -h / 2; r = 90; }
      else if ((d -= w) < h) { x = w / 2; y = -h / 2 + d; r = 0; }
      else if ((d -= h) < w) { x = w / 2 - d; y = h / 2; r = 90; }
      else { d -= w; x = -w / 2; y = h / 2 - d; r = 0; }
      const [sx, sy, sr] = seeds[i];
      const X = sx * 520 + (x - sx * 520) * m, Y = sy * 420 + (y - sy * 420) * m, R = sr + (r - sr) * m;
      el.style.transform = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0) rotate(${R.toFixed(1)}deg)`;
      el.style.opacity = String(.35 + .65 * m);
    });
  };
  return (
    <Scene sref={sref} className="wl-final2" onP={onP}>
      <div className="wl-fwrap">
        {Array.from({ length: N }, (_, i) => <span key={i} className="wl-fstrip" ref={(e) => (strips.current[i] = e)} style={{ background: lerpHex(SAND, COFFEE, (i % 7) / 7) }} aria-hidden />)}
        <div className="wl-fcard wl-glass" ref={card}>
          <h2>{t.finalTitle}</h2>
          <Price lang={lang} />
          <CouponBox lang={lang} />
          <WaButton ctx={{ kind: "default" }} label={t.cta} name="final" />
          <Countdown lang={lang} />
        </div>
      </div>
    </Scene>
  );
}

/* ===== الصفحة ===== */
export default function WebsitesLandingPage() {
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem("wl-lang") as Lang) || "ar"; } catch { return "ar"; } });
  const t = T[lang];
  useMeta(lang);
  usePixel();
  useEffect(() => { getRef(); }, []);
  const switchLang = () => { const n: Lang = lang === "ar" ? "en" : "ar"; setLang(n); try { localStorage.setItem("wl-lang", n); } catch { /* */ } };
  const ESP = "#2A221C";

  const heroRef = useRef<HTMLElement>(null);
  const finalRef = useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const [atFinal, setAtFinal] = useState(false);
  useEffect(() => {
    const a = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0));
    const b = new IntersectionObserver(([e]) => setAtFinal(e.isIntersecting && e.intersectionRatio > .35), { threshold: [0, .35, .6] });
    heroRef.current && a.observe(heroRef.current);
    finalRef.current && b.observe(finalRef.current);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);

  return (
    <div className="wl" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="wl-beam" aria-hidden />
      <header className="wl-top">
        <img src={logo} alt="UNIFY" />
        <button className="wl-lang wl-glass" onClick={switchLang}>{t.lang}</button>
      </header>

      <section className="wl-hero" ref={heroRef}>
        <div className="wl-wrap wl-hero-grid">
          <div className="wl-hero-copy">
            <span className="wl-eyebrow wl-glass">{t.eyebrow}</span>
            <h1 className="wl-h1">{t.h1}</h1>
            <p className="wl-sub">{t.sub}</p>
            <Price lang={lang} />
            <CouponBox lang={lang} />
            <WaButton ctx={{ kind: "default" }} label={t.cta} name="hero" />
          </div>
          <Stage lang={lang} typeIdx={1} intro screen={<StoreScreen lang={lang} typeIdx={1} name={lang === "ar" ? "متجري" : "My Store"} color={ESP} />} />
        </div>
      </section>

      <RibbonScene lang={lang} />
      <BuilderScene lang={lang} />
      <ExplodedScene lang={lang} />
      <ParticlesScene lang={lang} />
      <QamarScene lang={lang} />
      <LineScene lang={lang} />
      <FinalScene lang={lang} sref={finalRef} />

      <footer className="wl-foot">{t.foot}</footer>

      <div className={`wl-sticky ${pastHero && !atFinal ? "" : "hide"}`} aria-hidden={!(pastHero && !atFinal)}>
        <WaButton ctx={{ kind: "default" }} label={t.sticky} name="sticky" />
      </div>
    </div>
  );
}
