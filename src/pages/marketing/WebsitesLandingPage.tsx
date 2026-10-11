import { useEffect, useMemo, useRef, useState } from "react";
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
    statuses: [["جديدة", "#38bdf8"], ["قيد التجهيز", "#f59e0b"], ["تم الشحن", "#a78bfa"], ["تم التسليم", "#22c55e"], ["مرتجعة", "#f87171"]],
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
    desc: "متجر إلكتروني كامل بواجهة للزباين ولوحة تحكم للطلبيات والمخزون والحسابات. عرض خاص مع كوبون UNIFY500.",
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
    statuses: [["New", "#38bdf8"], ["Preparing", "#f59e0b"], ["Shipped", "#a78bfa"], ["Delivered", "#22c55e"], ["Returned", "#f87171"]],
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
    desc: "A complete online store with a customer storefront and a dashboard for orders, stock and accounts. Special offer with coupon UNIFY500.",
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
      <MessageCircle size={20} />{label}
    </a>
  );
}

function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0, visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; };
    resize(); window.addEventListener("resize", resize);
    const pts = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006 }));
    const tick = () => {
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x = (p.x + p.vx + 1) % 1; p.y = (p.y + p.vy + 1) % 1;
        ctx.fillStyle = "rgba(125,211,252,.55)";
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 1.4 * dpr, 0, 6.3); ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = (pts[i].x - pts[j].x) * W, dy = (pts[i].y - pts[j].y) * H, d = Math.hypot(dx, dy);
        if (d < 110 * dpr) { ctx.strokeStyle = `rgba(56,189,248,${0.18 * (1 - d / (110 * dpr))})`; ctx.beginPath(); ctx.moveTo(pts[i].x * W, pts[i].y * H); ctx.lineTo(pts[j].x * W, pts[j].y * H); ctx.stroke(); }
      }
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(tick); });
    io.observe(c);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="wl-canvas" aria-hidden />;
}

const TINTS = ["#e0f2fe", "#fce7f3", "#dcfce7", "#fef3c7"];

function StoreScreen({ lang, typeIdx, name, color, build }: { lang: Lang; typeIdx: number; name: string; color: string; build?: boolean }) {
  const t = STORE_TYPES[typeIdx];
  const Icon = t.icon;
  return (
    <div className={`wl-screen ${build ? "wl-build" : ""}`}>
      <div className="wl-s-head b1" style={{ background: color }}>{name}</div>
      <div className="wl-s-cats b2">{T[lang].cats.map((c, i) => <span key={c} style={i === 0 ? { background: color, color: "#fff" } : undefined}>{c}</span>)}</div>
      <div className="wl-s-grid">
        {t.items[lang].map(([n, p], i) => (
          <div className={`wl-p b${3 + i}`} key={n as string}>
            <div className="wl-p-img" style={{ background: TINTS[i] }}><Icon size={28} color={color} /></div>
            <b>{n}</b><i>{num(p as number, lang)} ₪</i>
          </div>
        ))}
      </div>
      <div className="wl-s-cart b7" style={{ background: color }}><ShoppingCart size={13} style={{ verticalAlign: "-2px" }} /> {T[lang].cart}</div>
      {build && <div className="wl-toast b8"><Bell size={13} />{T[lang].toast}</div>}
    </div>
  );
}

function CountUp({ to, lang, run }: { to: number; lang: Lang; run: boolean }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!run || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
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
      <p style={{ color: "var(--mut)" }}>{t.ends}</p>
      <div className="wl-count">{parts.map(([n, l]) => <div key={l}><b>{num(String(n).padStart(2, "0"), lang)}</b><small>{l}</small></div>)}</div>
    </div>
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

  // builder
  const [typeIdx, setTypeIdx] = useState(1);
  const [shop, setShop] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const shopName = shop.trim() || t.defName;
  const designLink: WaContext = { kind: "design", type: STORE_TYPES[typeIdx].ar, name: shop.trim() || "متجري", color: COLORS[colorIdx].ar };

  // flip
  const flipRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = flipRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > .6 && !seen) { setSeen(true); setTimeout(() => setFlipped(true), 700); }
    }, { threshold: [0, .6, 1] });
    io.observe(el); return () => io.disconnect();
  }, [seen]);

  // sticky bar
  const heroRef = useRef<HTMLElement>(null);
  const finalRef = useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const [atFinal, setAtFinal] = useState(false);
  useEffect(() => {
    const a = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0));
    const b = new IntersectionObserver(([e]) => setAtFinal(e.isIntersecting));
    heroRef.current && a.observe(heroRef.current);
    finalRef.current && b.observe(finalRef.current);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);

  return (
    <div className="wl" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="wl-top">
        <img src={logo} alt="UNIFY" />
        <button className="wl-lang" onClick={switchLang}>{t.lang}</button>
      </header>

      {/* أ — الهيرو */}
      <section className="wl-hero" ref={heroRef}>
        <HeroCanvas />
        <div className="wl-wrap wl-hero-grid">
          <div>
            <span className="wl-eyebrow">{t.eyebrow}</span>
            <h1 className="wl-h1">{t.h1}</h1>
            <p className="wl-sub">{t.sub}</p>
            <Price lang={lang} />
            <CouponBox lang={lang} />
            <WaButton ctx={{ kind: "default" }} label={t.cta} name="hero" />
          </div>
          <div className="wl-phone"><StoreScreen lang={lang} typeIdx={1} name={lang === "ar" ? "متجري" : "My Store"} color="#0D1B2E" build /></div>
        </div>
      </section>

      {/* ب — جرّب بنفسك */}
      <section className="wl-sec wl-reveal">
        <div className="wl-wrap">
          <h2>{t.tryTitle}</h2>
          <div className="wl-builder">
            <div>
              <div className="wl-step">
                <h3><span>{num(1, lang)}</span>{t.s1}</h3>
                <div className="wl-chips">
                  {STORE_TYPES.map((s, i) => <button key={s.id} type="button" className="wl-chip" aria-pressed={typeIdx === i} onClick={() => setTypeIdx(i)}>{s[lang]}</button>)}
                </div>
              </div>
              <div className="wl-step">
                <h3><span>{num(2, lang)}</span>{t.s2}</h3>
                <input className="wl-input" value={shop} maxLength={24} placeholder={t.namePh} onChange={(e) => setShop(e.target.value)} />
              </div>
              <div className="wl-step">
                <h3><span>{num(3, lang)}</span>{t.s3}</h3>
                <div className="wl-dots">
                  {COLORS.map((c, i) => <button key={c.id} type="button" className="wl-dot" aria-label={c[lang]} aria-pressed={colorIdx === i} style={{ background: c.hex }} onClick={() => setColorIdx(i)} />)}
                </div>
              </div>
              <WaButton ctx={designLink} label={t.sendDesign} name="design" />
            </div>
            <div className="wl-phone"><StoreScreen lang={lang} typeIdx={typeIdx} name={shopName} color={COLORS[colorIdx].hex} /></div>
          </div>
        </div>
      </section>

      {/* ج — من برّا ومن جوّا */}
      <section className="wl-sec wl-reveal">
        <div className="wl-wrap">
          <h2>{t.insideTitle}</h2>
          <div ref={flipRef} className={`wl-flip ${flipped ? "on" : ""}`}>
            <div className="wl-flip-in">
              <div className="wl-face"><div className="wl-phone"><StoreScreen lang={lang} typeIdx={1} name={lang === "ar" ? "متجري" : "My Store"} color="#0D1B2E" /></div></div>
              <div className="wl-face back"><div className="wl-phone"><div className="wl-screen"><div className="wl-dash">
                <h4>{t.dash}</h4>
                <div className="wl-kpis">
                  <div><b><CountUp to={4850} lang={lang} run={flipped} /></b><small>{t.sales} ₪</small></div>
                  <div><b><CountUp to={1230} lang={lang} run={flipped} /></b><small>{t.exp} ₪</small></div>
                  <div><b><CountUp to={3620} lang={lang} run={flipped} /></b><small>{t.profit} ₪</small></div>
                </div>
                {t.statuses.map(([s, c], i) => (
                  <div className="wl-order" key={s}>
                    <span>#{num(1042 - i, lang)}</span>
                    <span className="wl-badge" style={{ background: `${c}33`, color: c }}>{s}</span>
                  </div>
                ))}
                <div className="wl-alert"><AlertTriangle size={13} />{t.stock}</div>
              </div></div></div></div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button type="button" className="wl-btn2" onClick={() => setFlipped((f) => !f)}><RotateCw size={16} />{flipped ? t.seeOutside : t.seeInside}</button>
          </div>
          <div className="wl-cards3">
            {[ClipboardList, Boxes, Calculator].map((I, i) => (
              <div className="wl-card" key={i}><I size={26} /><h3>{t.cards[i][0]}</h3><p>{t.cards[i][1]}</p></div>
            ))}
          </div>
          <p className="wl-note">{t.inclNote}</p>
        </div>
      </section>

      {/* د — قمر براند */}
      <section className="wl-sec wl-reveal">
        <div className="wl-wrap">
          <h2>{t.liveTitle}</h2>
          <div className="wl-qamar">
            <div className="wl-browser">
              <div className="wl-bar"><i /><i /><i /><span style={{ marginInlineStart: 8 }}>qamarbrand.com</span></div>
              <div className="wl-view"><img src={qamarShot} alt="Qamar Brand" loading="lazy" decoding="async" /></div>
            </div>
            <div>
              <p style={{ fontSize: 17, lineHeight: 1.9 }}>{t.liveText}</p>
              <div className="wl-row">
                <a className="wl-btn2" href="https://qamarbrand.com"><ExternalLink size={16} />{t.visit}</a>
                <a className="wl-btn2" href="https://www.instagram.com/qamar_brand1/"><Instagram size={16} />{t.insta}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* هـ — الأنواع */}
      <section className="wl-sec wl-reveal">
        <div className="wl-wrap">
          <h2>{t.typesTitle}</h2>
          <div className="wl-types">
            {SITE_TYPES.map((s, i) => (
              <a key={s.wa} className={`wl-type ${i === 0 ? "big" : ""}`} href={buildWhatsAppLink({ kind: "type", site: s.wa })} onClick={() => trackContact(`type:${s.wa}`)}>
                <s.icon size={i === 0 ? 34 : 26} /><h3>{s[lang][0]}</h3><p>{s[lang][1]}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* و — كيف بنشتغل */}
      <section className="wl-sec wl-reveal">
        <div className="wl-wrap">
          <h2>{t.howTitle}</h2>
          <ol className="wl-steps">{t.how.map((h, i) => <li key={h}><b>{num(i + 1, lang)}</b>{h}</li>)}</ol>
        </div>
      </section>

      {/* ز — الختام */}
      <section className="wl-sec wl-final" ref={finalRef}>
        <div className="wl-wrap">
          <h2>{t.finalTitle}</h2>
          <Price lang={lang} />
          <CouponBox lang={lang} />
          <WaButton ctx={{ kind: "default" }} label={t.cta} name="final" />
          <Countdown lang={lang} />
        </div>
      </section>

      <footer className="wl-foot">{t.foot}</footer>

      {/* ح — الشريط الثابت */}
      <div className={`wl-sticky ${pastHero && !atFinal ? "" : "hide"}`} aria-hidden={!(pastHero && !atFinal)}>
        <WaButton ctx={{ kind: "default" }} label={t.sticky} name="sticky" />
      </div>
    </div>
  );
}
