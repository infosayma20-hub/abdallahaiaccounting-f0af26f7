import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ShoppingBag, Package, Building2, UtensilsCrossed, CalendarCheck, Smartphone, Zap, Search, Copy, Check, MessageCircle } from "lucide-react";
import "./websites.css";

const WA_NUMBER = "972594336699";
const COUPON = "UNIFY500";
const OLD_PRICE = 1200;
const NEW_PRICE = 500;

type Lang = "ar" | "en";

const T = {
  ar: {
    nav: "مواقع يونيفاي",
    chip: "عرض خاص لمتابعي الريل",
    h1a: "موقعك الإلكتروني",
    h1b: "بشكل خرافي",
    sub: "متاجر إلكترونية، مواقع منتجات، ومواقع شركات بتصميم فخم وحركة ناعمة — جاهز يبيع عنك 24 ساعة.",
    cta: "احجز موقعك على واتساب",
    seeOffer: "شوف العرض",
    couponTitle: "كوبون خصم يونيفاي",
    couponSub: "استخدم الكوبون واحصل على موقعك الكامل بـ",
    copy: "انسخ الكوبون",
    copied: "تم النسخ",
    claim: "استخدم الكوبون الآن",
    whatTitle: "شو بنقدر نبنيلك؟",
    whatSub: "قلّي شو بدك… وأنا بعطيك.",
    items: [
      [ShoppingBag, "متجر إلكتروني", "سلة، دفع، طلبات وتتبع — متجرك جاهز يبيع."],
      [Package, "موقع منتجات", "اعرض منتجاتك بصور وحركة تخلي الزبون يطلب."],
      [Building2, "موقع شركة", "هوية فخمة بتبني ثقة من أول ثانية."],
      [UtensilsCrossed, "منيو مطعم", "منيو رقمي بباركود وطلب مباشر."],
      [CalendarCheck, "حجوزات", "مواعيد وحجوزات أونلاين للعيادات والصالونات."],
      [Smartphone, "يناسب الجوال", "كل موقع مصمم للجوال أولًا."],
    ],
    whyTitle: "ليش يونيفاي؟",
    why: [
      [Zap, "سريع جدًا", "تحميل فوري وتجربة سلسة."],
      [Search, "جاهز لجوجل", "تهيئة لمحركات البحث من أول يوم."],
      [Sparkles2(), "حركة وتصميم", "موشن احترافي بيلفت النظر."],
    ],
    stepsTitle: "كيف بنشتغل؟",
    steps: ["بتراسلنا على واتساب", "بنبعتلك فيديو لأعمالنا", "بنصمم موقعك", "بنطلقه وبتبلّش تبيع"],
    marquee: ["متاجر", "منتجات", "شركات", "مطاعم", "عيادات", "صالونات", "عقارات", "مدارس"],
    finalTitle: "جاهز يكون إلك موقع خرافي؟",
    finalSub: "اكبس وابعتلنا — موظفنا بستقبلك بفيديو لأعمالنا.",
    footer: "يونيفاي — صُنع في فلسطين",
    waMsg: `مرحبا، شفت الريل وبدي موقع إلكتروني بكوبون ${COUPON} (${NEW_PRICE}$)`,
    toggle: "EN",
  },
  en: {
    nav: "Unify Websites",
    chip: "Exclusive offer for reel viewers",
    h1a: "Your website,",
    h1b: "made legendary",
    sub: "E‑commerce stores, product sites and company websites with premium design and smooth motion — selling for you 24/7.",
    cta: "Book on WhatsApp",
    seeOffer: "See the offer",
    couponTitle: "Unify discount coupon",
    couponSub: "Use the coupon and get your full website for",
    copy: "Copy coupon",
    copied: "Copied",
    claim: "Use the coupon now",
    whatTitle: "What can we build?",
    whatSub: "Tell me what you want… I'll make it happen.",
    items: [
      [ShoppingBag, "Online store", "Cart, checkout, orders and tracking."],
      [Package, "Product site", "Showcase products with visuals that convert."],
      [Building2, "Company site", "A premium identity that builds trust instantly."],
      [UtensilsCrossed, "Restaurant menu", "QR digital menu with direct ordering."],
      [CalendarCheck, "Bookings", "Online appointments for clinics and salons."],
      [Smartphone, "Mobile first", "Every site is designed for phones first."],
    ],
    whyTitle: "Why Unify?",
    why: [
      [Zap, "Blazing fast", "Instant loading, smooth experience."],
      [Search, "Google ready", "SEO setup from day one."],
      [Sparkles2(), "Motion & design", "Pro motion that grabs attention."],
    ],
    stepsTitle: "How it works",
    steps: ["Message us on WhatsApp", "Get a video of our work", "We design your site", "Launch and start selling"],
    marquee: ["Stores", "Products", "Companies", "Restaurants", "Clinics", "Salons", "Real estate", "Schools"],
    finalTitle: "Ready for a legendary website?",
    finalSub: "Tap and message us — our team will welcome you with a video of our work.",
    footer: "Unify — Made in Palestine",
    waMsg: `Hi, I saw the reel and want a website with coupon ${COUPON} ($${NEW_PRICE})`,
    toggle: "ع",
  },
} as const;

function Sparkles2() {
  // Local star icon (avoid generic sparkles)
  const Star = (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={p.className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
  return Star;
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } }),
};

export default function WebsitesLandingPage() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("wl-lang") as Lang) || "ar");
  const [copied, setCopied] = useState(false);
  const t = T[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const mockY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const mockRot = useTransform(scrollYProgress, [0, 1], [8, -4]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(t.waMsg)}`;

  useEffect(() => {
    localStorage.setItem("wl-lang", lang);
    document.title = lang === "ar" ? "مواقع يونيفاي — موقعك بـ500$ مع كوبون الخصم" : "Unify Websites — Your site for $500 with coupon";
    const m = document.querySelector('meta[name="description"]');
    m?.setAttribute("content", lang === "ar" ? "متاجر إلكترونية ومواقع منتجات وشركات بتصميم فخم. كوبون خصم يونيفاي يخلي موقعك بـ500$." : "Premium online stores, product and company websites. Unify coupon makes your site $500.");
  }, [lang]);

  const copyCoupon = async () => {
    try { await navigator.clipboard.writeText(COUPON); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="wl" dir={dir}>
      {/* Nav */}
      <nav className="wl-nav fixed top-0 inset-x-0 z-50">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <span className="text-lg font-black">{t.nav}<span className="wl-neon">.</span></span>
          <div className="flex items-center gap-2">
            <button className="wl-btn-ghost" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label="language">{t.toggle}</button>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="wl-btn !py-2 !px-4 text-sm">
              <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">{t.cta}</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} className="relative min-h-[100dvh] flex items-center pt-20 pb-16">
        <div className="absolute inset-0 wl-grid" />
        <motion.div className="wl-orb wl-orb-a w-[420px] h-[420px] -top-20 start-[-80px]" animate={reduce ? {} : { x: [0, 60, 0], y: [0, 40, 0] }} transition={{ duration: 14, repeat: Infinity }} />
        <motion.div className="wl-orb wl-orb-b w-[520px] h-[520px] bottom-[-120px] end-[-120px]" animate={reduce ? {} : { x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 16, repeat: Infinity }} />

        <div className="relative max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center w-full">
          <motion.div style={{ y: textY }} initial="hidden" animate="show">
            <motion.span variants={fadeUp} custom={0} className="wl-chip inline-block mb-6">{t.chip}</motion.span>
            <motion.h1 variants={fadeUp} custom={1} className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.1]">
              {t.h1a}<br /><span className="wl-gradient-text">{t.h1b}</span>
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="wl-muted text-lg mt-6 max-w-lg leading-relaxed">{t.sub}</motion.p>
            <motion.div variants={fadeUp} custom={3} className="flex flex-wrap items-center gap-4 mt-8">
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="wl-btn text-lg"><MessageCircle className="h-5 w-5" />{t.cta}</a>
              <a href="#offer" className="wl-btn-ghost !py-3 !px-6">{t.seeOffer}</a>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="mt-8 flex items-baseline gap-3">
              <span className="wl-muted text-2xl font-bold wl-strike">${OLD_PRICE}</span>
              <span className="text-5xl font-black wl-neon">${NEW_PRICE}</span>
            </motion.div>
          </motion.div>

          {/* Floating browser mockup */}
          <motion.div style={{ y: mockY, rotate: mockRot }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.3 }} className="relative">
            <div className="wl-browser">
              <div className="wl-bar flex items-center gap-2 px-4 py-3">
                <span className="wl-dot" /><span className="wl-dot" /><span className="wl-dot" />
                <div className="wl-skel h-5 flex-1 ms-3" />
              </div>
              <div className="p-5 space-y-4">
                <div className="wl-skel-neon h-28 w-full" />
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="space-y-2" animate={reduce ? {} : { y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}>
                      <div className="wl-skel h-20" />
                      <div className="wl-skel h-3 w-3/4" />
                      <div className="wl-skel-neon h-3 w-1/2" />
                    </motion.div>
                  ))}
                </div>
                <div className="wl-skel h-10 w-1/2" />
              </div>
            </div>
            <motion.div className="wl-card absolute -bottom-6 start-[-10px] px-4 py-3 flex items-center gap-2" animate={reduce ? {} : { y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity }}>
              <ShoppingBag className="h-5 w-5 wl-neon" /><span className="font-black text-sm">+128 {lang === "ar" ? "طلب" : "orders"}</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Marquee */}
      <div className="py-6 overflow-hidden border-y" style={{ borderColor: "hsl(var(--wl-neon) / .15)" }}>
        <div className="wl-marquee text-2xl font-black wl-muted">
          {[...t.marquee, ...t.marquee, ...t.marquee].map((m, i) => (
            <span key={i} className="flex items-center gap-3">{m}<span className="wl-neon">✦</span></span>
          ))}
        </div>
      </div>

      {/* Offer */}
      <section id="offer" className="max-w-4xl mx-auto px-5 py-24">
        <motion.div initial={{ opacity: 0, scale: 0.9, rotateX: 20 }} whileInView={{ opacity: 1, scale: 1, rotateX: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.7 }} className="wl-coupon p-8 sm:p-12 text-center">
          <p className="wl-chip inline-block">{t.couponTitle}</p>
          <p className="wl-muted mt-6 text-lg">{t.couponSub}</p>
          <div className="flex items-baseline justify-center gap-4 mt-3">
            <span className="wl-muted text-3xl font-bold wl-strike">${OLD_PRICE}</span>
            <motion.span className="text-7xl sm:text-8xl font-black wl-neon" initial={{ scale: 0.5 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 180, delay: 0.3 }}>${NEW_PRICE}</motion.span>
          </div>
          <button onClick={copyCoupon} className="mt-8 inline-flex items-center gap-3 rounded-2xl px-6 py-4 font-black text-2xl tracking-[0.25em]" style={{ border: "1px solid hsl(var(--wl-neon) / .5)", background: "hsl(var(--wl-bg))" }} dir="ltr">
            {COUPON}
            {copied ? <Check className="h-5 w-5 wl-neon" /> : <Copy className="h-5 w-5 wl-muted" />}
          </button>
          <p className="wl-muted text-sm mt-2">{copied ? t.copied : t.copy}</p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="wl-btn mt-8 text-lg"><MessageCircle className="h-5 w-5" />{t.claim}</a>
        </motion.div>
      </section>

      {/* What we build */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-12">
          <motion.h2 variants={fadeUp} className="text-4xl sm:text-5xl font-black">{t.whatTitle}</motion.h2>
          <motion.p variants={fadeUp} custom={1} className="wl-neon text-xl font-bold mt-3">{t.whatSub}</motion.p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {t.items.map(([Icon, title, desc], i) => (
            <motion.div key={title as string} variants={fadeUp} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }} whileHover={reduce ? {} : { y: -8, rotate: i % 2 ? 1 : -1 }} className="wl-card p-6">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center wl-step-num mb-4"><Icon className="h-6 w-6" /></div>
              <h3 className="text-xl font-black">{title as string}</h3>
              <p className="wl-muted mt-2 leading-relaxed">{desc as string}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="text-4xl font-black text-center mb-10">{t.whyTitle}</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {t.why.map(([Icon, title, desc], i) => (
            <motion.div key={title as string} variants={fadeUp} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }} className="wl-card p-8 text-center">
              <Icon className="h-10 w-10 wl-neon mx-auto" />
              <h3 className="text-xl font-black mt-4">{title as string}</h3>
              <p className="wl-muted mt-2">{desc as string}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <h2 className="text-4xl font-black text-center mb-12">{t.stepsTitle}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {t.steps.map((s, i) => (
            <motion.div key={s} variants={fadeUp} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }} className="wl-card p-6">
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-xl font-black wl-step-num">{i + 1}</div>
              <p className="font-bold text-lg mt-4">{s}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative px-5 py-28 text-center overflow-hidden">
        <div className="absolute inset-0 wl-grid" />
        <div className="wl-orb wl-orb-a w-[500px] h-[500px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} className="relative max-w-2xl mx-auto">
          <motion.h2 variants={fadeUp} className="text-4xl sm:text-6xl font-black leading-tight">{t.finalTitle}</motion.h2>
          <motion.p variants={fadeUp} custom={1} className="wl-muted text-lg mt-5">{t.finalSub}</motion.p>
          <motion.div variants={fadeUp} custom={2}>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="wl-btn text-xl mt-10"><MessageCircle className="h-6 w-6" />{t.cta}</a>
          </motion.div>
        </motion.div>
      </section>

      <footer className="text-center wl-muted text-sm py-8">{t.footer}</footer>

      {/* Floating WhatsApp */}
      <a href={waUrl} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="wl-float wl-btn wl-pulse !p-4">
        <MessageCircle className="h-7 w-7" />
      </a>
    </div>
  );
}
